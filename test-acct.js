import { execSync } from 'child_process';

const out = execSync('/usr/bin/security find-generic-password -s "Slack Safe Storage"', { encoding: 'utf8' });
const lines = out.split('\n').filter(l => l.includes('"acct"') || l.includes('"svce"') || l.includes('"labl"'));
console.log(lines);
