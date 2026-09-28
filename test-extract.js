import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import os from 'os';

const HOME = os.homedir();

// 1. Get Keychain password for Chrome
function getChromeKeychainPassword() {
  try {
    const password = execSync(
      '/usr/bin/security find-generic-password -s "Chrome Safe Storage" -a Chrome -g -w',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    return password;
  } catch (err) {
    throw new Error(`Failed to retrieve Chrome password from macOS Keychain: ${err.message}`);
  }
}

// 2. Decrypt Chrome cookie
function decryptChromeCookie(keychainPassword, encryptedHex) {
  try {
    const encryptedBytes = Buffer.from(encryptedHex, 'hex');
    if (encryptedBytes.length < 3) return null;
    
    // Chrome prefix is 'v10'
    const prefix = encryptedBytes.subarray(0, 3).toString('utf8');
    if (prefix !== 'v10') {
      return encryptedBytes.toString('utf8');
    }
    
    const rawEncValue = encryptedBytes.subarray(3);
    const salt = Buffer.from('saltysalt', 'utf8');
    const iv = Buffer.from(' '.repeat(16), 'utf8');
    const iterations = 1003;
    const keySize = 16; // 128 bits
    
    // Derive key using PBKDF2
    const key = crypto.pbkdf2Sync(keychainPassword, salt, iterations, keySize, 'sha1');
    
    // Decrypt using AES-128-CBC
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true);
    const decrypted = Buffer.concat([decipher.update(rawEncValue), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return null;
  }
}

// 3. Extract cookies using native macOS sqlite3 CLI
function getChromeCookies(profilePath, keychainPassword) {
  const dbPath = path.join(profilePath, 'Cookies');
  if (!fs.existsSync(dbPath)) {
    return null;
  }
  
  try {
    const query = "SELECT name, hex(encrypted_value) FROM cookies WHERE host_key LIKE '%.slack.com' AND name IN ('d', 'd-s')";
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
    console.error(`⚠️ Error reading cookies from SQLite: ${err.message}`);
    return null;
  }
}

// 4. Get list of Chrome profiles
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
    console.error(`⚠️ Could not parse Local State: ${err.message}`);
  }
  
  if (Object.keys(profiles).length === 0) {
    profiles['Default'] = path.join(chromePath, 'Default');
  }
  
  return profiles;
}

// 5. Context-based LevelDB token scanner (extremely robust)
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
        
        // Find all token occurrences
        const tokenRegex = /xox[cp]-[a-zA-Z0-9-]+/g;
        let match;
        
        while ((match = tokenRegex.exec(contentStr)) !== null) {
          const token = match[0];
          const tokenIndex = match.index;
          
          // Get local context around this token (1500 characters before and after)
          const start = Math.max(0, tokenIndex - 1500);
          const end = Math.min(contentStr.length, tokenIndex + 1500);
          const context = contentStr.substring(start, end);
          
          // Verify if this context contains the target workspace URL or domain
          if (context.includes(baseDomain) || context.includes('slack.com')) {
            // Find team/enterprise IDs in the context (usually keys of the teams object)
            // Team ID matches starting with T or E followed by letters/numbers, e.g. "T012345" or "E012345"
            // They are usually formatted like "TXXXXX" or "EXXXXX"
            // Let's search specifically for the team/enterprise ID associated with the token.
            // Typically in the JSON: {"T024BEB13":{"id":"T024BEB13",...}}
            const teamIdRegex = /"([TE][A-Z0-9]{8,11})"/g;
            let teamIdMatch;
            let bestTeamId = null;
            
            // Search for team IDs in the immediate vicinity
            while ((teamIdMatch = teamIdRegex.exec(context)) !== null) {
              const detectedId = teamIdMatch[1];
              bestTeamId = detectedId;
              // If we see it right before or near the token, keep it!
            }
            
            if (bestTeamId) {
              tokens[bestTeamId] = token;
            } else {
              // Fallback to general classification by starting character
              const typeChar = token.startsWith('xoxc') ? 'T_fallback' : 'E_fallback';
              tokens[typeChar] = token;
            }
          }
        }
      } catch (fileErr) {
        // Ignore file errors
      }
    }
  } catch (err) {
    console.error(`⚠️ Error scanning LevelDB: ${err.message}`);
  }
  
  return tokens;
}

// RUN THE DIAGNOSTIC
async function run() {
  console.log("=== Slack Credentials Extraction Diagnostic ===");
  try {
    const keychainPassword = getChromeKeychainPassword();
    console.log(`🔐 Chrome Safe Storage password retrieved from Keychain. Length: ${keychainPassword.length}`);
    
    const profiles = getChromeProfiles();
    
    // LevelDB Token Test - Slack Desktop
    console.log("\n🔎 Scanning Slack Desktop App LevelDB with Contextual Heuristic...");
    const slackDesktopPath = path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Local Storage/leveldb');
    if (fs.existsSync(slackDesktopPath)) {
      const tokens = scanLevelDBForTokens(slackDesktopPath, "https://deliveryhero.slack.com/");
      const teamIds = Object.keys(tokens);
      if (teamIds.length > 0) {
        console.log(`[Slack Desktop LevelDB] Found ${teamIds.length} tokens:`);
        for (const teamId of teamIds) {
          console.log(`  - ID: ${teamId}, Token Type: ${tokens[teamId].substring(0, 4)}..., Length: ${tokens[teamId].length}`);
        }
      } else {
        console.log(`[Slack Desktop LevelDB] No Slack tokens found.`);
      }
    } else {
      console.log("[Slack Desktop LevelDB] Slack Desktop App data folder not found.");
    }
    
  } catch (err) {
    console.error("❌ Diagnostic Failed:", err.message);
  }
}

run();
