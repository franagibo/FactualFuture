/**
 * Build Electron app into a fresh timestamped output directory to avoid
 * "file is being used by another process" when the previous app.asar is locked
 * (e.g. built app still running or Explorer has the folder open).
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const timestamp = Date.now();
const outputDir = `release/build-${timestamp}`;

console.log('Building to:', outputDir);

execSync(`npx electron-builder --config.directories.output=${outputDir}`, {
  stdio: 'inherit',
  shell: true,
  cwd: root,
});

console.log('\nOutput:', path.join(root, outputDir));
