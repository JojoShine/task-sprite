import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,chmodSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
if(process.platform!=='darwin')throw new Error('此打包脚本用于 macOS。');
if(process.argv.slice(2).some(value=>value!=='--local'&&value!=='--prepare-only'))throw new Error('不支持的打包参数');
const local=process.argv.includes('--local');
const signing=path.join(root,'.tooling/signing');mkdirSync(signing,{recursive:true,mode:0o700});
function run(command,args,options={}){
 const result=spawnSync(command,args,{cwd:root,encoding:'utf8',...options});
 if(result.error||result.status!==0){if(result.stderr)process.stderr.write(result.stderr);throw new Error('构建步骤未完成：'+path.basename(command));}
 return result.stdout||'';
}
const password=path.join(signing,'keychain-password'),key=path.join(signing,'signer.key'),cert=path.join(signing,'signer.crt'),p12=path.join(signing,'signer.p12');
if(!existsSync(p12)){
 if(existsSync(key)||existsSync(cert))throw new Error('本地签名文件不完整；请恢复原签名身份，不能自动替换它。');
 writeFileSync(password,randomBytes(36).toString('base64url'),{flag:'wx',mode:0o600});
 run('openssl',['req','-new','-x509','-days','3650','-newkey','rsa:3072','-nodes','-subj','/CN=Task Sprite Local Development/','-addext','extendedKeyUsage=codeSigning','-addext','keyUsage=digitalSignature','-addext','basicConstraints=critical,CA:FALSE','-keyout',key,'-out',cert]);chmodSync(key,0o600);
 run('openssl',['pkcs12','-export','-inkey',key,'-in',cert,'-out',p12,'-keypbe','PBE-SHA1-3DES','-certpbe','PBE-SHA1-3DES','-macalg','sha1','-passout','file:'+password]);chmodSync(p12,0o600);
}
if(!existsSync(password)||!existsSync(cert))throw new Error('请恢复原本机签名身份文件。');
const fingerprint=run('openssl',['x509','-in',cert,'-noout','-fingerprint','-sha1']).trim().split('=').at(-1).replaceAll(':','').toLowerCase();
if(!/^[0-9a-f]{40}$/.test(fingerprint))throw new Error('本机签名证书无效');
const digest=value=>createHash('sha256').update(value).digest('hex').slice(0,24);
const requirement=`identifier "io.jojoshine.tasksprite" and certificate leaf = H"${fingerprint}"`;
const agentSource=path.join(root,'scripts/macos-credential-agent.c');
// This agent stays byte-for-byte stable across UI builds; its Keychain identity must not rotate.
const agent=path.join(signing,'credential-agent-'+digest(readFileSync(agentSource,'utf8')+requirement+'-O2-runtime-v1'));
if(!existsSync(agent)){
 run('clang',['-O2','-Wno-deprecated-declarations','-DPARENT_REQUIREMENT="'+requirement.replaceAll('"','\\"')+'"',agentSource,'-framework','Security','-framework','CoreFoundation','-o',agent]);
 run('/usr/bin/codesign',['--force','--sign','-','--options','runtime','--timestamp=none',agent]);
}
run('/usr/bin/codesign',['--verify','--strict',agent]);
const agentInfo=spawnSync('/usr/bin/codesign',['-dvvv',agent],{encoding:'utf8'});
const cdhash=agentInfo.stderr.match(/CDHash=([0-9a-f]+)/)?.[1];if(!cdhash)throw new Error('凭据组件缺少有效签名');
const bin=path.join(root,'src-tauri/bin');mkdirSync(bin,{recursive:true});copyFileSync(agent,path.join(bin,'task-sprite-credential-agent'));chmodSync(path.join(bin,'task-sprite-credential-agent'),0o755);
const signSource=path.join(root,'scripts/macos-sign.m'),signTool=path.join(signing,'memory-signer-'+digest(readFileSync(signSource)));
if(!existsSync(signTool))run('clang',['-O2','-fobjc-arc','-Wno-incompatible-pointer-types',signSource,'-framework','Foundation','-framework','Security','-o',signTool]);
if(process.argv.includes('--prepare-only')){console.log('Protected credential agent and local signer prepared.');process.exit(0);}
const env={...process.env,TASK_SPRITE_AGENT_CDHASH:cdhash,APPLE_SIGNING_IDENTITY:'-'};
if(existsSync(path.join(root,'.tooling/cargo/bin'))){env.CARGO_HOME=path.join(root,'.tooling/cargo');env.RUSTUP_HOME=path.join(root,'.tooling/rustup');env.PATH=path.join(root,'.tooling/cargo/bin')+':'+env.PATH;}
run(path.join(root,'node_modules/.bin/tauri'),['build','--bundles','app',...(local?['--features','local-sync']:[])],{env,stdio:'inherit'});
const app=path.join(root,'src-tauri/target/release/bundle/macos/Task Sprite.app');
run(signTool,[p12,password,app,'io.jojoshine.tasksprite']);
run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
console.log(`Signed app verified; synchronization target: ${local?'local Docker':'production'}. Credential agent identity preserved.`);
