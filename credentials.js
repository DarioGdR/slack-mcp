import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import os from 'os';

const HOME = os.homedir();
const DEFAULT_WORKSPACE = process.env.SLACK_WORKSPACE_URL || 'https://deliveryhero.slack.com/';

/**
 * Retrieves the Slack Safe Storage password from the macOS Keychain.
 * Supports standard Slack Desktop and App Store Slack variants.
 */
function getSlackKeychainPassword() {
  const commands = [
    '/usr/bin/security find-generic-password -s "Slack Safe Storage" -a "Slack" -g -w',
    '/usr/bin/security find-generic-password -s "Slack Safe Storage" -g -w',
    '/usr/bin/security find-generic-password -s "Slack Safe Storage" -a "Slack App Store Key" -g -w'
  ];
  for (const cmd of commands) {
    try {
      const pass = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      if (pass) return pass;
    } catch (_) {}
  }
  return null;
}

/**
 * Retrieves the Chrome Safe Storage password from the macOS Keychain.
 */
function getChromeKeychainPassword() {
  const commands = [
    '/usr/bin/security find-generic-password -s "Chrome Safe Storage" -a "Chrome" -g -w',
    '/usr/bin/security find-generic-password -s "Chrome Safe Storage" -g -w'
  ];
  for (const cmd of commands) {
    try {
      const pass = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      if (pass) return pass;
    } catch (_) {}
  }
  return null;
}

/**
 * Decrypts an Electron/Chromium cookie value using AES-128-CBC and PBKDF2.
 */
function decryptCookie(keychainPassword, encryptedHex) {
  try {
    const encryptedBytes = Buffer.from(encryptedHex, 'hex');
    if (encryptedBytes.length < 3) return null;
    
    // Electron/Chromium cookies on macOS are prefixed with 'v10'
    const prefix = encryptedBytes.subarray(0, 3).toString('utf8');
    if (prefix !== 'v10') {
      return encryptedBytes.toString('utf8');
    }
    
    const rawEncValue = encryptedBytes.subarray(3);
    const salt = Buffer.from('saltysalt', 'utf8');
    const iv = Buffer.from(' '.repeat(16), 'utf8');
    const iterations = 1003;
    const keySize = 16; // 128 bits
    
    const key = crypto.pbkdf2Sync(keychainPassword, salt, iterations, keySize, 'sha1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true);
    
    const decrypted = Buffer.concat([decipher.update(rawEncValue), decipher.final()]);
    // In Chromium/Electron on macOS, the decrypted payload starts with a 32-byte header/hash
    return decrypted.length > 32 ? decrypted.subarray(32).toString('utf8') : decrypted.toString('utf8');
  } catch (err) {
    return null;
  }
}

/**
 * Reads a Cookies SQLite database safely and decrypts the 'd' and 'd-s' cookies.
 * Uses a temp copy to avoid file-locking / WAL conflicts with running applications.
 */
function getCookiesFromDb(dbPath, keychainPassword) {
  if (!fs.existsSync(dbPath)) return null;
  
  const tmpDir = path.join(os.tmpdir(), `slack_cookies_${process.pid}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  
  try {
    const parentDir = path.dirname(dbPath);
    for (const file of ['Cookies', 'Cookies-wal', 'Cookies-shm']) {
      const src = path.join(parentDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(tmpDir, file));
      }
    }
    
    const query = "SELECT name, hex(encrypted_value) FROM cookies WHERE host_key LIKE '%.slack.com' AND name IN ('d', 'd-s') ORDER BY last_access_utc DESC;";
    const output = execSync(`/usr/bin/sqlite3 "${path.join(tmpDir, 'Cookies')}" "${query}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    
    let cookieD = null;
    let cookieDS = null;
    
    const lines = output.split('\n');
    for (const line of lines) {
      if (!line) continue;
      const parts = line.split('|');
      if (parts.length < 2) continue;
      
      const name = parts[0];
      const hexValue = parts[1];
      const decrypted = decryptCookie(keychainPassword, hexValue);
      
      if (decrypted) {
        if (name === 'd' && !cookieD) {
          const idx = decrypted.indexOf('xoxd-');
          cookieD = idx !== -1 ? decrypted.substring(idx) : decrypted;
        } else if (name === 'd-s' && !cookieDS) {
          const match = decrypted.match(/\d{10}/);
          cookieDS = match ? match[0] : decrypted;
        }
      }
    }
    
    if (cookieD) {
      return { cookieD, cookieDS };
    }
    return null;
  } catch (err) {
    return null;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

/**
 * Lists available Chrome profiles by parsing Local State or falling back to 'Default'.
 */
function getChromeProfiles() {
  const localStatePath = path.join(HOME, 'Library/Application Support/Google/Chrome/Local State');
  const chromePath = path.join(HOME, 'Library/Application Support/Google/Chrome');
  const profiles = {};
  
  if (!fs.existsSync(localStatePath)) {
    return { 'Default': path.join(chromePath, 'Default') };
  }
  
  try {
    const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
    const infoCache = localState?.profile?.info_cache || {};
    for (const dirName of Object.keys(infoCache)) {
      const profileInfo = infoCache[dirName];
      const profileName = profileInfo.name || dirName;
      profiles[profileName] = path.join(chromePath, dirName);
    }
  } catch (err) {
    // Fallback if parsing fails
  }
  
  if (Object.keys(profiles).length === 0) {
    profiles['Default'] = path.join(chromePath, 'Default');
  }
  
  return profiles;
}

/**
 * Decompresses Snappy-compressed data blocks used in LevelDB table files (.ldb).
 */
function snappyDecompress(buffer) {
  let pos = 0;
  let len = 0;
  let shift = 0;
  while (pos < buffer.length) {
    const b = buffer[pos++];
    len |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  if (len <= 0 || len > 2 * 1024 * 1024) return null;
  
  const out = Buffer.alloc(len);
  let outPos = 0;
  
  while (pos < buffer.length && outPos < len) {
    const tag = buffer[pos++];
    const mode = tag & 0x03;
    if (mode === 0) {
      let litLen = tag >> 2;
      if (litLen < 60) {
        litLen += 1;
      } else if (litLen === 60) {
        litLen = buffer[pos++] + 1;
      } else if (litLen === 61) {
        litLen = buffer[pos++] | (buffer[pos++] << 8) + 1;
      } else if (litLen === 62) {
        litLen = buffer[pos++] | (buffer[pos++] << 8) | (buffer[pos++] << 16) + 1;
      } else {
        litLen = buffer[pos++] | (buffer[pos++] << 8) | (buffer[pos++] << 16) | (buffer[pos++] << 24) + 1;
      }
      if (pos + litLen > buffer.length || outPos + litLen > len) return null;
      buffer.copy(out, outPos, pos, pos + litLen);
      pos += litLen;
      outPos += litLen;
    } else if (mode === 1) {
      const copyLen = ((tag >> 2) & 7) + 4;
      const offset = ((tag >> 5) << 8) | buffer[pos++];
      if (offset === 0 || offset > outPos) return null;
      for (let i = 0; i < copyLen; i++) {
        out[outPos + i] = out[outPos - offset + i];
      }
      outPos += copyLen;
    } else if (mode === 2) {
      const copyLen = (tag >> 2) + 1;
      const offset = buffer[pos++] | (buffer[pos++] << 8);
      if (offset === 0 || offset > outPos) return null;
      for (let i = 0; i < copyLen; i++) {
        out[outPos + i] = out[outPos - offset + i];
      }
      outPos += copyLen;
    } else if (mode === 3) {
      const copyLen = (tag >> 2) + 1;
      const offset = buffer[pos++] | (buffer[pos++] << 8) | (buffer[pos++] << 16) | (buffer[pos++] << 24);
      if (offset === 0 || offset > outPos) return null;
      for (let i = 0; i < copyLen; i++) {
        out[outPos + i] = out[outPos - offset + i];
      }
      outPos += copyLen;
    }
  }
  return out.subarray(0, outPos);
}

/**
 * Extracts team and enterprise tokens from Slack's localConfig_v2 JSON structure.
 */
function extractFromLocalConfig(text) {
  const tokens = {};
  const idx = text.indexOf('localConfig_v2');
  if (idx === -1) return tokens;
  
  const jsonStart = text.indexOf('{', idx);
  if (jsonStart === -1) return tokens;
  
  const snippet = text.slice(jsonStart, jsonStart + 50000);
  try {
    const teamsMatch = snippet.match(/"teams"\s*:\s*\{([^}]+(?:\{[^}]+\}[^}]+)*)\}/);
    if (teamsMatch) {
      const parsed = JSON.parse('{' + teamsMatch[0] + '}');
      for (const [teamId, teamData] of Object.entries(parsed.teams || {})) {
        if (teamData.token) tokens[teamId] = teamData.token;
      }
    }
  } catch (e) {
    const tRegex = /"([TE][A-Z0-9]{8,11})":\s*\{[^}]*"token":\s*"(xox[cp]-[a-zA-Z0-9-]+)"/g;
    let m;
    while ((m = tRegex.exec(snippet)) !== null) {
      tokens[m[1]] = m[2];
    }
  }
  return tokens;
}

/**
 * Scans LevelDB database files for active Slack tokens.
 * Handles both raw text logs and Snappy-compressed SSTable (.ldb) data blocks.
 * Prioritizes newest files and active localConfig_v2 configuration.
 */
function scanLevelDBForTokens(dbPath, workspaceURL) {
  if (!fs.existsSync(dbPath)) return {};
  
  const tokens = {};
  const baseDomain = workspaceURL ? workspaceURL.replace('https://', '').replace('.slack.com/', '').replace('/', '') : '';
  
  try {
    const files = fs.readdirSync(dbPath)
      .filter(f => f.endsWith('.log') || f.endsWith('.ldb') || f.endsWith('.sst') || /^[0-9]+$/.test(f))
      .map(f => ({ name: f, path: path.join(dbPath, f), stat: fs.statSync(path.join(dbPath, f)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    
    for (const fileObj of files) {
      try {
        const buffer = fs.readFileSync(fileObj.path);
        
        // 1. Try localConfig_v2 from raw string
        const rawStr = buffer.toString('utf8');
        Object.assign(tokens, extractFromLocalConfig(rawStr));
        
        // 2. Try decompressed snappy blocks if it is a LevelDB table file
        if (fileObj.name.endsWith('.ldb') || fileObj.name.endsWith('.sst')) {
          let pos = 0;
          while ((pos = buffer.indexOf('localConfig_v2', pos)) !== -1) {
            for (let start = Math.max(0, pos - 4096); start < pos; start++) {
              try {
                const decomp = snappyDecompress(buffer.subarray(start, Math.min(buffer.length, start + 65536)));
                if (decomp) {
                  const decompStr = decomp.toString('utf8');
                  if (decompStr.includes('localConfig_v2')) {
                    Object.assign(tokens, extractFromLocalConfig(decompStr));
                    break;
                  }
                }
              } catch (_) {}
            }
            pos += 14;
          }
        }
        
        // 3. Fallback: Contextual regex matching if no config JSON was found
        if (Object.keys(tokens).length === 0) {
          const tokenRegex = /xox[cp]-[a-zA-Z0-9-]+/g;
          let match;
          while ((match = tokenRegex.exec(rawStr)) !== null) {
            const token = match[0];
            const tokenIndex = match.index;
            const start = Math.max(0, tokenIndex - 1000);
            const end = Math.min(rawStr.length, tokenIndex + 1000);
            const context = rawStr.substring(start, end);
            const localTokenIndex = tokenIndex - start;
            
            if (!baseDomain || context.includes(baseDomain) || context.includes('slack.com')) {
              const teamIdRegex = /\"([TE][A-Z0-9]{8,11})\"/g;
              let idMatch;
              let bestId = null;
              let minDistance = Infinity;
              
              while ((idMatch = teamIdRegex.exec(context)) !== null) {
                const detectedId = idMatch[1];
                const idIndex = idMatch.index;
                const distance = Math.abs(idIndex - localTokenIndex);
                if (distance < minDistance) {
                  minDistance = distance;
                  bestId = detectedId;
                }
              }
              
              if (bestId) {
                tokens[bestId] = token;
              } else {
                const typeChar = token.startsWith('xoxc') ? 'T_fallback' : 'E_fallback';
                tokens[typeChar] = token;
              }
            }
          }
        }
        
        // If we found valid enterprise or team tokens, stop scanning older files
        if (Object.keys(tokens).some(k => k.startsWith('E') || k.startsWith('T'))) {
          break;
        }
      } catch (fileErr) {
        // Ignore single file errors
      }
    }
  } catch (err) {
    // Ignore folder scan errors
  }
  
  return tokens;
}

/**
 * Attempts extraction from Slack Desktop App (macOS Electron container).
 * Guaranteed coherence: both cookies and tokens must originate from Slack Desktop.
 */
function getSlackDesktopCredentials(workspaceURL) {
  const slackPassword = getSlackKeychainPassword();
  if (!slackPassword) {
    throw new Error("Could not retrieve password for 'Slack Safe Storage' from macOS Keychain.");
  }

  // 1. Look for Cookies SQLite database in Slack Desktop App container paths
  const desktopCookiePaths = [
    path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Network/Cookies'),
    path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Cookies'),
    path.join(HOME, 'Library/Application Support/Slack/Network/Cookies'),
    path.join(HOME, 'Library/Application Support/Slack/Cookies'),
  ];

  let desktopCookies = null;
  for (const cookiePath of desktopCookiePaths) {
    if (fs.existsSync(cookiePath)) {
      desktopCookies = getCookiesFromDb(cookiePath, slackPassword);
      if (desktopCookies && desktopCookies.cookieD) {
        break;
      }
    }
  }

  if (!desktopCookies || !desktopCookies.cookieD) {
    throw new Error("Could not find or decrypt valid 'd' cookie in Slack Desktop App storage.");
  }

  // 2. Look for tokens in Slack Desktop App LevelDB paths
  const desktopLevelDbPaths = [
    path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Local Storage/leveldb'),
    path.join(HOME, 'Library/Application Support/Slack/Local Storage/leveldb'),
  ];

  let desktopTokens = {};
  for (const levelDbPath of desktopLevelDbPaths) {
    if (fs.existsSync(levelDbPath)) {
      const tokens = scanLevelDBForTokens(levelDbPath, workspaceURL);
      if (tokens && Object.keys(tokens).length > 0) {
        desktopTokens = tokens;
        break;
      }
    }
  }

  if (Object.keys(desktopTokens).length === 0) {
    throw new Error("Could not find active Slack tokens (xoxc- or xoxp-) in Slack Desktop App LevelDB.");
  }

  return {
    source: 'slack_desktop',
    tokens: desktopTokens,
    cookieD: desktopCookies.cookieD,
    cookieDS: desktopCookies.cookieDS
  };
}

/**
 * Attempts extraction from Google Chrome profiles as a total fallback.
 * Guaranteed coherence: both cookies and tokens must originate from the same Chrome profile.
 */
function getChromeCredentials(workspaceURL) {
  const chromePassword = getChromeKeychainPassword();
  if (!chromePassword) {
    throw new Error("Could not retrieve password for 'Chrome Safe Storage' from macOS Keychain.");
  }

  const profiles = getChromeProfiles();
  const sortedProfiles = Object.entries(profiles).sort(([nameA, pathA], [nameB, pathB]) => {
    if (nameA.toLowerCase() === 'default') return -1;
    if (nameB.toLowerCase() === 'default') return 1;
    
    const cookiesA = path.join(pathA, 'Cookies');
    const cookiesB = path.join(pathB, 'Cookies');
    const mtimeA = fs.existsSync(cookiesA) ? fs.statSync(cookiesA).mtimeMs : 0;
    const mtimeB = fs.existsSync(cookiesB) ? fs.statSync(cookiesB).mtimeMs : 0;
    return mtimeB - mtimeA;
  });

  const profileErrors = [];

  for (const [profileName, profilePath] of sortedProfiles) {
    try {
      const cookies = getCookiesFromDb(path.join(profilePath, 'Cookies'), chromePassword);
      if (!cookies || !cookies.cookieD) {
        throw new Error("No 'd' cookie found.");
      }

      const tokens = scanLevelDBForTokens(path.join(profilePath, 'Local Storage', 'leveldb'), workspaceURL);
      if (Object.keys(tokens).length === 0) {
        throw new Error("No tokens found in Chrome Local Storage.");
      }

      return {
        source: `chrome_${profileName}`,
        tokens,
        cookieD: cookies.cookieD,
        cookieDS: cookies.cookieDS
      };
    } catch (e) {
      profileErrors.push(`${profileName}: ${e.message}`);
    }
  }

  throw new Error(`No Chrome profile with active Slack session found:\n  ${profileErrors.join('\n  ')}`);
}

/**
 * Returns raw credentials prioritizing Slack Desktop App, with total fallback to Google Chrome.
 * Guarantees that cookies and tokens always originate from the same application source.
 */
function getSlackCredentialsRaw(workspaceURL) {
  const errors = [];

  // 1. Primary: Slack Desktop App
  try {
    return getSlackDesktopCredentials(workspaceURL);
  } catch (err) {
    errors.push(`Slack Desktop: ${err.message}`);
  }

  // 2. Fallback: Google Chrome
  try {
    return getChromeCredentials(workspaceURL);
  } catch (err) {
    errors.push(`Google Chrome: ${err.message}`);
  }

  throw new Error(
    "Could not find any active Slack session. Details:\n" +
    errors.map(err => `  - ${err}`).join('\n')
  );
}

/**
 * Public function to retrieve resolved enterprise token, team token, cookies, and source.
 */
export function getSlackCredentials(workspaceURL = DEFAULT_WORKSPACE) {
  const raw = getSlackCredentialsRaw(workspaceURL);
  
  // Prioritize enterprise and team tokens
  const enterpriseToken = Object.entries(raw.tokens)
    .find(([id]) => id.startsWith('E') && id !== 'E_fallback')?.[1]
    || raw.tokens['E_fallback'];
    
  const teamToken = Object.entries(raw.tokens)
    .find(([id]) => id.startsWith('T') && id !== 'T_fallback')?.[1]
    || raw.tokens['T_fallback'];
    
  const activeToken = teamToken || enterpriseToken;
  
  if (!activeToken) {
    throw new Error("Could not find a valid Slack team or enterprise token.");
  }
  
  return {
    enterpriseToken: enterpriseToken || activeToken,
    teamToken: teamToken || activeToken,
    token: activeToken,
    cookieD: raw.cookieD,
    cookieDS: raw.cookieDS,
    source: raw.source
  };
}
