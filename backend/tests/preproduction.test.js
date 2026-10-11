import { jest } from '@jest/globals';
import sqlite3 from 'sqlite3';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import request from 'supertest';
import vm from 'node:vm';
import { validateRuntime } from '../config/runtime.js';
import { snapshot } from '../scripts/backup.js';
import { promoteFirstAdmin } from '../scripts/first-admin.js';
import { initializeDatabase, db } from '../config/database.js';
import { protectSourceFiles } from '../middleware/publicFiles.js';
import { authLimiter, authSetupLimiter } from '../middleware/rateLimiter.js';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const production={NODE_ENV:'production',SITE_URL:'https://test.example',CORS_ORIGINS:'https://test.example',DATABASE_FILE:path.resolve(tmpdir(),'synthetic.sqlite'),VAPID_PUBLIC_KEY:'synthetic-public',VAPID_PRIVATE_KEY:'synthetic-private',VAPID_SUBJECT:'mailto:test@example.com',BREVO_API_KEY:'synthetic',BREVO_SENDER_EMAIL:'test@example.com',BREVO_SENDER_NAME:'Test'};
test('production accepts explicit HTTPS configuration, development remains compatible',()=>{expect(()=>validateRuntime(production)).not.toThrow();expect(()=>validateRuntime({NODE_ENV:'test'})).not.toThrow();});
test('2FA setup remains rate limited without consuming the login attempt budget',async()=>{
  const app=express();app.get('/setup',authSetupLimiter,(_req,res)=>res.sendStatus(200));app.get('/login',authLimiter,(_req,res)=>res.sendStatus(200));
  for(let i=0;i<6;i++)expect((await request(app).get('/setup')).status).toBe(200);
  expect((await request(app).get('/setup')).status).toBe(429);
  for(let i=0;i<6;i++)expect((await request(app).get('/login')).status).toBe(200);
  expect((await request(app).get('/login')).status).toBe(429);
});
test.each([
  ['SITE_URL','http://test.example'],['SITE_URL','https://test.example/path'],['CORS_ORIGINS','*'],['CORS_ORIGINS','https://other.example'],['CORS_ORIGINS','https://test.example,http://other.example'],['DATABASE_FILE','./database.sqlite'],['VAPID_PUBLIC_KEY',''],['VAPID_PRIVATE_KEY',''],['BREVO_API_KEY','your_brevo_api_key'],['BREVO_SENDER_EMAIL',''],['PORT','0'],['TRUST_PROXY','true'],
])('production rejects unsafe/missing %s=%s',(key,value)=>{expect(()=>validateRuntime({...production,[key]:value})).toThrow();});

let directory,source;
const openDb=(filename,mode=sqlite3.OPEN_READWRITE|sqlite3.OPEN_CREATE)=>new Promise((resolve,reject)=>{const handle=new sqlite3.Database(filename,mode,error=>error?reject(error):resolve(handle));});
const close=handle=>new Promise((resolve,reject)=>handle.close(error=>error?reject(error):resolve()));
const exec=(handle,sql)=>new Promise((resolve,reject)=>handle.exec(sql,error=>error?reject(error):resolve()));
const get=(handle,sql)=>new Promise((resolve,reject)=>handle.get(sql,(error,row)=>error?reject(error):resolve(row)));
beforeAll(async()=>{directory=await mkdtemp(path.join(tmpdir(),'isbeauty-preproduction-'));source=await openDb(path.join(directory,'source.sqlite'));await exec(source,"PRAGMA journal_mode=WAL; CREATE TABLE evidence(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO evidence VALUES(1,'preserved');");await initializeDatabase();});
afterAll(async()=>{await close(source);if(!path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep+'isbeauty-preproduction-'))throw new Error('Unexpected cleanup path');await rm(directory,{recursive:true,force:true});});
test('online WAL snapshot restores to new file and never alters the source',async()=>{
  const backup=path.join(directory,'backup.sqlite'),restored=path.join(directory,'restored.sqlite');
  await snapshot(path.join(directory,'source.sqlite'),backup);
  await exec(source,"INSERT INTO evidence VALUES(2,'after backup');");
  await snapshot(backup,restored);
  const handle=await openDb(restored,sqlite3.OPEN_READONLY);
  try {expect((await get(handle,'SELECT COUNT(*) AS n FROM evidence')).n).toBe(1);expect((await get(handle,'SELECT value FROM evidence')).value).toBe('preserved');expect((await get(handle,'PRAGMA integrity_check')).integrity_check).toBe('ok');}
  finally {await close(handle);}
  expect((await get(source,'SELECT COUNT(*) AS n FROM evidence')).n).toBe(2);
});
test('snapshot refuses to overwrite any existing destination',async()=>{
  const target=path.join(directory,'existing.sqlite');await writeFile(target,'do not overwrite');
  await expect(snapshot(path.join(directory,'source.sqlite'),target)).rejects.toThrow();expect(await readFile(target,'utf8')).toBe('do not overwrite');
});
test('missing source is refused without creating a database',async()=>{await expect(snapshot(path.join(directory,'missing.sqlite'),path.join(directory,'unused.sqlite'))).rejects.toThrow();});
test('snapshots cannot be written under the web repository',async()=>{await expect(snapshot(path.join(directory,'source.sqlite'),new URL('../__forbidden__.sqlite',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'))).rejects.toThrow('outside the web repository');});
test('corrupt input fails rather than reporting a successful backup',async()=>{const corrupt=path.join(directory,'corrupt.sqlite');await writeFile(corrupt,'not a SQLite database');await expect(snapshot(corrupt,path.join(directory,'failed.sqlite'))).rejects.toThrow();});

beforeEach(async()=>{await db.run('DELETE FROM bookings');await db.run('DELETE FROM users');});
async function account(id,verified){await db.run('INSERT INTO users(id,email,passwordHash,emailVerified,createdAt) VALUES(?,?,?,?,?)',id,id+'@example.com','synthetic',verified,new Date().toISOString());}
test('first-admin promotion requires verified identity and revokes existing sessions/challenge',async()=>{
  await account('owner',1);await db.run("UPDATE users SET loginChallenge='old' WHERE id='owner'");
  await promoteFirstAdmin(db,'OWNER@example.com');const user=await db.get("SELECT * FROM users WHERE id='owner'");
  expect(user.role).toBe('admin');expect(user.sessionVersion).toBe(1);expect(user.loginChallenge).toBeNull();
  await expect(promoteFirstAdmin(db,'owner@example.com')).rejects.toThrow('already exists');
});
test('first-admin promotion refuses unverified, missing and ambiguous addresses without changing roles',async()=>{
  await account('owner',0);await expect(promoteFirstAdmin(db,'owner@example.com')).rejects.toThrow('verified');
  await expect(promoteFirstAdmin(db,'missing@example.com')).rejects.toThrow('verified');
  await db.run("UPDATE users SET emailVerified=1 WHERE id='owner'");await account('duplicate',1);await db.run("UPDATE users SET email='OWNER@example.com' WHERE id='duplicate'");
  await expect(promoteFirstAdmin(db,'owner@example.com')).rejects.toThrow('Exactly one');expect((await db.get("SELECT COUNT(*) AS n FROM users WHERE role='admin'")).n).toBe(0);
});
test('first-admin CLI requires explicit approval before opening any database',()=>{
  const filename=path.join(directory,'must-not-create.sqlite');
  expect(()=>execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/first-admin.js',import.meta.url)),'--email=owner@example.com'],{env:{...process.env,DATABASE_FILE:filename,DOTENV_CONFIG_PATH:'__no_test_env__'},stdio:'pipe',timeout:5000})).toThrow();
  expect(existsSync(filename)).toBe(false);
});
test('static file protection prevents existing snapshots and config files from being exposed',async()=>{
  await writeFile(path.join(directory,'backup.sqlite'),'sensitive');await writeFile(path.join(directory,'settings.json'),'sensitive');await writeFile(path.join(directory,'compte.html'),'public');
  const app=express();app.use(protectSourceFiles);app.use(express.static(directory));
  for(const url of ['/backup.sqlite','/settings.json','/%62ackup.sqlite','/.env','/backend/config/database.js'])expect((await request(app).get(url)).status).toBe(404);
  expect((await request(app).get('/compte.html')).text).toBe('public');
});
test('service worker activation deletes only obsolete app caches and claims clients after cleanup',async()=>{
  const handlers={},deleted=[];let cleanupDone=false;
  const claim=jest.fn(()=>{expect(cleanupDone).toBe(true);});
  vm.runInNewContext(await readFile(new URL('../../service-worker.js',import.meta.url),'utf8'),{self:{addEventListener:(name,handler)=>handlers[name]=handler,clients:{claim}},caches:{keys:async()=>['is-beauty-pwa-v3','is-beauty-pwa-v5-preproduction','unrelated'],delete:async name=>{deleted.push(name);cleanupDone=true;}}});
  let pending;handlers.activate({waitUntil:value=>pending=value});await pending;
  expect(deleted).toEqual(['is-beauty-pwa-v3']);expect(claim).toHaveBeenCalledTimes(1);
});
test('service worker requests current CSS before any cached stylesheet',async()=>{
  const handlers={},current={body:'new CSS'},cached={body:'old CSS'};
  const fetch=jest.fn(async()=>current),match=jest.fn(async()=>cached);
  vm.runInNewContext(await readFile(new URL('../../service-worker.js',import.meta.url),'utf8'),{URL,Response,fetch,caches:{match},self:{addEventListener:(name,handler)=>handlers[name]=handler}});
  let pending;handlers.fetch({request:{method:'GET',url:'https://test.example/css/laser-premium-v2.css',mode:'cors'},respondWith:value=>pending=value});
  expect(await pending).toBe(current);expect(fetch).toHaveBeenCalledTimes(1);expect(match).not.toHaveBeenCalled();
});
