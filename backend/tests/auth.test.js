import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/auth.js';
import { db, initializeDatabase } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

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
});
