import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import os from 'os';

const HOME = os.homedir();

function getSlackKeychainPassword() {
  const commands = [
    '/usr/bin/security find-generic-password -s "Slack Safe Storage" -a "Slack" -g -w',
    '/usr/bin/security find-generic-password -s "Slack Safe Storage" -a "Slack App Store Key" -g -w',
    '/usr/bin/security find-generic-password -s "Slack Safe Storage" -g -w'
  ];
  for (const cmd of commands) {
    try {
      const pass = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      if (pass) return pass;
    } catch (_) {}
  }
  return null;
}

function decryptCookie(keychainPassword, encryptedHex) {
  try {
    const encryptedBytes = Buffer.from(encryptedHex, 'hex');
    if (encryptedBytes.length < 3) return null;
    const prefix = encryptedBytes.subarray(0, 3).toString('utf8');
    if (prefix !== 'v10') return encryptedBytes.toString('utf8');
    
    const rawEncValue = encryptedBytes.subarray(3);
    const salt = Buffer.from('saltysalt', 'utf8');
    const iv = Buffer.from(' '.repeat(16), 'utf8');
    const iterations = 1003;
    const keySize = 16;
    
    const key = crypto.pbkdf2Sync(keychainPassword, salt, iterations, keySize, 'sha1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true);
    const decrypted = Buffer.concat([decipher.update(rawEncValue), decipher.final()]);
    return decrypted.length > 32 ? decrypted.subarray(32).toString('utf8') : decrypted.toString('utf8');
  } catch (err) {
    return null;
  }
}

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
        const rawStr = buffer.toString('utf8');
        Object.assign(tokens, extractFromLocalConfig(rawStr));
        
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
        
        if (Object.keys(tokens).some(k => k.startsWith('E') || k.startsWith('T'))) {
          break;
        }
      } catch (fileErr) {}
    }
  } catch (err) {}
  
  return tokens;
}

const pass = getSlackKeychainPassword();
const dbPath = path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Cookies');
const tmpDir = path.join(os.tmpdir(), `test_call2_${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

let cookieD = null;
let cookieDS = null;
try {
  for (const f of ['Cookies', 'Cookies-wal', 'Cookies-shm']) {
    const src = path.join(path.dirname(dbPath), f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(tmpDir, f));
    }
  }
  const query = "SELECT name, hex(encrypted_value) FROM cookies WHERE host_key LIKE '%.slack.com' AND name IN ('d', 'd-s') ORDER BY last_access_utc DESC;";
  const output = execSync(`/usr/bin/sqlite3 "${path.join(tmpDir, 'Cookies')}" "${query}"`, { encoding: 'utf8' }).trim();
  for (const line of output.split('\n')) {
    if (!line) continue;
    const [name, hex] = line.split('|');
    const dec = decryptCookie(pass, hex);
    if (dec) {
      if (name === 'd' && !cookieD) {
        const idx = dec.indexOf('xoxd-');
        cookieD = idx !== -1 ? dec.substring(idx) : dec;
      } else if (name === 'd-s' && !cookieDS) {
        const match = dec.match(/\d{10}/);
        cookieDS = match ? match[0] : dec;
      }
    }
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const leveldbPath = path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Local Storage/leveldb');
const tokens = scanLevelDBForTokens(leveldbPath, 'https://deliveryhero.slack.com/');

console.log('Extracted Tokens:');
for (const [k, v] of Object.entries(tokens)) {
  console.log(`Key: ${k}, Token prefix: ${v.substring(0, 10)}... (length: ${v.length})`);
}

for (const [k, token] of Object.entries(tokens)) {
  console.log(`\nTesting token key: ${k}`);
  const cookieHeader = cookieDS ? `d=${cookieD}; d-s=${cookieDS}` : `d=${cookieD}`;
  const res = await fetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Cookie': cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const data = await res.json();
  console.log(`Result for ${k}: ok=${data.ok}, error=${data.error}, user=${data.user}, team=${data.team}`);
}
