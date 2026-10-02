import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const HOME = os.homedir();
const dbPath = path.join(HOME, 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Cookies');
const tmpDir = path.join(os.tmpdir(), `test_slack_names_${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  fs.copyFileSync(dbPath, path.join(tmpDir, 'Cookies'));
  const query = "SELECT distinct name FROM cookies WHERE host_key LIKE '%.slack.com';";
  const output = execSync(`/usr/bin/sqlite3 "${path.join(tmpDir, 'Cookies')}" "${query}"`, { encoding: 'utf8' }).trim();
  console.log('Cookie names:', output.split('\n'));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
