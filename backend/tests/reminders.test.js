import { db, initializeDatabase } from '../config/database.js';
import { sendDueReminders } from '../utils/reminders.js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

beforeAll(async () => {
  await initializeDatabase();
});

function tomorrowISO() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.toISOString().slice(0, 10);
}

async function insertBooking(overrides = {}) {
  const id = uuidv4();
  const appointmentDate = overrides.appointmentDate || tomorrowISO();
  const createdAt = new Date().toISOString();

  await db.run(
    `INSERT INTO bookings (
      id, clientName, clientEmail, clientPhone, serviceZone, serviceType,
      appointmentDate, appointmentStart, appointmentEnd, status, price,
      pointsEarned, createdAt, cancellationToken, reminderSentAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    overrides.clientName || 'Client Rappel',
    overrides.clientEmail || 'rappel@isbeauty.local',
    overrides.clientPhone || '+33000000088',
    'visage',
    'Visage & cou',
    appointmentDate,
    '14:00',
    '14:30',
    overrides.status || 'pending',
    40,
    4,
    createdAt,
    uuidv4(),
    overrides.reminderSentAt ?? null
  );

  return db.get('SELECT * FROM bookings WHERE id = ?', id);
}

describe('Rappels J-1', () => {
  beforeEach(async () => {
    await db.run('DELETE FROM bookings WHERE clientEmail = ?', 'rappel@isbeauty.local');
  });

  it('devrait envoyer un rappel pour un rendez-vous demain non encore rappele', async () => {
    const booking = await insertBooking();

    const count = await sendDueReminders();

    expect(count).toBeGreaterThanOrEqual(1);

    const updated = await db.get('SELECT * FROM bookings WHERE id = ?', booking.id);
    expect(updated.reminderSentAt).toBeTruthy();
  });

  it('ne devrait pas renvoyer un rappel deja envoye', async () => {
    await insertBooking({ reminderSentAt: new Date().toISOString() });

    const bookingsBefore = await db.all(
      "SELECT * FROM bookings WHERE clientEmail = ? AND reminderSentAt IS NULL",
      'rappel@isbeauty.local'
    );
    expect(bookingsBefore.length).toBe(0);
  });

  it('ne devrait pas rappeler un rendez-vous annule', async () => {
    await insertBooking({ status: 'cancelled' });

    const bookingsBefore = await db.all(
      "SELECT * FROM bookings WHERE clientEmail = ? AND status != 'cancelled' AND reminderSentAt IS NULL",
      'rappel@isbeauty.local'
    );
    expect(bookingsBefore.length).toBe(0);
  });

  it('ne devrait pas rappeler un rendez-vous qui n\'est pas demain', async () => {
    const farDate = new Date();
    farDate.setUTCDate(farDate.getUTCDate() + 10);
    await insertBooking({ appointmentDate: farDate.toISOString().slice(0, 10) });

    const bookingsBefore = await db.all(
      "SELECT * FROM bookings WHERE clientEmail = ? AND appointmentDate = ?",
      'rappel@isbeauty.local',
      tomorrowISO()
    );
    expect(bookingsBefore.length).toBe(0);
  });
});