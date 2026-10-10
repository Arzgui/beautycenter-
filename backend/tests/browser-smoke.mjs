// Optional real-browser smoke test: Chrome headless, isolated profile/database, no external services.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const directory = await mkdtemp(path.join(tmpdir(),'isbeauty-browser-'));
process.env.DATABASE_FILE = path.join(directory,'synthetic.sqlite');
process.env.DOTENV_CONFIG_PATH = '__no_test_env__';
process.env.JWT_SECRET = 'browser-test-only-random-shaped-secret-123456';
process.env.NODE_ENV = 'test';
for(const key of ['BREVO_API_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_PHONE_NUMBER','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY'])process.env[key]='';
process.env.VAPID_SUBJECT='mailto:test@example.com';
const {initializeDatabase,db:unused} = await import('../config/database.js');
const databaseModule=await import('../config/database.js');
const bcrypt=(await import('bcrypt')).default;
const speakeasy=(await import('speakeasy')).default;
const jwt=(await import('jsonwebtoken')).default;
const secret=speakeasy.generateSecret().base32;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let server,chrome,ws;
try {
  await initializeDatabase();
  const db=databaseModule.db;
  for(const [id,email,role,twoFactor] of [['admin','browser-admin@example.com','admin',1],['client','browser-client@example.com','client',0]])await db.run('INSERT INTO users(id,email,passwordHash,role,emailVerified,twoFactorEnabled,twoFactorSecret,createdAt) VALUES (?,?,?,?,?,?,?,?)',id,email,await bcrypt.hash('BrowserPassword123!',4),role,1,twoFactor,twoFactor?secret:null,new Date().toISOString());
  await new Promise(resolve=>db.raw.close(resolve));
  const portServer=net.createServer();await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
  const base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['server.js'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:String(port),SITE_URL:base,CORS_ORIGINS:base},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let serverErrors='';server.stderr.on('data',chunk=>{serverErrors+=chunk;});server.stdout.resume();
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/bookings/services')).ok){ready=true;break;}}catch{}await delay(100);}
  assert.ok(ready,'isolated server failed to start: '+serverErrors);
  chrome=spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${path.join(directory,'chrome-profile')}`,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
  const debuggerUrl=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Chrome did not expose DevTools')),15000);chrome.on('error',reject);chrome.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  ws=new WebSocket(debuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let sequence=0;const pending=new Map();const exceptions=[];
  function command(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const call=pending.get(message.id);if(call){clearTimeout(call.timer);pending.delete(message.id);message.error?call.reject(new Error(message.error.message)):call.resolve(message.result);}}if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text+' '+(message.params.exceptionDetails.exception?.description || ''));if(message.method==='Page.javascriptDialogOpening')command('Page.handleJavaScriptDialog',{accept:true,promptText:speakeasy.totp({secret,encoding:'base32'})},message.sessionId).catch(()=>{});});
  const {targetId}=await command('Target.createTarget',{url:'about:blank'});const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
  const send=(method,params)=>command(method,params,sessionId);
  await send('Emulation.setTimezoneOverride',{timezoneId:'Pacific/Honolulu'});
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*']});
  async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);return result.result.value;}
  async function until(expression){for(let i=0;i<100;i++){try{if(await evaluate(expression))return;}catch{}await delay(100);}throw new Error('Browser condition not met: '+expression+' '+JSON.stringify(await evaluate("({loginError:document.getElementById('loginError')?.textContent,toast:document.getElementById('toast')?.textContent,app:document.getElementById('app')?.className,readyState:document.readyState})"))+' exceptions='+JSON.stringify(exceptions));}
  await send('Page.navigate',{url:base+'/admin.html'});
  await until("document.readyState==='complete' && document.getElementById('loginBtn') && typeof login === 'function'");
  await evaluate("document.getElementById('loginEmail').value='browser-admin@example.com';document.getElementById('loginPassword').value='BrowserPassword123!';document.getElementById('loginBtn').click();true");
  await until("document.getElementById('app').classList.contains('visible') && document.querySelectorAll('[data-service]').length===9");
  await evaluate("document.querySelector('[data-page=configuration]').click();true");
  await until("document.getElementById('page-configuration').classList.contains('active') && document.querySelector('[data-service]').parentElement.querySelectorAll('tr').length===9");
  await evaluate("const row=Array.from(document.querySelectorAll('[data-service]')).find(row=>row.dataset.service==='default:visage');row.querySelector('[data-duration]').value='60';row.querySelector('[data-save]').click();true");
  const auth=jwt.sign({id:'admin'},process.env.JWT_SECRET);
  let configured=false;for(let i=0;i<40;i++){const data=await (await fetch(base+'/api/bookings/services')).json();if(data.services.find(s=>s.zone==='visage').duration===60){configured=true;break;}await delay(100);}assert.ok(configured,'admin UI duration was not persisted');
  let chosen=new Date();chosen.setUTCDate(chosen.getUTCDate()+2);while(chosen.getUTCDay()===0)chosen.setUTCDate(chosen.getUTCDate()+1);const date=chosen.toISOString().slice(0,10);
  await evaluate(`document.getElementById('blockedDate').value=${JSON.stringify(date)};document.getElementById('blockedStart').value='14:00';document.getElementById('blockedEnd').value='15:00';document.getElementById('blockedReason').value='Synthetic pause';document.getElementById('unavailabilityForm').requestSubmit();true`);
  await until("document.getElementById('unavailabilityBody').textContent.includes('Synthetic pause')");
  await send('Page.navigate',{url:base+'/index.html#booking'});
  await until("document.readyState==='complete' && document.getElementById('bZone')?.options.length===10 && document.querySelector('.calendar-day')");
  const parisDay=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',day:'numeric'}).format(new Date()));
  assert.equal(await evaluate("Number(document.querySelector('.calendar-day.today').textContent)"),parisDay,'calendar today must follow Paris even for a browser in Honolulu');
  await evaluate(`if(new Date(${JSON.stringify(date)}+'T12:00:00').getMonth()!==new Date().getMonth())document.getElementById('calendarNext').click();true`);
  await evaluate(`document.getElementById('bZone').value='visage';document.getElementById('bZone').dispatchEvent(new Event('change'));Array.from(document.querySelectorAll('.calendar-day')).find(button=>Number(button.textContent)===${chosen.getUTCDate()} && !button.disabled).click();true`);
  const expectedAvailability=await (await fetch(base+'/api/bookings/availability?date='+date+'&serviceZone=visage')).json();
  await until(`document.querySelectorAll('.slot-button').length===${expectedAvailability.availableSlots.length}`);
  const grid=await evaluate("Array.from(document.querySelectorAll('.slot-button')).map(button=>({time:button.textContent,disabled:button.disabled}))");
  assert.ok(grid.some(slot=>slot.time==='09:15' && !slot.disabled));assert.ok(!grid.some(slot=>slot.time==='13:15'));assert.ok(!grid.some(slot=>slot.time==='18:15'));
  assert.deepEqual(grid.map(slot=>slot.time),expectedAvailability.availableSlots);assert.ok(grid.every(slot=>!slot.disabled));
  await evaluate("document.getElementById('bName').value='Browser guest';document.getElementById('bEmail').value='browser-client@example.com';document.getElementById('bPhone').value='+33600000000';document.getElementById('bConsent').checked=true;Array.from(document.querySelectorAll('.slot-button')).find(button=>button.textContent==='09:15').click();document.getElementById('bookingForm').requestSubmit();true");
  let stored;for(let i=0;i<40;i++){const response=await fetch(base+'/api/admin/bookings',{headers:{Authorization:'Bearer '+auth}});const data=await response.json();stored=data.bookings.find(b=>b.clientEmail==='browser-client@example.com');if(stored)break;await delay(100);}assert.ok(stored,'browser guest booking missing');assert.equal(stored.appointmentEnd,'10:15');assert.equal(stored.userId,null);
  await send('Page.navigate',{url:base+'/compte.html'});await until("document.readyState==='complete' && document.getElementById('loginBtn') && typeof login==='function'");
  await evaluate("document.getElementById('loginEmail').value='browser-client@example.com';document.getElementById('loginPassword').value='BrowserPassword123!';document.getElementById('loginBtn').click();true");
  await until("location.pathname==='/espace-client.html' && document.querySelector('.rdv-item')");
  assert.ok((await evaluate("document.getElementById('rdvList').textContent")).includes('Visage'));
  assert.deepEqual(exceptions,[],'uncaught browser JavaScript exceptions');
  console.log(JSON.stringify({admin2fa:'passed',configureDuration:'passed',createUnavailability:'passed',dynamic15MinuteGrid:'passed',guestBooking:'passed',durationAndClosing:'passed',clientLoginAndHistory:'passed',browserExceptions:exceptions.length}));
} finally {
  if(ws?.readyState===WebSocket.OPEN)ws.close();
  for(const child of [chrome,server])if(child && child.exitCode===null){child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(3000)]);}
  // Remove only the verified generated temp directory after stopping children.
  assert.ok(directory.startsWith(path.join(tmpdir(),'isbeauty-browser-')));
  for(let i=0;i<10;i++){try{await rm(directory,{recursive:true,force:true});break;}catch(error){if(i===9)throw error;await delay(500);}}
}
