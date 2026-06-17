import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/auth.js';
import { initializeDatabase } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

beforeAll(async () => {
  await initializeDatabase();
});

describe('Sécurité de l’authentification', () => {
  it('devrait refuser une requête de login sans email', async () => {
    const response = await request(app).post('/api/auth/login').send({ password: 'secret' });
    expect(response.statusCode).toBe(400);
  });

  it('devrait bloquer après trop de tentatives de login invalides', async () => {
    for (let i = 0; i < 6; i += 1) {
      await request(app).post('/api/auth/login').send({ email: 'bad@isbeauty.local', password: 'wrong' });
    }
    const response = await request(app).post('/api/auth/login').send({ email: 'bad@isbeauty.local', password: 'wrong' });
    expect(response.statusCode).toBe(429);
  });
});
