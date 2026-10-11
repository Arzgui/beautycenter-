// Real production-mode server, synthetic database/credentials, GET requests only.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const directory=await mkdtemp(path.join(tmpdir(),'isbeauty-prod-startup-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(directory,'synthetic.sqlite'),DOTENV_CONFIG_PATH:'__no_test_env__',JWT_SECRET:'production-mode-test-only-secret-at-least-32-bytes'});
const database=await import('../config/database.js');
const webpush=(await import('web-push')).default;
const keys=webpush.generateVAPIDKeys();
const cwd=fileURLToPath(new URL('../',import.meta.url));
const environment={...process.env,NODE_ENV:'production',SITE_URL:'https://test.example',CORS_ORIGINS:'https://test.example',VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,VAPID_SUBJECT:'mailto:test@example.com',BREVO_API_KEY:'synthetic-not-real',BREVO_SENDER_EMAIL:'test@example.com',BREVO_SENDER_NAME:'Synthetic',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',ONESIGNAL_API_KEY:'',HOST:'127.0.0.1'};
let server;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  await database.initializeDatabase();await new Promise(resolve=>database.db.raw.close(resolve));
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  server=spawn(process.execPath,['server.js'],{cwd,env:{...environment,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let errors='',output='';server.stderr.on('data',chunk=>errors+=chunk);server.stdout.on('data',chunk=>output+=chunk);
  const base='http://127.0.0.1:'+port;
  let ready=false;for(let i=0;i<300;i++){try {if((await fetch(base+'/api/bookings/services')).ok){ready=true;break;}}catch{}if(server.exitCode!==null)break;await delay(100);}
  assert.ok(ready,'production-mode server failed: '+errors+' output='+output+' exit='+server.exitCode);
  const services=await fetch(base+'/api/bookings/services',{headers:{Origin:environment.SITE_URL}});
  assert.equal(services.headers.get('access-control-allow-origin'),environment.SITE_URL);assert.ok(services.headers.get('cache-control').includes('no-store'));
  assert.equal((await fetch(base+'/api/bookings/services',{headers:{Origin:'http://localhost:4000'}})).status,403);
  assert.equal((await fetch(base+'/api/admin/bookings')).status,401);
  assert.equal((await fetch(base+'/backend/config/database.js')).status,404);
  const pending=path.join(directory,'pending.sqlite');await writeFile(pending,'');
  for(const [env,expected] of [[{...environment,SITE_URL:'http://test.example'},'HTTPS origin'],[{...environment,DATABASE_FILE:pending},'explicit operator approval']]) {
    let failed;try {execFileSync(process.execPath,['server.js'],{cwd,env,timeout:10000,stdio:'pipe'});}catch(error){failed=error;}
    assert.ok(failed?.stderr.toString().includes(expected),'expected fail-closed startup: '+expected);
  }
  assert.equal((await readFile(pending)).length,0);
  console.log(JSON.stringify({productionStartup:'passed',httpsConfigurationGuard:'passed',cors:'passed',adminAccess:'passed',sourceProtection:'passed',unapprovedMigrationNoWrites:'passed',externalRequests:0}));
} finally {
  if(server && server.exitCode===null){server.kill();await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(3000)]);}
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep+'isbeauty-prod-startup-'));
  await rm(directory,{recursive:true,force:true});
}
