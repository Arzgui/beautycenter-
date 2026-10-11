import sqlite3 from 'sqlite3';
import { open, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

// VACUUM INTO creates a coherent SQLite snapshot, including committed WAL pages.
// Both backup and restore always create a new file; neither overwrites anything.
export async function snapshot(source, destination) {
  const sourcePath = await realpath(source);
  const parent = await realpath(path.dirname(path.resolve(destination)));
  const repo = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
  if (parent === repo || parent.startsWith(repo + path.sep)) throw new Error('Snapshots must be stored outside the web repository');
  const output = path.join(parent, path.basename(destination));
  if (output === sourcePath) throw new Error('Source and destination must differ');
  // Exclusive reservation prevents concurrent jobs or operators overwriting a file.
  const reserved = await open(output, 'wx', 0o600); await reserved.close();
  let database;
  try {
    database = await new Promise((resolve,reject) => {
      const handle = new sqlite3.Database(sourcePath, sqlite3.OPEN_READONLY, error => error ? reject(error) : resolve(handle));
    });
    database.configure('busyTimeout', 5000);
    await new Promise((resolve,reject) => database.run('VACUUM INTO ?', output, error => error ? reject(error) : resolve()));
  } finally {
    if (database) await new Promise((resolve,reject) => database.close(error => error ? reject(error) : resolve()));
  }
  const check = await new Promise((resolve,reject) => {
    const handle = new sqlite3.Database(output, sqlite3.OPEN_READONLY, error => error ? reject(error) : resolve(handle));
  });
  try {
    const rows = await new Promise((resolve,reject) => check.all('PRAGMA integrity_check', (error,rows) => error ? reject(error) : resolve(rows)));
    const foreignKeys = await new Promise((resolve,reject) => check.all('PRAGMA foreign_key_check', (error,rows) => error ? reject(error) : resolve(rows)));
    if (rows.length !== 1 || rows[0].integrity_check !== 'ok' || foreignKeys.length) throw new Error('Snapshot failed integrity/foreign key checks');
  } finally { await new Promise(resolve => check.close(resolve)); }
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
  try {
    const source = process.argv.find(arg => arg.startsWith('--source='))?.slice(9) || process.env.DATABASE_FILE;
    let output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
    if (!source) throw new Error('DATABASE_FILE or --source is required');
    if (!output) {
      if (!process.env.BACKUP_DIRECTORY) throw new Error('BACKUP_DIRECTORY or --output is required');
      await mkdir(process.env.BACKUP_DIRECTORY, { recursive: true, mode: 0o700 });
      output = path.join(process.env.BACKUP_DIRECTORY, 'isbeauty-' + new Date().toISOString().replace(/[:.]/g,'-') + '-' + randomUUID() + '.sqlite');
    }
    console.log('Snapshot verified: ' + await snapshot(source, output));
  } catch (error) {
    console.error('Snapshot failed; any partial output is retained and must not be used: ' + error.message);
    process.exitCode = 1;
  }
}
