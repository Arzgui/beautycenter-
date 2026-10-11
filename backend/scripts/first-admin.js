import { initializeDatabase, db } from '../config/database.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function promoteFirstAdmin(database, email) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Valid email required');
  await database.exec('BEGIN IMMEDIATE');
  try {
    if (await database.get("SELECT id FROM users WHERE role='admin' LIMIT 1")) throw new Error('An administrator already exists');
    const accounts = await database.all('SELECT id, emailVerified FROM users WHERE lower(email)=lower(?)', email);
    if (accounts.length !== 1 || !accounts[0].emailVerified) throw new Error('Exactly one email-verified account is required');
    await database.run("UPDATE users SET role='admin', sessionVersion=sessionVersion+1, loginChallenge=NULL WHERE id=?", accounts[0].id);
    await database.exec('COMMIT');
  } catch (error) { await database.exec('ROLLBACK'); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv.includes('--approve-first-admin')) throw new Error('Explicit --approve-first-admin required');
    const email = process.argv.find(arg => arg.startsWith('--email='))?.slice(8);
    await initializeDatabase({ allowMigrations: false });
    await promoteFirstAdmin(db, email);
    console.log('First administrator promoted; sign in again and configure 2FA.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { if (db) await new Promise(resolve => db.raw.close(resolve)); }
}
