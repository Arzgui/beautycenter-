import express from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { verifyToken } from '../middleware/auth.js';
import { sendConfirmationSms } from '../utils/twilio.js';
import { sendBrevoEmail, sendBrevoSms } from '../utils/brevo.js';
import { broadcastPushNotification } from '../utils/push.js';

const router = express.Router();

const serviceDurations = {
  bilan: { duration: 30, price: 0, label: 'Bilan Médico Laser ICE' },
  visage: { duration: 30, price: 40, label: 'Visage & cou' },
  aisselles: { duration: 30, price: 20, label: 'Aisselles' },
  maillot: { duration: 45, price: 50, label: 'Maillot' },
  jambes: { duration: 45, price: 30, label: 'Jambes & bras' },
  bras: { duration: 45, price: 28, label: 'Bras / Demi-bras' },
  dos: { duration: 60, price: 50, label: 'Dos / ventre' },
  corps: { duration: 60, price: 150, label: 'Corps complet' },
  forfait: { duration: 120, price: 120, label: 'Forfait multi-zones' },
};

const publicSlots = ['09:00', '10:30', '14:00', '15:30', '17:00'];

function parseTime(dateString) {
  const [hours, minutes] = dateString.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function parseAppointmentDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function getTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isClosedDay(date) {
  return date.getUTCDay() === 0;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

async function findOverlappingBooking(appointmentDateISO, startMinutes, endMinutes) {
  const existingBookings = await db.all(
    "SELECT id, appointmentStart, appointmentEnd FROM bookings WHERE appointmentDate = ? AND status != 'cancelled'",
    appointmentDateISO
  );

  return existingBookings.find((booking) => {
    const existingStart = parseTime(booking.appointmentStart);
    const existingEnd = parseTime(booking.appointmentEnd);
    return rangesOverlap(startMinutes, endMinutes, existingStart, existingEnd);
  });
}

router.get('/availability', async (req, res, next) => {
  try {
    const { date, serviceZone } = req.query;
    const service = serviceDurations[serviceZone];
    const appointmentDate = parseAppointmentDate(String(date || ''));

    res.set('Cache-Control', 'no-store');

    if (!appointmentDate || !service) {
      return res.status(400).json({ message: 'Paramètres de disponibilité invalides.' });
    }

    if (appointmentDate < getTodayUtc() || isClosedDay(appointmentDate)) {
      return res.json({ unavailableSlots: publicSlots });
    }

    const unavailableSlots = [];
    for (const slot of publicSlots) {
      const startMinutes = parseTime(slot);
      const endMinutes = startMinutes + service.duration;
      if (endMinutes > 19 * 60 || await findOverlappingBooking(date, startMinutes, endMinutes)) {
        unavailableSlots.push(slot);
      }
    }

    res.json({ unavailableSlots });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  body('clientName').trim().notEmpty(),
  body('clientEmail').isEmail(),
  body('clientPhone').trim().notEmpty(),
  body('serviceZone').isIn(Object.keys(serviceDurations)),
  body('appointmentDate').isISO8601({ strict: true }),
  body('appointmentStart').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  body('price').optional().isInt({ min: 0 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { clientName, clientEmail, clientPhone, serviceZone, appointmentDate, appointmentStart } = req.body;
      const appointmentDateObj = parseAppointmentDate(appointmentDate);
      if (!appointmentDateObj) {
        return res.status(400).json({ message: 'Date de rendez-vous invalide.' });
      }

      if (appointmentDateObj < getTodayUtc()) {
        return res.status(400).json({ message: 'Impossible de réserver une date passée.' });
      }

      if (isClosedDay(appointmentDateObj)) {
        return res.status(400).json({ message: 'Le salon est fermé le dimanche.' });
      }

      const appointmentDateISO = appointmentDate;
      const service = serviceDurations[serviceZone];
      const duration = service.duration;
      const price = service.price;
      const startMinutes = parseTime(appointmentStart);
      const endMinutes = startMinutes + duration;

      if (startMinutes < 9 * 60 || endMinutes > 19 * 60) {
        return res.status(400).json({ message: 'Heure de rendez-vous hors des horaires 9h-19h.' });
      }

      const existing = await findOverlappingBooking(appointmentDateISO, startMinutes, endMinutes);
      if (existing) return res.status(409).json({ message: 'Ce créneau est déjà réservé.' });

      const serviceType = service.label;
      const appointmentEnd = formatTime(endMinutes);
      const id = uuidv4();
      const createdAt = new Date().toISOString();
      const pointsEarned = Math.floor(price / 10);

      await db.run(
        'INSERT INTO bookings (id, clientName, clientEmail, clientPhone, serviceZone, serviceType, appointmentDate, appointmentStart, appointmentEnd, price, pointsEarned, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        clientName,
        clientEmail,
        clientPhone,
        serviceZone,
        serviceType,
        appointmentDateISO,
        appointmentStart,
        appointmentEnd,
        price,
        pointsEarned,
        createdAt
      );

      if (process.env.BREVO_API_KEY && process.env.BREVO_SMS_SENDER) {
        try {
          await sendBrevoSms(
            clientPhone,
            `Votre rendez-vous IS Beauty pour ${serviceType} est confirmé le ${appointmentDateISO} à ${appointmentStart}.`
          );
        } catch (smsError) {
          console.warn('Erreur Brevo SMS:', smsError.message || smsError);
          await sendConfirmationSms(clientPhone, clientName, appointmentDateISO, appointmentStart, serviceType);
        }
      } else {
        await sendConfirmationSms(clientPhone, clientName, appointmentDateISO, appointmentStart, serviceType);
      }

      try {
        await sendBrevoEmail(
          clientEmail,
          'Confirmation de rendez-vous IS Beauty',
          `<p>Bonjour ${clientName},</p><p>Votre rendez-vous pour <strong>${serviceType}</strong> est confirmé le <strong>${appointmentDateISO}</strong> à <strong>${appointmentStart}</strong>.</p><p>Merci de votre confiance, à bientôt chez IS Beauty.</p>`,
          `Bonjour ${clientName},\nVotre rendez-vous pour ${serviceType} est confirmé le ${appointmentDateISO} à ${appointmentStart}.\nMerci de votre confiance, à bientôt chez IS Beauty.`
        );
      } catch (emailError) {
        console.warn('Erreur Brevo email:', emailError.message || emailError);
      }

      try {
        await broadcastPushNotification(
          'Rendez-vous confirmé',
          `Votre rendez-vous IS Beauty le ${appointmentDateISO} à ${appointmentStart} est confirmé.`
        );
      } catch (pushError) {
        console.warn('Erreur notification push:', pushError.message || pushError);
      }

      res.status(201).json({ message: 'Réservation créée.', bookingId: id });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/', verifyToken, async (req, res, next) => {
  try {
    const bookings = await db.all('SELECT * FROM bookings ORDER BY appointmentDate, appointmentStart');
    res.json({ bookings });
  } catch (error) {
    next(error);
  }
});



export default router;
