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

// Get cookie
const pass = getSlackKeychainPassword();
const dbPath = path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Cookies');
const tmpDir = path.join(os.tmpdir(), `test_call_${Date.now()}`);
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

// Get token
const leveldbPath = path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Local Storage/leveldb');
const files = fs.readdirSync(leveldbPath).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));
let token = null;
for (const file of files) {
  const content = fs.readFileSync(path.join(leveldbPath, file), 'utf8');
  const match = content.match(/xoxc-[a-zA-Z0-9-]+/);
  if (match) {
    token = match[0];
    break;
  }
}

console.log('Testing auth.test with Slack Desktop credentials:');
console.log('Cookie d present:', !!cookieD);
console.log('Token present:', !!token);

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
console.log('auth.test response:', {
  ok: data.ok,
  url: data.url,
  user: data.user,
  team: data.team,
  error: data.error
});
