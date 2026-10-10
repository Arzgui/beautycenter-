// Standalone migration probe. Every database is generated under a new temporary directory.
import sqlite3 from 'sqlite3';
import { mkdtemp, readFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const dir = await mkdtemp(path.join(tmpdir(), 'isbeauty-review-'));
const original = path.join(dir, 'legacy-source.sqlite');
let filename = original;
process.env.DATABASE_FILE = filename;
process.env.DOTENV_CONFIG_PATH = '__no_test_env__';
const open = () => new Promise((resolve,reject) => { const raw = new sqlite3.Database(filename, err => err ? reject(err) : resolve(raw)); });
const helpers = raw => ({
  run: (sql,...params) => new Promise((resolve,reject) => raw.run(sql,params,function(err) { err ? reject(err) : resolve({changes:this.changes}); })),
  exec: sql => new Promise((resolve,reject) => raw.exec(sql,err => err ? reject(err) : resolve())),
  close: () => new Promise((resolve,reject) => raw.close(err => err ? reject(err) : resolve()))
});
let raw = await open(); let initial = helpers(raw); let module;
try {
  await initial.exec(await readFile(new URL('./review-legacy-schema.sql',import.meta.url),'utf8'));
  await initial.run("INSERT INTO users(id,email,passwordHash,points,createdAt) VALUES ('client','legacy@example.com','synthetic-hash',10,'2026-01-01')");
  const insert = async (id,date,start,end,status='pending',points=5) => initial.run('INSERT INTO bookings(id,clientName,clientEmail,clientPhone,serviceZone,serviceType,appointmentDate,appointmentStart,appointmentEnd,status,price,pointsEarned,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id,'Synthetic','legacy@example.com','+33600000000','visage','Visage',date,start,end,status,50,points,'2026-01-01');
  await insert('historical','2099-06-15','09:00','09:30','completed');
  await initial.run("UPDATE users SET emailVerified=1 WHERE id='client'");
  await initial.run("UPDATE bookings SET userId='client' WHERE id='historical'");
  await insert('cancelled-old','2099-06-16','09:00','09:30','canceled');
  await insert('existing','2099-06-16','09:00','09:30');
  await insert('overlap-a','2099-06-17','10:00','11:00');
  await insert('overlap-b','2099-06-17','10:30','11:30');
  const scenario = process.argv[2];
  if (scenario === 'rollback') await initial.exec("CREATE TABLE schema_migrations(version TEXT PRIMARY KEY, appliedAt TEXT NOT NULL); CREATE TRIGGER review_fail BEFORE INSERT ON schema_migrations BEGIN SELECT RAISE(ABORT, 'injected_migration_failure'); END;");
  if (scenario === 'interrupted') await initial.exec('ALTER TABLE bookings ADD COLUMN pointsAwarded INTEGER NOT NULL DEFAULT 0;');
  await initial.close(); raw = null;
  filename = path.join(dir, 'migration-copy.sqlite');
  await copyFile(original, filename);
  process.env.DATABASE_FILE = filename;
  module = await import('../config/database.js');
  let rollbackVerified = false, productionBlocked = false;
  if (scenario === 'production') {
    try { await module.initializeDatabase({ allowMigrations: false }); }
    catch (error) { productionBlocked = error.message.includes('explicit operator approval'); }
    if (!productionBlocked) throw new Error('Unapproved migration was not blocked');
    const check = await open();
    const columns = await new Promise((resolve,reject) => check.all('PRAGMA table_info(bookings)', (err, rows) => err ? reject(err) : resolve(rows)));
    if (columns.some(column => column.name === 'pointsAwarded')) throw new Error('Unapproved migration changed schema');
    await helpers(check).close();
  }
  if (scenario === 'rollback') {
    let rejected = false;
    try { await module.initializeDatabase(); } catch (error) { rejected = error.message.includes('injected_migration_failure'); }
    const check = await open();
    const columns = await new Promise((resolve,reject) => check.all('PRAGMA table_info(bookings)', (err, rows) => err ? reject(err) : resolve(rows)));
    rollbackVerified = rejected && !columns.some(column => column.name === 'pointsAwarded');
    await helpers(check).exec('DROP TRIGGER review_fail');
    await helpers(check).close();
  }
  await module.initializeDatabase({ allowMigrations: true });
  let db = module.db;
  const before = { rows:(await db.get('SELECT COUNT(*) AS n FROM bookings')).n,points:(await db.get("SELECT points FROM users WHERE id='client'")).points,historical:(await db.get("SELECT pointsAwarded FROM bookings WHERE id='historical'")).pointsAwarded,cancelled:(await db.get("SELECT status FROM bookings WHERE id='cancelled-old'")).status, integrity:await db.get('PRAGMA integrity_check'), foreignKeys:await db.all('PRAGMA foreign_key_check'), triggers:(await db.all("SELECT name FROM sqlite_master WHERE type='trigger'")).map(r=>r.name) };
  await new Promise(resolve => db.raw.close(resolve));
  await module.initializeDatabase({ allowMigrations: false }); db = module.db;
  const idempotent = (await db.get("SELECT points FROM users WHERE id='client'")).points === before.points;
  await db.run("UPDATE bookings SET status='confirmed' WHERE id='historical'");
  await db.run("UPDATE bookings SET status='completed' WHERE id='historical'");
  const afterHistorical = (await db.get("SELECT points FROM users WHERE id='client'")).points;
  raw = await open(); raw.configure('busyTimeout',5000); const second = helpers(raw);
  const make = (handle,id) => handle.run("INSERT INTO bookings(id,clientName,clientEmail,clientPhone,serviceZone,serviceType,appointmentDate,appointmentStart,appointmentEnd,price,pointsEarned,createdAt) VALUES (?, 'Synthetic','legacy@example.com','+33600000000','visage','Visage','2099-06-18','10:00','10:30',50,5,'2026-01-01')", id);
  const competing = await Promise.allSettled([make(db,'race-a'),make(second,'race-b')]);
  await second.close(); raw = null;
  await db.run("INSERT INTO bookings(id,clientName,clientEmail,clientPhone,serviceZone,serviceType,appointmentDate,appointmentStart,appointmentEnd,price,pointsEarned,createdAt) VALUES ('zero','Synthetic','legacy@example.com','+33600000000','visage','Visage','2099-06-19','10:00','10:30',50,0,'2026-01-01')");
  await db.run("UPDATE bookings SET userId='client' WHERE id='zero'");
  await db.run("UPDATE bookings SET status='completed' WHERE id='zero'");
  const afterZero = (await db.get("SELECT points FROM users WHERE id='client'")).points;
  let overlapUpdate;
  try { await db.run("UPDATE bookings SET status='confirmed' WHERE id='overlap-a'"); overlapUpdate='allowed'; } catch(err) { overlapUpdate=err.message; }
  const originalRaw = await new Promise((resolve,reject) => { const handle = new sqlite3.Database(original, sqlite3.OPEN_READONLY, error => error ? reject(error) : resolve(handle)); });
  const originalRow = await new Promise((resolve,reject) => originalRaw.get("SELECT status FROM bookings WHERE id='cancelled-old'", (error,row) => error ? reject(error) : resolve(row)));
  await helpers(originalRaw).close();
  const originalUnchanged = originalRow.status === 'canceled';
  console.log(JSON.stringify({before,idempotent,rollbackVerified,productionBlocked,originalUnchanged,afterHistorical,afterZero,concurrent:competing.map(r=>r.status==='fulfilled'?'ok':r.reason.message),overlapUpdate}));
} finally {
  if(raw) await helpers(raw).close();
  if(module?.db) await new Promise(resolve=>module.db.raw.close(resolve));
  // Only the directory created by this probe is removed.
  await rm(dir,{recursive:true,force:true});
}
