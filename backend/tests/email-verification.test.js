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

function uniqueEmail() {
  return `verif_${Date.now()}_${Math.floor(Math.random() * 100000)}@isbeauty.local`;
}

describe('Verification email', () => {
  it('devrait creer un compte avec emailVerified a 0 et un token genere', async () => {
    const email = uniqueEmail();

    const response = await request(app).post('/api/auth/register').send({
      email,
      password: 'motdepasse123',
      name: 'Client Verif',
    });

    expect(response.statusCode).toBe(201);

    const user = await db.get('SELECT * FROM users WHERE email = ?', email);
    expect(user.emailVerified).toBe(0);
    expect(user.emailVerificationToken).toBeTruthy();
  });

  it('devrait verifier un email avec un token valide', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({
      email,
      password: 'motdepasse123',
      name: 'Client Verif',
    });

    const user = await db.get('SELECT * FROM users WHERE email = ?', email);

    const response = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: user.emailVerificationToken });

    expect(response.statusCode).toBe(200);

    const updated = await db.get('SELECT * FROM users WHERE id = ?', user.id);
    expect(updated.emailVerified).toBe(1);
    expect(updated.emailVerificationToken).toBeNull();
  });

  it('devrait refuser un token invalide (pas un UUID)', async () => {
    const response = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: 'pas-un-uuid' });

    expect(response.statusCode).toBe(400);
  });

  it('devrait renvoyer 404 pour un token inconnu', async () => {
    const response = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: '1479fb4f-0456-4d8d-82b0-08307a52c6f4' });

    expect(response.statusCode).toBe(404);
  });

  it('devrait renvoyer 409 si l\'email est deja verifie', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({
      email,
      password: 'motdepasse123',
      name: 'Client Verif',
    });

    const user = await db.get('SELECT * FROM users WHERE email = ?', email);
    await request(app).post('/api/auth/verify-email').send({ token: user.emailVerificationToken });

    const response = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: user.emailVerificationToken });

    expect(response.statusCode).toBe(404);
  });

  it('devrait repondre 200 a resend-verification meme pour un email inconnu', async () => {
    const response = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'inconnu_xyz@isbeauty.local' });

    expect(response.statusCode).toBe(200);
  });

  it('devrait generer un nouveau token via resend-verification', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({
      email,
      password: 'motdepasse123',
      name: 'Client Verif',
    });

    const before = await db.get('SELECT * FROM users WHERE email = ?', email);

    const response = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email });

    expect(response.statusCode).toBe(200);

    const after = await db.get('SELECT * FROM users WHERE email = ?', email);
    expect(after.emailVerificationToken).toBeTruthy();
    expect(after.emailVerificationToken).not.toBe(before.emailVerificationToken);
  });
});