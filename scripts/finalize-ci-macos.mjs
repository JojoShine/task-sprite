import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
if (process.platform !== 'darwin') throw Error('macOS runner required');
const version = JSON.parse(readFileSync('package.json')).version;
const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const metadata = JSON.parse(readFileSync(`release-bootstrap/macos-${arch}/metadata.json`));
const app = path.resolve('src-tauri/target/release/bundle/macos/Task Sprite.app');
const temporary = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'task-sprite-release-signing');
mkdirSync(temporary,{recursive:true,mode:0o700});
function run(cmd,args,options={}) {
  const result = spawnSync(cmd,args,{encoding:'utf8',...options});
  if(result.status !== 0) throw Error(`${path.basename(cmd)} failed: ${result.stderr || result.error || ''}`);
  return result.stdout;
}
try {
  if (!process.env.MACOS_SIGNING_P12_BASE64 || !process.env.MACOS_SIGNING_PASSWORD) throw Error('Original macOS signing identity is required');
  const p12 = path.join(temporary,'identity.p12'), password = path.join(temporary,'password');
  writeFileSync(p12,Buffer.from(process.env.MACOS_SIGNING_P12_BASE64,'base64'),{mode:0o600});
  writeFileSync(password,process.env.MACOS_SIGNING_PASSWORD,{mode:0o600});
  const signer = path.join(temporary,'signer');
  run('clang',['-O2','-fobjc-arc','-Wno-incompatible-pointer-types','scripts/macos-sign.m','-framework','Foundation','-framework','Security','-o',signer]);
  run(signer,[p12,password,app,'io.jojoshine.tasksprite']);
  run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
  const prefix = path.join(temporary,'certificate');
  run('/usr/bin/codesign',['-d','--extract-certificates='+prefix,app]);
  const fingerprint = run('openssl',['x509','-inform','DER','-in',prefix+'0','-noout','-fingerprint','-sha1']).trim().split('=').at(-1).replaceAll(':','').toLowerCase();
  if (fingerprint !== metadata.callerCertificateSha1) throw Error('Original macOS signing identity mismatch');
  const out = path.resolve('release-packages');mkdirSync(out,{recursive:true});
  const archive = path.join(out,`Task-Sprite-${version}-macos-${arch}.app.tar.gz`);
  run('/usr/bin/tar',['-czf',archive,'-C',path.dirname(app),path.basename(app)]);
  run('node_modules/.bin/tauri',['signer','sign',archive,'--app-version',version]);
  const imageRoot = path.join(temporary,'dmg');mkdirSync(imageRoot);
  run('/usr/bin/ditto',[app,path.join(imageRoot,'Task Sprite.app')]);
  run('/bin/ln',['-s','/Applications',path.join(imageRoot,'Applications')]);
  run('/usr/bin/hdiutil',['create','-volname','Task Sprite','-srcfolder',imageRoot,'-ov','-format','UDZO',path.join(out,`Task-Sprite-${version}-macos-${arch}.dmg`)]);
  console.log(`Signed ${arch} app, DMG and updater package prepared.`);
} finally { rmSync(temporary,{recursive:true,force:true}); }
