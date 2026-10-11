import { initializeDatabase, db, DATABASE_VERSION } from '../config/database.js';

// A normal production server never applies migrations. This separate command
// requires a per-version approval after backup and staging-copy validation.
if (!process.argv.includes('--approve-production-migration=' + DATABASE_VERSION)) {
  console.error('Migration refused. After explicit operator approval, pass --approve-production-migration=' + DATABASE_VERSION);
  process.exitCode = 1;
} else {
  try {
    await initializeDatabase({ allowMigrations: true });
    console.log('Database migration applied: ' + DATABASE_VERSION);
  } catch (error) {
    console.error('Migration failed: ' + error.message);
    process.exitCode = 1;
  } finally {
    if (db) await new Promise(resolve => db.raw.close(resolve));
  }
}
