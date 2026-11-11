#!/usr/bin/env node
// Safe Firebase Hosting deploy.
//
//   node tools/deploy.js            deploy hosting
//   node tools/deploy.js --rules    also deploy firestore.rules (security rules)
//   node tools/deploy.js --dry      build the staging folder and list files, deploy nothing
//
// Why this exists: firebase.json serves "public": "." (the whole repo folder), so a plain
// `firebase deploy` would publish experiments, scripts and tests. This stages ONLY git-tracked,
// top-level web assets into a temp folder and deploys that. Commit new files before deploying.
//
// Needs `firebase-tools` (fetched via npx) and an existing `firebase login` on this machine.

const fs = require('fs'), path = require('path'), os = require('os');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const WEB_EXT = /\.(html|js|css|png|svg|jpg|jpeg|webp|ico|json|webmanifest|woff2)$/i;
const NEVER = new Set(['firebase.json', 'package.json', 'package-lock.json', '.firebaserc']);

const tracked = execSync('git ls-files', { cwd: ROOT }).toString().split('\n').filter(Boolean);
const files = tracked.filter(f => !f.includes('/') && WEB_EXT.test(f) && !NEVER.has(f));

const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().split('\n')
  .filter(l => l && !l.startsWith('??') && files.includes(l.slice(3).trim()));
if (dirty.length) console.warn('! Uncommitted changes in tracked web files (deploying what is on disk):\n  ' + dirty.join('\n  '));

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'habitly-deploy-'));
fs.mkdirSync(path.join(stage, 'public'));
files.forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(stage, 'public', f)));
fs.copyFileSync(path.join(ROOT, '.firebaserc'), path.join(stage, '.firebaserc'));

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
cfg.hosting.public = 'public';
delete cfg.storage;
const only = ['hosting'];
if (args.includes('--rules')) { fs.copyFileSync(path.join(ROOT, 'firestore.rules'), path.join(stage, 'firestore.rules')); only.push('firestore:rules'); }
else delete cfg.firestore;
fs.writeFileSync(path.join(stage, 'firebase.json'), JSON.stringify(cfg, null, 2));

console.log(`Staged ${files.length} files in ${stage}\n  ${files.join('\n  ')}`);
if (args.includes('--dry')) process.exit(0);

const r = spawnSync('npx', ['--yes', 'firebase-tools@latest', 'deploy', '--only', only.join(','), '--non-interactive'],
  { cwd: stage, stdio: 'inherit', shell: true });
try { fs.rmSync(stage, { recursive: true, force: true }); } catch (_) {}
process.exit(r.status || 0);
