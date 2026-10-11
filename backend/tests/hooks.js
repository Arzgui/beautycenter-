afterAll(async () => {
  const { db } = await import('../config/database.js');
  if (db) await new Promise((resolve, reject) => db.raw.close(err => err ? reject(err) : resolve()));
});
beforeEach(async () => {
  const { authLimiter } = await import('../middleware/rateLimiter.js');
  authLimiter.resetKey('::ffff:127.0.0.1');
  authLimiter.resetKey('127.0.0.1');
  const { authSetupLimiter } = await import('../middleware/rateLimiter.js');
  authSetupLimiter.resetKey('::ffff:127.0.0.1');
  authSetupLimiter.resetKey('127.0.0.1');
});
