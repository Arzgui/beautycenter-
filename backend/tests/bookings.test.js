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
