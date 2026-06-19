import request from 'supertest';
import express from 'express';
import bookingsRoutes from '../routes/bookings.js';
import { db, initializeDatabase } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use('/api/bookings', bookingsRoutes);

beforeAll(async () => {
  await initializeDatabase();
});

function futureWeekday(offsetDays = 14) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  while (date.getUTCDay() === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().split('T')[0];
}

describe('Bookings API', () => {
  it('devrait creer une reservation valide', async () => {
    const appointmentDate = futureWeekday();
    await db.run('DELETE FROM bookings WHERE appointmentDate = ?', appointmentDate);

    const response = await request(app).post('/api/bookings').send({
      clientName: 'Client Test',
      clientEmail: 'client@isbeauty.local',
      clientPhone: '+33000000000',
      serviceZone: 'maillot',
      appointmentDate,
      appointmentStart: '10:00',
      price: 80,
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.bookingId).toBeTruthy();
  });

  it('devrait refuser un creneau qui chevauche une reservation existante', async () => {
    const appointmentDate = futureWeekday(21);
    await db.run('DELETE FROM bookings WHERE appointmentDate = ?', appointmentDate);

    await request(app).post('/api/bookings').send({
      clientName: 'Client Test',
      clientEmail: 'client@isbeauty.local',
      clientPhone: '+33000000000',
      serviceZone: 'maillot',
      appointmentDate,
      appointmentStart: '10:00',
      price: 50,
    });

    const response = await request(app).post('/api/bookings').send({
      clientName: 'Autre Client',
      clientEmail: 'autre@isbeauty.local',
      clientPhone: '+33000000001',
      serviceZone: 'visage',
      appointmentDate,
      appointmentStart: '10:30',
      price: 40,
    });

    expect(response.statusCode).toBe(409);
  });

  it('devrait exposer les creneaux indisponibles', async () => {
    const appointmentDate = futureWeekday(28);
    await db.run('DELETE FROM bookings WHERE appointmentDate = ?', appointmentDate);

    await request(app).post('/api/bookings').send({
      clientName: 'Client Test',
      clientEmail: 'client@isbeauty.local',
      clientPhone: '+33000000000',
      serviceZone: 'maillot',
      appointmentDate,
      appointmentStart: '10:00',
      price: 50,
    });

    const response = await request(app)
      .get('/api/bookings/availability')
      .query({ date: appointmentDate, serviceZone: 'visage' });

    expect(response.statusCode).toBe(200);
   expect(response.body.unavailableSlots).toContain('10:30');
  });
});

describe('Annulation de reservation', () => {
  async function createBooking(appointmentDate) {
    await db.run('DELETE FROM bookings WHERE appointmentDate = ?', appointmentDate);
    await request(app).post('/api/bookings').send({
      clientName: 'Client Annulation',
      clientEmail: 'annulation@isbeauty.local',
      clientPhone: '+33000000099',
      serviceZone: 'aisselles',
      appointmentDate,
      appointmentStart: '11:00',
      price: 20,
    });
    return db.get('SELECT * FROM bookings WHERE appointmentDate = ? AND clientEmail = ?', appointmentDate, 'annulation@isbeauty.local');
  }

  it('devrait annuler une reservation avec un token valide', async () => {
    const appointmentDate = futureWeekday(35);
    const booking = await createBooking(appointmentDate);
    expect(booking.cancellationToken).toBeTruthy();

    const response = await request(app)
      .post('/api/bookings/cancel')
      .send({ token: booking.cancellationToken });

    expect(response.statusCode).toBe(200);

    const updated = await db.get('SELECT * FROM bookings WHERE id = ?', booking.id);
    expect(updated.status).toBe('cancelled');
    expect(updated.cancelledBy).toBe('client');
    expect(updated.cancelledAt).toBeTruthy();
  });

  it('devrait refuser un token invalide', async () => {
    const response = await request(app)
      .post('/api/bookings/cancel')
      .send({ token: 'pas-un-uuid' });

    expect(response.statusCode).toBe(400);
  });

  it('devrait renvoyer 404 pour un token inconnu', async () => {
    const response = await request(app)
      .post('/api/bookings/cancel')
      .send({ token: '1479fb4f-0456-4d8d-82b0-08307a52c6f4' });

    expect(response.statusCode).toBe(404);
  });

  it('devrait renvoyer 409 si la reservation est deja annulee', async () => {
    const appointmentDate = futureWeekday(42);
    const booking = await createBooking(appointmentDate);

    await request(app).post('/api/bookings/cancel').send({ token: booking.cancellationToken });
    const response = await request(app).post('/api/bookings/cancel').send({ token: booking.cancellationToken });

    expect(response.statusCode).toBe(409);
  });
});