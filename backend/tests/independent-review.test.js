import { jest } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import { db, initializeDatabase } from '../config/database.js';
import bookings from '../routes/bookings.js';
import auth from '../routes/auth.js';
import admin from '../routes/admin/bookings.js';
import { verifyAdmin } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { sendDueReminders } from '../utils/reminders.js';
import { sendBrevoEmail } from '../utils/brevo.js';
import { sendReminderSms } from '../utils/twilio.js';
import { tomorrowParis } from '../utils/dates.js';
const app=express(); app.use(express.json()); app.use('/auth',auth);app.use('/bookings',bookings);app.use('/admin',verifyAdmin,admin);app.use(errorHandler);
const email='review@example.com';const id='1479fb4f-0456-4d8d-82b0-08307a52c6f4';
let hash;
beforeAll(async()=>{await initializeDatabase();hash=await bcrypt.hash('Password123!',4);});
beforeEach(async()=>{await db.run('DELETE FROM bookings');await db.run('DELETE FROM users');sendBrevoEmail.mockReset().mockResolvedValue(true);sendReminderSms.mockReset().mockResolvedValue(true);});
async function user(role='client',secret=null){await db.run('INSERT INTO users(id,email,passwordHash,role,emailVerified,twoFactorEnabled,twoFactorSecret,createdAt) VALUES (?,?,?,?,?,?,?,?)',id,email,hash,role,1,secret?1:0,secret,new Date().toISOString());return jwt.sign({id,email,role},process.env.JWT_SECRET);}
async function booking(){const query=request(app).post('/bookings'); const account=await db.get('SELECT id FROM users WHERE id=?',id); if(account)query.set('Authorization','Bearer '+jwt.sign({id},process.env.JWT_SECRET)); const res=await query.send({clientName:'Synthetic',clientEmail:email,clientPhone:'+33600000000',serviceZone:'visage',appointmentDate:'2099-06-15',appointmentStart:'10:00'});expect(res.status).toBe(201);return res.body.bookingId;}
const source = file => readFileSync(new URL('../../'+file,import.meta.url),'utf8');
test.each([false,true])('PWA pages use fresh network content and retain offline fallback: offline=%s',async(offline)=>{
  const handlers={};const cached={body:'offline-cache'};const network={body:'current-html'};
  const fetch=jest.fn(offline?async()=>{throw new Error('offline');}:async()=>network);
  const context=vm.createContext({URL,Response,fetch,caches:{match:async()=>cached},self:{addEventListener:(name,handler)=>{handlers[name]=handler;}}});
  vm.runInContext(source('service-worker.js'),context);
  let pending;handlers.fetch({request:{url:'https://test.example/compte.html',method:'GET',mode:'navigate'},respondWith:value=>{pending=value;}});
  expect(await pending).toBe(offline?cached:network);expect(fetch).toHaveBeenCalledTimes(1);
});
function elements(){const map={};return {map,document:{createElement:()=>({addEventListener:()=>{}}),getElementById:key=>map[key]??=( {appendChild:()=>{},addEventListener:()=>{},textContent:'',innerHTML:'',className:'',value:key==='loginEmail'?email:'Password123!'} )}};}
function functionSource(file,name,next){const s=source(file);return s.slice(s.indexOf(`async function ${name}()`),s.indexOf(next,s.indexOf(`async function ${name}()`)));}
function migration(scenario){const output=execFileSync(process.execPath,[new URL('./review-migration.mjs',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'),scenario],{env:{...process.env,DOTENV_CONFIG_PATH:'__no_test_env__'},encoding:'utf8',timeout:15000});return JSON.parse(output.trim().split('\n').at(-1));}
test('VALIDATED: disk migration preserves rows, normalizes status, survives restart and enforces races across connections',()=>{const result=migration('normal');expect(result.originalUnchanged).toBe(true);expect(result.before.rows).toBe(5);expect(result.before.points).toBe(10);expect(result.before.historical).toBe(1);expect(result.before.cancelled).toBe('cancelled');expect(result.before.integrity.integrity_check).toBe('ok');expect(result.before.foreignKeys).toEqual([]);expect(result.before.triggers).toHaveLength(5);expect(result.idempotent).toBe(true);expect(result.afterHistorical).toBe(10);expect(result.concurrent.filter(s=>s==='ok')).toHaveLength(1);expect(result.concurrent.some(s=>s.includes('booking_overlap'))).toBe(true);});
test('FIXED: interrupted legacy migration cannot credit historical booking again',()=>{const result=migration('interrupted');expect(result.before.historical).toBe(1);expect(result.afterHistorical).toBe(10);});
test('FIXED: linked legacy zero points falls back to price/10',()=>{const result=migration('normal');expect(result.afterZero).toBe(result.afterHistorical+5);});
test('FIXED: verified-client page renders reduced API booking data',async()=>{const token=await user();await booking();const api=await request(app).get('/bookings').set('Authorization',`Bearer ${token}`);expect(api.status).toBe(200);expect(api.body.bookings).toHaveLength(1);const dom=elements();const context=vm.createContext({...dom,API:'',token,user:{email},escapeBookingText:value=>value,formatDate:()=>({day:'15',month:'juin'}),statusLabel:value=>value,statusClass:value=>value,fetch:async()=>({ok:true,json:async()=>api.body})});vm.runInContext(functionSource('espace-client.html','loadBookings','// ── NAVIGATION'),context);await context.loadBookings();expect(dom.map.rdvList.innerHTML).toContain('Visage');expect(dom.map.dashSessions.textContent).toBe(0);});
test('FIXED: client page surfaces verification 403',async()=>{const dom=elements();const context=vm.createContext({...dom,API:'',token:'fake',user:{email},fetch:async()=>({ok:false,status:403,json:async()=>({message:'Veuillez verifier votre adresse email.'})})});vm.runInContext(functionSource('espace-client.html','loadBookings','// ── NAVIGATION'),context);await context.loadBookings();expect(dom.map.rdvList.textContent).toContain('verifier');});
test.each(['compte.html','js/admin.js'])('FIXED: %s surfaces invalid OTP',async(file)=>{const dom=elements();let calls=0;const context=vm.createContext({...dom,API:'',token:'',window:{prompt:()=> '000000'},localStorage:{setItem:jest.fn()},fetch:async()=>++calls===1?{ok:true,json:async()=>({twoFactorRequired:true,challengeToken:'test'})}:{ok:false,status:401,json:async()=>({message:'Code 2FA invalide.'})}});vm.runInContext(functionSource(file,'login',file==='compte.html'?'// ── REGISTER':'function logout'),context);await context.login();expect(dom.map.loginError.textContent).toBe('Code 2FA invalide.');});
test('FIXED: password change invalidates existing 2FA challenge',async()=>{const secret=speakeasy.generateSecret().base32;const access=await user('client',secret);const login=await request(app).post('/auth/login').send({email,password:'Password123!'});expect(login.body.challengeToken).toBeTruthy();expect((await request(app).patch('/auth/password').set('Authorization',`Bearer ${access}`).send({currentPassword:'Password123!',newPassword:'ChangedPassword123!'})).status).toBe(200);const response=await request(app).post('/auth/login/2fa').send({challengeToken:login.body.challengeToken,token:speakeasy.totp({secret,encoding:'base32'})});expect(response.status).toBe(401);});
test('FIXED: demoted administrator loses API access',async()=>{const access=await user('admin');await db.run("UPDATE users SET role='client' WHERE id=?",id);expect((await request(app).get('/admin').set('Authorization',`Bearer ${access}`)).status).toBe(403);});
test('FIXED: client cannot cancel completed booking',async()=>{const access=await user('admin');const bookingId=await booking();await request(app).patch(`/admin/${bookingId}/status`).set('Authorization',`Bearer ${access}`).send({status:'completed'});const row=await db.get('SELECT * FROM bookings WHERE id=?',bookingId);expect((await request(app).post('/bookings/cancel').send({token:row.cancellationToken})).status).toBe(409);expect((await db.get('SELECT points FROM users WHERE id=?',id)).points).toBe(4);});
test('FIXED: admin rejects invalid email and duration',async()=>{const access=await user('admin');const bookingId=await booking();const row=await db.get('SELECT * FROM bookings WHERE id=?',bookingId);const response=await request(app).patch(`/admin/${bookingId}`).set('Authorization',`Bearer ${access}`).send({...row,clientEmail:'not-an-email',appointmentEnd:'10:01'});expect(response.status).toBe(400);});
test('FINDING: a reminder accepted by provider is duplicated after marking fails',async()=>{await user();const bookingId=await booking();await db.run('UPDATE bookings SET appointmentDate=? WHERE id=?',tomorrowParis(),bookingId);sendBrevoEmail.mockClear();await db.exec("CREATE TRIGGER review_mark_failure BEFORE UPDATE OF reminderSentAt ON bookings BEGIN SELECT RAISE(ABORT,'mark_failed'); END;");try {await sendDueReminders();expect((await db.get('SELECT reminderSentAt FROM bookings WHERE id=?',bookingId)).reminderSentAt).toBeNull();}finally{await db.exec('DROP TRIGGER review_mark_failure');}await sendDueReminders();expect(sendBrevoEmail).toHaveBeenCalledTimes(2);});
test('FINDING: downtime across Paris midnight leaves yesterday-due reminder unprocessed',async()=>{await user();const bookingId=await booking();const today=new Date(tomorrowParis()+'T12:00:00Z');today.setUTCDate(today.getUTCDate()-1);await db.run('UPDATE bookings SET appointmentDate=? WHERE id=?',today.toISOString().slice(0,10),bookingId);sendBrevoEmail.mockClear();expect(await sendDueReminders()).toBe(0);expect(sendBrevoEmail).not.toHaveBeenCalled();});
test('VALIDATED: authentication import fails closed before startup without an acceptable secret',()=>{for(const secret of ['','short']){let failure;try{execFileSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('../config/jwt.js',import.meta.url).href)})`],{env:{...process.env,JWT_SECRET:secret,DOTENV_CONFIG_PATH:'__no_test_env__'},stdio:'pipe',timeout:5000});}catch(err){failure=err;}expect(failure).toBeTruthy();expect(failure.stderr.toString()).toContain('JWT_SECRET must');}});
test('FINDING: isolated scheduler instances both send the same reminder',async()=>{
  await user();const bookingId=await booking();await db.run('UPDATE bookings SET appointmentDate=? WHERE id=?',tomorrowParis(),bookingId);
  sendBrevoEmail.mockClear();
  let arrivals=0;let release;const barrier=new Promise(resolve=>{release=resolve;});
  sendBrevoEmail.mockImplementation(async()=>{if(++arrivals===2)release();await barrier;return true;});
  const actualSource=readFileSync(new URL('../utils/reminders.js',import.meta.url),'utf8');
  const {escapeHtml}=await import('../utils/html.js');
  async function instance(name){
    const context=vm.createContext({process,console:{warn:()=>{},log:()=>{}}});
    const module=new vm.SourceTextModule(actualSource,{context,identifier:name});
    await module.link(async specifier=>{
      const exports=specifier==='node-schedule'?{default:{}}:specifier.includes('database')?{db}:specifier.includes('brevo')?{sendBrevoEmail,sendBrevoSms:async()=>true}:specifier.includes('twilio')?{sendReminderSms}:specifier.includes('dates')?{tomorrowParis}:{escapeHtml};
      return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value);},{context});
    });
    await module.evaluate();return module.namespace;
  }
  const a=await instance('scheduler-a');const b=await instance('scheduler-b');
  expect(await Promise.all([a.sendDueReminders(),b.sendDueReminders()])).toEqual([1,1]);
  expect(sendBrevoEmail).toHaveBeenCalledTimes(2);
});
test('FINDING: unresolved push notification delays booking response despite saved data',async()=>{
  const {broadcastPushNotification}=await import('../utils/push.js');let release;const pending=new Promise(resolve=>{release=resolve;});
  broadcastPushNotification.mockClear();
  broadcastPushNotification.mockImplementationOnce(()=>pending);
  let finished=false;
  const response=request(app).post('/bookings').send({clientName:'Synthetic',clientEmail:email,clientPhone:'+33600000000',serviceZone:'visage',appointmentDate:'2099-06-15',appointmentStart:'10:00'}).then(value=>{finished=true;return value;});
  let row;for(let attempt=0;attempt<50;attempt++){row=await db.get('SELECT id FROM bookings');if(row && broadcastPushNotification.mock.calls.length)break;await new Promise(resolve=>setTimeout(resolve,10));}
  try{expect(row).toBeTruthy();expect(broadcastPushNotification).toHaveBeenCalledTimes(1);expect(finished).toBe(false);}finally{release();}
  expect((await response).status).toBe(201);
});

test('migration transaction rolls back schema and data on injected failure, then retries safely',()=>{
  const result=migration('rollback');expect(result.rollbackVerified).toBe(true);expect(result.before.historical).toBe(1);expect(result.before.points).toBe(10);expect(result.idempotent).toBe(true);
});
test('production-style startup refuses unapproved migration without writes and accepts already migrated database',()=>{
  const result=migration('production');expect(result.productionBlocked).toBe(true);expect(result.idempotent).toBe(true);expect(result.before.rows).toBe(5);
});
test('CI contains no deployment job or executable remote migration',()=>{
  const workflow=source('.github/workflows/deploy.yml');expect(workflow).not.toContain('ssh-action');expect(workflow).not.toContain('pm2 restart');expect(workflow).not.toMatch(/^  deploy:/m);
});
test('migration command requires exact approval before opening a database',()=>{
  const migrationUrl=new URL('../scripts/migrate.js',import.meta.url);
  let failure;try{execFileSync(process.execPath,[migrationUrl.pathname.replace(/^\/([A-Z]:)/i,'$1')],{env:{...process.env,DOTENV_CONFIG_PATH:'__no_test_env__',DATABASE_FILE:'__must_not_create__.sqlite'},stdio:'pipe',timeout:5000});}catch(err){failure=err;}
  expect(failure?.stderr.toString()).toContain('Migration refused');
  expect(existsSync('__must_not_create__.sqlite')).toBe(false);
});
