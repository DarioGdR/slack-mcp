import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import os from 'os';

const HOME = os.homedir();
const DEFAULT_WORKSPACE = process.env.SLACK_WORKSPACE_URL || 'https://deliveryhero.slack.com/';

/**
 * Retrieves the Chrome Safe Storage password from the macOS Keychain.
 */
function getChromeKeychainPassword() {
  try {
    return execSync(
      '/usr/bin/security find-generic-password -s "Chrome Safe Storage" -a Chrome -g -w',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
  } catch (err) {
    throw new Error(`Failed to retrieve Chrome password from macOS Keychain: ${err.message}`);
  }
}

/**
 * Decrypts a Chrome cookie value using AES-128-CBC and PBKDF2.
 */
function decryptChromeCookie(keychainPassword, encryptedHex) {
  try {
    const encryptedBytes = Buffer.from(encryptedHex, 'hex');
    if (encryptedBytes.length < 3) return null;
    
    // Chrome cookies on macOS are prefixed with 'v10'
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
    return decrypted.toString('utf8');
  } catch (err) {
    return null;
  }
}

/**
 * Reads Chrome's Cookies SQLite database and decrypts the 'd' and 'd-s' cookies.
 */
function getChromeCookies(profilePath, keychainPassword) {
  const dbPath = path.join(profilePath, 'Cookies');
  if (!fs.existsSync(dbPath)) return null;
  
  try {
    const query = "SELECT name, hex(encrypted_value) FROM cookies WHERE host_key LIKE '%.slack.com' AND name IN ('d', 'd-s')";
    // Use macOS native sqlite3 utility to avoid external npm binary dependencies
    const output = execSync(`/usr/bin/sqlite3 "${dbPath}" "${query}"`, { encoding: 'utf8' }).trim();
    
    let cookieD = null;
    let cookieDS = null;
    
    const lines = output.split('\n');
    for (const line of lines) {
      if (!line) continue;
      const parts = line.split('|');
      if (parts.length < 2) continue;
      
      const name = parts[0];
      const hexValue = parts[1];
      const decrypted = decryptChromeCookie(keychainPassword, hexValue);
      
      if (decrypted) {
        if (name === 'd') {
          const idx = decrypted.indexOf('xoxd-');
          cookieD = idx !== -1 ? decrypted.substring(idx) : decrypted;
        } else if (name === 'd-s') {
          const match = decrypted.match(/\d{10}/);
          cookieDS = match ? match[0] : decrypted;
        }
      }
    }
    
    return { cookieD, cookieDS };
  } catch (err) {
    return null;
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
 * Distance-based, contextual, regex-based scanner for LevelDB binary files to retrieve Slack client tokens.
 * Maps team/enterprise IDs starting with T or E using absolute distance in characters.
 */
function scanLevelDBForTokens(dbPath, workspaceURL) {
  if (!fs.existsSync(dbPath)) return {};
  
  const tokens = {};
  const baseDomain = workspaceURL.replace('https://', '').replace('.slack.com/', '').replace('/', '');
  
  try {
    const files = fs.readdirSync(dbPath);
    const targetFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.ldb') || f.endsWith('.sst') || /^[0-9]+$/.test(f));
    
    for (const fileName of targetFiles) {
      const filePath = path.join(dbPath, fileName);
      try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile() || stats.size === 0) continue;
        
        const buffer = fs.readFileSync(filePath);
        const contentStr = buffer.toString('utf8');
        
        const tokenRegex = /xox[cp]-[a-zA-Z0-9-]+/g;
        let match;
        
        while ((match = tokenRegex.exec(contentStr)) !== null) {
          const token = match[0];
          const tokenIndex = match.index;
          
          const start = Math.max(0, tokenIndex - 1000);
          const end = Math.min(contentStr.length, tokenIndex + 1000);
          const context = contentStr.substring(start, end);
          const localTokenIndex = tokenIndex - start;
          
          if (context.includes(baseDomain) || context.includes('slack.com')) {
            // Find all potential team/enterprise IDs in the context and calculate absolute character distance
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
 * Returns raw credentials including d/d-s cookies and all tokens.
 */
function getSlackCredentialsRaw(workspaceURL) {
  const keychainPassword = getChromeKeychainPassword();
  const profiles = getChromeProfiles();
  
  // Prioritize "Default" and recently modified profiles
  const sortedProfiles = Object.entries(profiles).sort(([nameA, pathA], [nameB, pathB]) => {
    if (nameA.toLowerCase() === 'default') return -1;
    if (nameB.toLowerCase() === 'default') return 1;
    
    const cookiesA = path.join(pathA, 'Cookies');
    const cookiesB = path.join(pathB, 'Cookies');
    const mtimeA = fs.existsSync(cookiesA) ? fs.statSync(cookiesA).mtimeMs : 0;
    const mtimeB = fs.existsSync(cookiesB) ? fs.statSync(cookiesB).mtimeMs : 0;
    return mtimeB - mtimeA;
  });
  
  const errors = [];
  
  for (const [profileName, profilePath] of sortedProfiles) {
    try {
      // 1. Get cookies
      const cookies = getChromeCookies(profilePath, keychainPassword);
      if (!cookies || !cookies.cookieD || !cookies.cookieDS) {
        throw new Error("Could not find 'd' and 'd-s' cookies. Ensure you are logged into Slack on Chrome.");
      }
      
      // 2. Get tokens from Chrome Local Storage
      let tokens = scanLevelDBForTokens(path.join(profilePath, 'Local Storage', 'leveldb'), workspaceURL);
      
      // 3. Fallback: Get tokens from Slack Desktop App
      if (Object.keys(tokens).length === 0) {
        const slackDesktopPath = path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Local Storage/leveldb');
        tokens = scanLevelDBForTokens(slackDesktopPath, workspaceURL);
      }
      
      if (Object.keys(tokens).length === 0) {
        throw new Error("Could not find active Slack tokens (xoxc- or xoxp-) for workspace.");
      }
      
      return {
        tokens,
        cookieD: cookies.cookieD,
        cookieDS: cookies.cookieDS
      };
    } catch (e) {
      errors.push(`${profileName}: ${e.message}`);
    }
  }
  
  throw new Error(
    "Could not find any active Slack session. Details:\n" +
    errors.map(err => `  - ${err}`).join('\n')
  );
}

/**
 * Public function to retrieve resolved enterprise token, team token, and cookies.
 */
export function getSlackCredentials(workspaceURL = DEFAULT_WORKSPACE) {
  const raw = getSlackCredentialsRaw(workspaceURL);
  
  // Prioritize specific IDs over loose fallback keys
  const enterpriseToken = Object.entries(raw.tokens)
    .find(([id]) => id.startsWith('E') && id !== 'E_fallback')?.[1]
    || raw.tokens['E_fallback'];
    
  const teamToken = Object.entries(raw.tokens)
    .find(([id]) => id.startsWith('T') && id !== 'T_fallback')?.[1]
    || raw.tokens['T_fallback'];
    
  if (!teamToken) {
    throw new Error("Could not find a valid team token.");
  }
  
  return {
    enterpriseToken: enterpriseToken || teamToken,
    teamToken: teamToken,
    cookieD: raw.cookieD,
    cookieDS: raw.cookieDS
  };
}
