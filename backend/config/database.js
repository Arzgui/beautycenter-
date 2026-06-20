import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_FILE = process.env.DATABASE_FILE || './database.sqlite';

export let db;

export async function initializeDatabase() {
  const rawDb = await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(DATABASE_FILE, (err) => {
      if (err) return reject(err);
      resolve(database);
    });
  });

  // Promise-wrapped helpers matching the previous `sqlite` open() API
  db = {
    exec: (sql) => new Promise((res, rej) => rawDb.exec(sql, (err) => (err ? rej(err) : res()))),
    run: (sql, ...params) =>
      new Promise((res, rej) => rawDb.run(sql, params, function (err) {
        if (err) return rej(err);
        res(this);
      })),
    get: (sql, ...params) => new Promise((res, rej) => rawDb.get(sql, params, (err, row) => (err ? rej(err) : res(row)))),
    all: (sql, ...params) => new Promise((res, rej) => rawDb.all(sql, params, (err, rows) => (err ? rej(err) : res(rows)))),
    raw: rawDb,
  };

  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      name TEXT,
      points INTEGER DEFAULT 0,
      twoFactorSecret TEXT,
      twoFactorEnabled INTEGER DEFAULT 0,
      role TEXT DEFAULT 'client',
      emailVerified INTEGER DEFAULT 0,
      emailVerificationToken TEXT,
      createdAt TEXT NOT NULL
    );

   CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      userId TEXT,
      clientName TEXT NOT NULL,
      clientEmail TEXT NOT NULL,
      clientPhone TEXT NOT NULL,
      serviceZone TEXT NOT NULL,
      serviceType TEXT NOT NULL,
      appointmentDate TEXT NOT NULL,
      appointmentStart TEXT NOT NULL,
      appointmentEnd TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      price INTEGER NOT NULL,
      pointsEarned INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      reminderSentAt TEXT,
      cancellationToken TEXT,
      cancelledAt TEXT,
      cancelledBy TEXT,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      zone TEXT NOT NULL,
      duration INTEGER NOT NULL,
      price INTEGER NOT NULL,
      label TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      token TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      subscription TEXT NOT NULL,
      email TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    );

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
  `);

  // Migration : colonnes pour les rappels J-1 et l'annulation par le client
  const bookingColumns = await db.all("PRAGMA table_info(bookings);");
  const columnNames = bookingColumns.map((col) => col.name);

  if (!columnNames.includes('reminderSentAt')) {
    await db.exec('ALTER TABLE bookings ADD COLUMN reminderSentAt TEXT;');
  }
  if (!columnNames.includes('cancellationToken')) {
    await db.exec('ALTER TABLE bookings ADD COLUMN cancellationToken TEXT;');
  }
  if (!columnNames.includes('cancelledAt')) {
    await db.exec('ALTER TABLE bookings ADD COLUMN cancelledAt TEXT;');
  }
if (!columnNames.includes('cancelledBy')) {
    await db.exec('ALTER TABLE bookings ADD COLUMN cancelledBy TEXT;');
  }

  const userColumns = await db.all("PRAGMA table_info(users);");
  const userColumnNames = userColumns.map((col) => col.name);

  if (!userColumnNames.includes('emailVerified')) {
    await db.exec('ALTER TABLE users ADD COLUMN emailVerified INTEGER DEFAULT 0;');
  }
  if (!userColumnNames.includes('emailVerificationToken')) {
    await db.exec('ALTER TABLE users ADD COLUMN emailVerificationToken TEXT;');
  }
}