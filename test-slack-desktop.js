import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import os from 'os';

const HOME = os.homedir();

console.log('Testing Slack Safe Storage keychain...');
let slackPassword = null;
try {
  slackPassword = execSync(
    '/usr/bin/security find-generic-password -s "Slack Safe Storage" -a "Slack" -g -w',
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
  ).trim();
  console.log(`Slack Keychain Password retrieved! Length: ${slackPassword.length}`);
} catch (e) {
  console.log(`Failed to retrieve Slack Keychain Password: ${e.message}`);
}

const cookiePaths = [
  path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Network/Cookies'),
  path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Cookies'),
  path.join(HOME, 'Library/Application Support/Slack/Network/Cookies'),
  path.join(HOME, 'Library/Application Support/Slack/Cookies'),
];

console.log('\nChecking cookie paths:');
for (const cp of cookiePaths) {
  console.log(`${cp}: ${fs.existsSync(cp) ? 'EXISTS' : 'NOT FOUND'}`);
}

const levelDbPaths = [
  path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Local Storage/leveldb'),
  path.join(HOME, 'Library/Application Support/Slack/Local Storage/leveldb'),
];

console.log('\nChecking LevelDB paths:');
for (const lp of levelDbPaths) {
  console.log(`${lp}: ${fs.existsSync(lp) ? 'EXISTS' : 'NOT FOUND'}`);
}
