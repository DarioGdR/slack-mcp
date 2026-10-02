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
    // Discard initial 32 bytes of hash / signature
    return decrypted.length > 32 ? decrypted.subarray(32).toString('utf8') : decrypted.toString('utf8');
  } catch (err) {
    return null;
  }
}

const pass = getSlackKeychainPassword();
console.log('Password found:', !!pass);

const dbPath = path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Cookies');
const tmpDir = path.join(os.tmpdir(), `test_slack_cookies_${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  for (const f of ['Cookies', 'Cookies-wal', 'Cookies-shm']) {
    const src = path.join(path.dirname(dbPath), f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(tmpDir, f));
    }
  }
  
  const query = "SELECT name, hex(encrypted_value) FROM cookies WHERE host_key LIKE '%.slack.com' AND name IN ('d', 'd-s') ORDER BY last_access_utc DESC;";
  const output = execSync(`/usr/bin/sqlite3 "${path.join(tmpDir, 'Cookies')}" "${query}"`, { encoding: 'utf8' }).trim();
  
  const lines = output.split('\n');
  for (const line of lines) {
    if (!line) continue;
    const parts = line.split('|');
    const name = parts[0];
    const hex = parts[1];
    const dec = decryptCookie(pass, hex);
    console.log(`Cookie ${name}: decrypted length ${dec ? dec.length : 0}, startsWith: ${dec ? dec.substring(0, 5) : 'null'}`);
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
