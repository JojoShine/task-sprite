import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
const version = JSON.parse(readFileSync('package.json')).version;
const platform = process.platform === 'darwin' ? 'macos' : 'windows';
const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const smoke = JSON.parse(readFileSync('ci-logs/startup.json'));
if (smoke.startup !== 'passed' || (platform === 'windows' && smoke.mode !== 'installed-release')) throw Error('Platform smoke check failed');
mkdirSync('release-packages',{recursive:true});
if (platform === 'windows') {
  const directory = 'src-tauri/target/release/bundle/nsis';
  const files = readdirSync(directory).filter(file=>file.endsWith('.exe'));
  if (files.length !== 1) throw Error('Expected exactly one Windows installer');
  const target = `release-packages/Task-Sprite-${version}-windows-x86_64.exe`;
  copyFileSync(path.join(directory,files[0]),target);
  copyFileSync(path.join(directory,files[0]+'.sig'),target+'.sig');
}
writeFileSync(`release-packages/${platform}-${arch}-verified.json`,JSON.stringify({version,startup:smoke.startup,platform,arch},null,2)+'\n');
