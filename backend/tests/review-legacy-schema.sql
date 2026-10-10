
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
