import { defaultServices } from '../utils/services.js';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const DATABASE_FILE = process.env.DATABASE_FILE || './database.sqlite';

export let db;

export const DATABASE_VERSION = '2026-10-booking-v2';

export async function initializeDatabase({ allowMigrations = process.env.NODE_ENV !== 'production' } = {}) {
  const rawDb = await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(DATABASE_FILE, allowMigrations ? sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE : sqlite3.OPEN_READWRITE, (err) => {
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

  await db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const versionTable = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'");
  const ready = versionTable && await db.get('SELECT version FROM schema_migrations WHERE version = ?', DATABASE_VERSION);
  if (ready) return;
  if (!allowMigrations) {
    await new Promise(resolve => rawDb.close(resolve));
    db = undefined;
    throw new Error('Database migration requires explicit operator approval: ' + DATABASE_VERSION);
  }
  await db.exec('BEGIN IMMEDIATE');
  try {
  // Recheck after the lock: two application starts must not apply the migration twice.
  const lockedTable = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'");
  if (lockedTable && await db.get('SELECT version FROM schema_migrations WHERE version = ?', DATABASE_VERSION)) {
    await db.exec('COMMIT');
    return;
  }

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

  if (!userColumnNames.includes('loginChallenge')) await db.exec('ALTER TABLE users ADD COLUMN loginChallenge TEXT;');

  if (!userColumnNames.includes('emailVerified')) {
    await db.exec('ALTER TABLE users ADD COLUMN emailVerified INTEGER DEFAULT 0;');
  }
  if (!userColumnNames.includes('emailVerificationToken')) {
    await db.exec('ALTER TABLE users ADD COLUMN emailVerificationToken TEXT;');
  }
  if (!userColumnNames.includes('sessionVersion')) await db.exec('ALTER TABLE users ADD COLUMN sessionVersion INTEGER NOT NULL DEFAULT 0;');
  if (!columnNames.includes('pointsAwarded')) await db.exec('ALTER TABLE bookings ADD COLUMN pointsAwarded INTEGER NOT NULL DEFAULT 0;');
  // This versioned transaction also repairs the prior partially applied migration.
  // Historical completed rows cannot safely be credited again without a ledger.
  await db.run("UPDATE bookings SET pointsAwarded = 1 WHERE status = 'completed'");
  await db.run("UPDATE bookings SET status = 'cancelled' WHERE status = 'canceled'");
  const scheduleColumns = await db.all('PRAGMA table_info(schedules)');
  if (!scheduleColumns.some(column => column.name === 'active')) await db.exec('ALTER TABLE schedules ADD COLUMN active INTEGER NOT NULL DEFAULT 1;');
  if (await db.get('SELECT zone FROM schedules GROUP BY zone HAVING COUNT(*) > 1')) throw new Error('Duplicate service zones: operator review required');
  if (await db.get('SELECT id FROM schedules WHERE duration < 15 OR duration > 600 OR typeof(duration) != \'integer\' OR price < 0 OR typeof(price) != \'integer\'')) throw new Error('Invalid legacy service configuration: operator review required');
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS schedules_zone_unique ON schedules(zone);');
  for (const [zone, service] of Object.entries(defaultServices)) {
    await db.run('INSERT OR IGNORE INTO schedules (id, zone, duration, price, label, createdAt) VALUES (?, ?, ?, ?, ?, ?)', 'default:' + zone, zone, service.duration, service.price, service.label, new Date().toISOString());
  }
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, appliedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS unavailability (
      id TEXT PRIMARY KEY, appointmentDate TEXT NOT NULL, appointmentStart TEXT NOT NULL,
      appointmentEnd TEXT NOT NULL, reason TEXT, createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bookings_day ON bookings(appointmentDate, status);
    CREATE INDEX IF NOT EXISTS unavailability_day ON unavailability(appointmentDate);
    DROP TRIGGER IF EXISTS bookings_no_overlap_insert;
    DROP TRIGGER IF EXISTS bookings_no_overlap_update;
    DROP TRIGGER IF EXISTS users_consume_resets;
    DROP TRIGGER IF EXISTS bookings_award_points;
    CREATE TRIGGER bookings_no_overlap_insert BEFORE INSERT ON bookings
    WHEN NEW.status != 'cancelled' AND (
      EXISTS (SELECT 1 FROM bookings WHERE appointmentDate = NEW.appointmentDate AND status != 'cancelled'
      AND appointmentStart < NEW.appointmentEnd AND NEW.appointmentStart < appointmentEnd)
      OR EXISTS (SELECT 1 FROM unavailability WHERE appointmentDate = NEW.appointmentDate
      AND appointmentStart < NEW.appointmentEnd AND NEW.appointmentStart < appointmentEnd)
    ) BEGIN SELECT RAISE(ABORT, 'booking_overlap'); END;
    CREATE TRIGGER bookings_no_overlap_update BEFORE UPDATE OF appointmentDate, appointmentStart, appointmentEnd, status ON bookings
    WHEN NEW.status != 'cancelled' AND (
      EXISTS (SELECT 1 FROM bookings WHERE id != NEW.id AND appointmentDate = NEW.appointmentDate AND status != 'cancelled'
      AND appointmentStart < NEW.appointmentEnd AND NEW.appointmentStart < appointmentEnd)
      OR EXISTS (SELECT 1 FROM unavailability WHERE appointmentDate = NEW.appointmentDate
      AND appointmentStart < NEW.appointmentEnd AND NEW.appointmentStart < appointmentEnd)
    ) BEGIN SELECT RAISE(ABORT, 'booking_overlap'); END;
    CREATE TRIGGER unavailability_no_booking BEFORE INSERT ON unavailability
    WHEN EXISTS (SELECT 1 FROM bookings WHERE appointmentDate = NEW.appointmentDate AND status != 'cancelled'
      AND appointmentStart < NEW.appointmentEnd AND NEW.appointmentStart < appointmentEnd)
    BEGIN SELECT RAISE(ABORT, 'booking_overlap'); END;
    CREATE TRIGGER users_consume_resets AFTER UPDATE OF passwordHash ON users
    BEGIN
      DELETE FROM password_resets WHERE email = NEW.email;
      UPDATE users SET loginChallenge = NULL, sessionVersion = sessionVersion + 1 WHERE id = NEW.id;
    END;
    CREATE TRIGGER bookings_award_points AFTER UPDATE OF status, userId ON bookings
    WHEN NEW.status = 'completed' AND NEW.pointsAwarded = 0
      AND EXISTS (SELECT 1 FROM users WHERE id = NEW.userId AND emailVerified = 1)
    BEGIN
      UPDATE users SET points = COALESCE(points, 0) + MAX(0, COALESCE(NULLIF(NEW.pointsEarned, 0), CAST(NEW.price / 10 AS INTEGER))) WHERE id = NEW.userId;
      UPDATE bookings SET pointsAwarded = 1 WHERE id = NEW.id;
    END;
  `);
  await db.run('INSERT INTO schema_migrations (version, appliedAt) VALUES (?, ?)', DATABASE_VERSION, new Date().toISOString());
  await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    await new Promise(resolve => rawDb.close(resolve));
    db = undefined;
    throw error;
  }
}
