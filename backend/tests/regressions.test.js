import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import { db, initializeDatabase } from '../config/database.js';
import bookings from '../routes/bookings.js';
import admin from '../routes/admin/bookings.js';
import auth from '../routes/auth.js';
import { verifyAdmin } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { sendBrevoEmail, sendBrevoSms } from '../utils/brevo.js';
import { sendConfirmationSms, sendReminderSms } from '../utils/twilio.js';
import { broadcastPushNotification } from '../utils/push.js';
import { sendDueReminders } from '../utils/reminders.js';
import { parisDate, tomorrowParis } from '../utils/dates.js';
import { validateJwtSecret } from '../config/jwt.js';

const app = express();
app.use(express.json());
app.use('/bookings', bookings);
app.use('/admin', verifyAdmin, admin);
app.use('/auth', auth);
app.use(errorHandler);
const adminToken = jwt.sign({ id: 'admin', role: 'admin' }, process.env.JWT_SECRET);
const headers = { Authorization: `Bearer ${adminToken}` };
const payload = { clientName: '<img src=x onerror=alert(1)>', clientEmail: 'regression@example.com', clientPhone: '+33600000000', serviceZone: 'visage', appointmentDate: '2099-06-15', appointmentStart: '10:00' };
const userId = '1479fb4f-0456-4d8d-82b0-08307a52c6f4';
let passwordHash;
beforeAll(async () => { await initializeDatabase(); passwordHash = await bcrypt.hash('Password123!', 4); });
beforeEach(async () => {
  await db.run('DELETE FROM bookings');
  await db.run('DELETE FROM password_resets');
  await db.run('DELETE FROM users');
  jest.clearAllMocks();
  sendBrevoEmail.mockReset().mockResolvedValue(true);
  sendBrevoSms.mockReset().mockResolvedValue(true);
  sendConfirmationSms.mockReset().mockResolvedValue(true);
  sendReminderSms.mockReset().mockResolvedValue(true);
  broadcastPushNotification.mockReset().mockResolvedValue(true);
});
async function user(extra = {}) {
  await db.run('INSERT INTO users (id,email,name,passwordHash,createdAt,emailVerified,twoFactorEnabled,twoFactorSecret) VALUES (?,?,?,?,?,?,?,?)', userId, payload.clientEmail, 'Test', passwordHash, new Date().toISOString(), extra.verified ?? 1, extra.secret ? 1 : 0, extra.secret || null);
  return jwt.sign({ id: userId, email: payload.clientEmail, role: 'client' }, process.env.JWT_SECRET);
}
async function create(extra = {}) {
  const response = await request(app).post('/bookings').send({ ...payload, ...extra });
  expect(response.status).toBe(201);
  return db.get('SELECT * FROM bookings WHERE id = ?', response.body.bookingId);
}
async function status(id, value) { return request(app).patch(`/admin/${id}/status`).set(headers).send({ status: value }); }

test('JWT rejects absent, short and placeholder secrets', () => {
  for (const secret of [undefined, '', 'change_this_secret', 'short', 'your_secret_should_be_changed_123456789']) expect(() => validateJwtSecret(secret)).toThrow();
  expect(validateJwtSecret(process.env.JWT_SECRET)).toBe(process.env.JWT_SECRET);
});
test('concurrent overlapping requests have exactly one winner; adjacent slot remains usable', async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => request(app).post('/bookings').send(payload)));
  expect(responses.filter(r => r.status === 201)).toHaveLength(1);
  expect(responses.filter(r => r.status === 409)).toHaveLength(7);
  await create({ appointmentStart: '10:30' });
});
test('admin cancellation frees slot and restoration detects conflict', async () => {
  const booking = await create();
  expect((await status(booking.id, 'cancelled')).status).toBe(200);
  const cancelled = await db.get('SELECT * FROM bookings WHERE id = ?', booking.id);
  expect(cancelled.cancelledBy).toBe('admin');
  await create();
  expect((await status(booking.id, 'confirmed')).status).toBe(409);
  expect((await status(booking.id, 'canceled')).status).toBe(400);
});
test('loyalty points are awarded once under concurrency and repeated completion', async () => {
  await user(); const booking = await create();
  const responses = await Promise.all([status(booking.id, 'completed'), status(booking.id, 'completed')]);
  expect(responses.every(r => r.status === 200)).toBe(true);
  await status(booking.id, 'confirmed'); await status(booking.id, 'completed');
  expect((await db.get('SELECT points FROM users WHERE id = ?', userId)).points).toBe(4);
});
test('admin changes reject overlap and invalid times; valid edits reset reminders', async () => {
  const first = await create(); const second = await create({ appointmentStart: '11:00' });
  const edit = { ...second, appointmentStart: '10:15', appointmentEnd: '10:45' };
  expect((await request(app).patch(`/admin/${second.id}`).set(headers).send(edit)).status).toBe(409);
  expect((await request(app).patch(`/admin/${second.id}`).set(headers).send({ ...edit, appointmentEnd: 'bad' })).status).toBe(400);
  await db.run('UPDATE bookings SET reminderSentAt = ? WHERE id = ?', 'sent', second.id);
  expect((await request(app).patch(`/admin/${second.id}`).set(headers).send({ ...second, appointmentStart: '12:00', appointmentEnd: '12:30' })).status).toBe(200);
  expect((await db.get('SELECT reminderSentAt FROM bookings WHERE id = ?', second.id)).reminderSentAt).toBeNull();
  expect(first.id).toBeTruthy();
});
test('notification failures cannot invalidate saved booking; public pushes omit appointment details', async () => {
  sendConfirmationSms.mockRejectedValue(new Error('offline'));
  sendBrevoEmail.mockRejectedValue(new Error('offline'));
  broadcastPushNotification.mockRejectedValue(new Error('offline'));
  const booking = await create();
  expect(booking.id).toBeTruthy();
  expect(broadcastPushNotification.mock.calls[0][1]).not.toContain(payload.appointmentDate);
});
test('booking APIs omit cancellation tokens and client list requires verified email', async () => {
  const token = await user({ verified: 0 }); await create();
  expect((await request(app).get('/bookings').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  await db.run('UPDATE users SET emailVerified = 1 WHERE id = ?', userId);
  const client = await request(app).get('/bookings').set('Authorization', `Bearer ${token}`);
  expect(client.status).toBe(200); expect(client.body.bookings[0].cancellationToken).toBeUndefined();
  expect(client.body.bookings[0].clientPhone).toBeUndefined();
  const adminResponse = await request(app).get('/admin').set(headers);
  expect(adminResponse.body.bookings[0].cancellationToken).toBeUndefined();
});
test('HTML email escapes client data while preserving readable plain text', async () => {
  await create();
  expect(sendBrevoEmail.mock.calls[0][2]).toContain('&lt;img');
  expect(sendBrevoEmail.mock.calls[0][2]).not.toContain(payload.clientName);
  expect(sendBrevoEmail.mock.calls[0][3]).toContain(payload.clientName);
});
test('Paris calendar handles midnight and both DST transitions', () => {
  expect(parisDate(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
  expect(tomorrowParis(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-30');
  expect(tomorrowParis(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-26');
});
test('failed reminders remain retryable and concurrent jobs do not duplicate delivery', async () => {
  const booking = await create({ appointmentDate: payload.appointmentDate });
  // Bypass salon weekday rules for scheduler fixture only.
  await db.run('UPDATE bookings SET appointmentDate = ? WHERE id = ?', tomorrowParis(), booking.id);
  sendBrevoEmail.mockRejectedValue(new Error('offline')); sendReminderSms.mockRejectedValue(new Error('offline'));
  expect(await sendDueReminders()).toBe(0);
  expect((await db.get('SELECT reminderSentAt FROM bookings WHERE id = ?', booking.id)).reminderSentAt).toBeNull();
  sendBrevoEmail.mockResolvedValue(true); sendReminderSms.mockResolvedValue(true);
  const counts = await Promise.all([sendDueReminders(), sendDueReminders()]);
  expect(counts.reduce((a,b) => a+b,0)).toBe(1);
  expect(await sendDueReminders()).toBe(0);
});
test('2FA requires password challenge, rejects challenge as access token and consumes it once', async () => {
  const secret = speakeasy.generateSecret().base32; await user({ secret });
  const otp = speakeasy.totp({ secret, encoding: 'base32' });
  expect((await request(app).post('/auth/login/2fa').send({ userId, token: otp })).status).toBe(400);
  const login = await request(app).post('/auth/login').send({ email: payload.clientEmail, password: 'Password123!' });
  expect(login.body.token).toBeUndefined(); expect(login.body.userId).toBeUndefined();
  expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${login.body.challengeToken}`)).status).toBe(401);
  const body = { challengeToken: login.body.challengeToken, token: otp };
  const results = await Promise.all([request(app).post('/auth/login/2fa').send(body), request(app).post('/auth/login/2fa').send(body)]);
  expect(results.map(r => r.status).sort()).toEqual([200,401]);
  const token = results.find(r => r.status === 200).body.token;
  expect((await request(app).post('/auth/2fa/setup').set('Authorization', `Bearer ${token}`)).status).toBe(409);
});
test('password reset token is single-use under concurrent submissions', async () => {
  await user(); const token = '2479fb4f-0456-4d8d-82b0-08307a52c6f4';
  await db.run('INSERT INTO password_resets (id,email,token,expiresAt,createdAt) VALUES (?,?,?,?,?)', 'reset',payload.clientEmail, token, new Date(Date.now()+60000).toISOString(),new Date().toISOString());
  const body = { email: payload.clientEmail, token, newPassword: 'NewPassword123!' };
  const results = await Promise.all([request(app).post('/auth/reset-password').send(body), request(app).post('/auth/reset-password').send(body)]);
  expect(results.map(r => r.status).sort()).toEqual([200,400]);
});

test('validation responses never echo passwords or supplied tokens', async () => {
  const response = await request(app).post('/auth/register').send({email:'invalid', name:'Test', password:'x'});
  expect(response.status).toBe(400);
  expect(response.body.errors.every(error => !Object.hasOwn(error, 'value'))).toBe(true);
});
test('concurrent cancellation succeeds once', async () => {
  const booking = await create();
  const results = await Promise.all([1,2].map(() => request(app).post('/bookings/cancel').send({token:booking.cancellationToken})));
  expect(results.map(r => r.status).sort()).toEqual([200,409]);
});
test('forgot password remains generic when delivery fails', async () => {
  await user(); sendBrevoEmail.mockRejectedValue(new Error('offline'));
  const known = await request(app).post('/auth/forgot-password').send({email:payload.clientEmail});
  const unknown = await request(app).post('/auth/forgot-password').send({email:'missing@example.com'});
  expect(known.status).toBe(200); expect(known.body).toEqual(unknown.body);
});
test('source files cannot be served through encoded static paths', async () => {
  const { protectSourceFiles } = await import('../middleware/publicFiles.js');
  const staticApp = express(); staticApp.use(protectSourceFiles);
  staticApp.use(express.static(new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')));
  for (const url of ['/backend/package.json','/%62ackend/package.json','/backend%2fpackage.json','/.git/config']) {
    expect((await request(staticApp).get(url)).status).toBe(404);
  }
  expect((await request(staticApp).get('/compte.html')).status).toBe(200);
});
test('scheduler uses Paris timezone and retries during salon hours', async () => {
  const schedule = (await import('node-schedule')).default;
  const spy = jest.spyOn(schedule, 'scheduleJob').mockReturnValue({});
  const { startReminderScheduler } = await import('../utils/reminders.js');
  startReminderScheduler();
  expect(spy.mock.calls[0][0]).toEqual({ rule:'*/15 9-18 * * *', tz:'Europe/Paris' });
  spy.mockRestore();
});
test('2FA setup and enable preserve successful login and reject wrong codes', async () => {
  const access = await user();
  const setup = await request(app).post('/auth/2fa/setup').set('Authorization', `Bearer ${access}`);
  expect(setup.status).toBe(200); expect(setup.body.qrCodeUrl).toContain('data:image/png');
  const otp = speakeasy.totp({secret:setup.body.secret, encoding:'base32'});
  expect((await request(app).post('/auth/2fa/enable').set('Authorization', `Bearer ${access}`).send({token:otp})).status).toBe(200);
  const login = await request(app).post('/auth/login').send({email:payload.clientEmail,password:'Password123!'});
  const invalid = otp === '000000' ? '111111' : '000000';
  expect((await request(app).post('/auth/login/2fa').send({challengeToken:login.body.challengeToken,token:invalid})).status).toBe(401);
  const valid = await request(app).post('/auth/login/2fa').send({challengeToken:login.body.challengeToken,token:otp});
  expect(valid.status).toBe(200); expect(valid.body.token).toBeTruthy();
});
test('completed bookings do not receive reminders', async () => {
  const booking = await create(); await status(booking.id,'completed');
  await db.run('UPDATE bookings SET appointmentDate = ? WHERE id = ?',tomorrowParis(),booking.id);
  sendBrevoEmail.mockClear(); sendReminderSms.mockClear();
  expect(await sendDueReminders()).toBe(0);
  expect(sendBrevoEmail).not.toHaveBeenCalled(); expect(sendReminderSms).not.toHaveBeenCalled();
});
test('loyalty failure rolls back completion atomically', async () => {
  await user(); const booking = await create();
  await db.exec("CREATE TRIGGER test_points_failure BEFORE UPDATE OF points ON users BEGIN SELECT RAISE(ABORT, 'simulated_failure'); END;");
  try {
    expect((await status(booking.id,'completed')).status).toBe(500);
    expect((await db.get('SELECT status FROM bookings WHERE id = ?', booking.id)).status).toBe('pending');
    expect((await db.get('SELECT points FROM users WHERE id = ?', userId)).points).toBe(0);
  } finally { await db.exec('DROP TRIGGER test_points_failure'); }
});
test('expired 2FA challenges and expired reset links are rejected', async () => {
  const secret = speakeasy.generateSecret().base32; await user({secret});
  const expired = jwt.sign({id:userId,purpose:'2fa',nonce:'x'},process.env.JWT_SECRET,{expiresIn:-1});
  expect((await request(app).post('/auth/login/2fa').send({challengeToken:expired,token:speakeasy.totp({secret,encoding:'base32'})})).status).toBe(401);
  const token = '2479fb4f-0456-4d8d-82b0-08307a52c6f4';
  await db.run('INSERT INTO password_resets (id,email,token,expiresAt,createdAt) VALUES (?,?,?,?,?)','expired',payload.clientEmail,token,new Date(Date.now()-60000).toISOString(),new Date().toISOString());
  expect((await request(app).post('/auth/reset-password').send({email:payload.clientEmail,token,newPassword:'NewPassword123!'})).status).toBe(400);
});
test('registration and cancellation HTML escape names', async () => {
  expect((await request(app).post('/auth/register').send({email:payload.clientEmail,password:'Password123!',name:payload.clientName})).status).toBe(201);
  expect(sendBrevoEmail.mock.calls[0][2]).toContain('&lt;img');
  const booking = await create(); sendBrevoEmail.mockClear();
  expect((await request(app).post('/bookings/cancel').send({token:booking.cancellationToken})).status).toBe(200);
  expect(sendBrevoEmail.mock.calls[0][2]).toContain('&lt;img');
});
