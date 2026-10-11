import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/auth.js';
import { db, initializeDatabase } from '../config/database.js';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

beforeAll(async () => {
  await initializeDatabase();
});

describe('Auth API', () => {
  const testEmail = 'test@isbeauty.local';

  beforeEach(async () => {
    await db.run('DELETE FROM users WHERE email = ?', testEmail);
  });

  it('devrait creer un compte client', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: testEmail,
      password: 'Motdepasse123!',
      name: 'Test Client',
    });

    expect(response.statusCode).toBe(201);
  });

  it('devrait refuser un login avec mot de passe incorrect', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: 'MauvaisMotdepasse',
    });

    expect(response.statusCode).toBe(401);
  });

  it('accepte au login un hash conserve de bcrypt 5.1.1 apres la mise a jour native', async () => {
    // Generated with bcrypt 5.1.1 before upgrading; synthetic test credentials only.
    const legacyHash = '$2b$04$X8opcgVXgWDPlXzCeE20heYSuswIfhPfL.46dBuzC19yjYtMk5X5y';
    await db.run('INSERT INTO users (id, email, passwordHash, name, emailVerified, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      'legacy-bcrypt-client', testEmail, legacyHash, 'Legacy test', 1, new Date().toISOString());
    const response = await request(app).post('/api/auth/login').send({
      email: testEmail, password: 'Legacy-test-password-123!',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(await bcrypt.compare('Incorrect-password!', legacyHash)).toBe(false);
    expect((await db.get('SELECT passwordHash FROM users WHERE id = ?', 'legacy-bcrypt-client')).passwordHash).toBe(legacyHash);
  });
});
