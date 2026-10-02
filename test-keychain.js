import { execSync } from 'child_process';

const attempts = [
  '/usr/bin/security find-generic-password -s "Slack Safe Storage" -a "Slack" -g -w',
  '/usr/bin/security find-generic-password -s "Slack Safe Storage" -w',
  '/usr/bin/security find-generic-password -l "Slack Safe Storage" -g -w',
  '/usr/bin/security find-generic-password -D "Slack Safe Storage" -g -w',
  '/usr/bin/security find-generic-password -s "Slack Safe Storage"',
  '/usr/bin/security find-generic-password -a "Slack"',
  '/usr/bin/security find-generic-password -s "Chrome Safe Storage" -a "Chrome" -g -w'
];

for (const cmd of attempts) {
  try {
    const res = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`SUCCESS: ${cmd} -> result length: ${res.trim().length}`);
  } catch (err) {
    console.log(`FAIL: ${cmd} -> ${err.message.split('\n')[0]}`);
  }
}
