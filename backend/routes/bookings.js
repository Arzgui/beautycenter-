import { getService } from '../utils/services.js';
import { escapeHtml } from '../utils/html.js';
import { parisDate, parisMinutes } from '../utils/dates.js';
import express from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { verifyToken, optionalToken } from '../middleware/auth.js';
import { sendConfirmationSms } from '../utils/twilio.js';
import { sendBrevoEmail, sendBrevoSms } from '../utils/brevo.js';
import { broadcastPushNotification } from '../utils/push.js';

const router = express.Router();

const publicSlots = Array.from({ length: 40 }, (_, index) => formatTime(9 * 60 + index * 15));

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
  return new Date(parisDate() + 'T00:00:00Z');
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

router.get('/services', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ services: await db.all('SELECT zone, label, duration, price FROM schedules WHERE active = 1 ORDER BY label') });
  } catch (error) { next(error); }
});

router.get('/availability', async (req, res, next) => {
  try {
    const { date, serviceZone } = req.query;
    const service = await getService(String(serviceZone || ''));
    const appointmentDate = parseAppointmentDate(String(date || ''));
    res.set('Cache-Control', 'no-store');
    if (!appointmentDate || !service) return res.status(400).json({ message: 'Parametres de disponibilite invalides.' });
    const busy = await db.all(
      "SELECT appointmentStart, appointmentEnd FROM bookings WHERE appointmentDate = ? AND status != 'cancelled' UNION ALL SELECT appointmentStart, appointmentEnd FROM unavailability WHERE appointmentDate = ?", date, date
    );
    const closed = appointmentDate < getTodayUtc() || isClosedDay(appointmentDate);
    const unavailableSlots = publicSlots.filter(slot => {
      const start = parseTime(slot), end = start + service.duration;
      return closed || end > 19 * 60 || (date === parisDate() && start <= parisMinutes()) ||
        busy.some(range => rangesOverlap(start, end, parseTime(range.appointmentStart), parseTime(range.appointmentEnd)));
    });
    res.json({ slots: publicSlots, availableSlots: publicSlots.filter(slot => !unavailableSlots.includes(slot)), unavailableSlots, duration: service.duration, price: service.price });
  } catch (error) { next(error); }
});

router.post(
  '/',
  optionalToken,
  body('clientName').trim().notEmpty(),
  body('clientEmail').isEmail(),
  body('clientPhone').trim().notEmpty(),
  body('serviceZone').isString().notEmpty(),
  body('appointmentDate').isISO8601({ strict: true }),
  body('appointmentStart').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  body('userId').not().exists(),
  body('duration').optional().isInt({ min: 15, max: 600 }),
  body('price').optional().isInt({ min: 0 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array().map(({ value, ...error }) => error) });

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
      const service = await getService(serviceZone);
      if (!service) return res.status(400).json({ message: 'Prestation inconnue ou desactivee.' });
      if (req.body.duration != null && Number(req.body.duration) !== service.duration) return res.status(409).json({ message: 'La duree de la prestation a change. Veuillez choisir a nouveau un horaire.' });
      let userId = null;
      if (req.user) {
        if (req.user.email.toLowerCase() !== clientEmail.toLowerCase()) return res.status(403).json({ message: 'Le compte connecte ne correspond pas a cette adresse email.' });
        if (req.user.emailVerified) userId = req.user.id;
      }
      const duration = service.duration;
      const price = service.price;
      const startMinutes = parseTime(appointmentStart);
      const endMinutes = startMinutes + duration;

      if (startMinutes % 15 !== 0 || startMinutes < 9 * 60 || endMinutes > 19 * 60 || (appointmentDate === parisDate() && startMinutes <= parisMinutes())) {
        return res.status(400).json({ message: 'Heure de rendez-vous hors des horaires 9h-19h.' });
      }

      const existing = await findOverlappingBooking(appointmentDateISO, startMinutes, endMinutes);
      if (existing) return res.status(409).json({ message: 'Ce créneau est déjà réservé.' });

     const serviceType = service.label;
      const appointmentEnd = formatTime(endMinutes);
      const id = uuidv4();
      const createdAt = new Date().toISOString();
      const pointsEarned = Math.floor(price / 10);
      const cancellationToken = uuidv4();

      await db.run(
        'INSERT INTO bookings (id, userId, clientName, clientEmail, clientPhone, serviceZone, serviceType, appointmentDate, appointmentStart, appointmentEnd, price, pointsEarned, createdAt, cancellationToken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        userId,
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
        createdAt,
        cancellationToken
      );

      try {
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

      } catch (error) { console.warn('Confirmation SMS indisponible'); }

      const cancelUrl = `${process.env.SITE_URL || 'http://localhost:4000'}/annuler.html?token=${cancellationToken}`;

      try {
        await sendBrevoEmail(
          clientEmail,
          'Confirmation de rendez-vous IS Beauty',
          `<p>Bonjour ${escapeHtml(clientName)},</p><p>Votre rendez-vous pour <strong>${escapeHtml(serviceType)}</strong> est confirmé le <strong>${escapeHtml(appointmentDateISO)}</strong> à <strong>${escapeHtml(appointmentStart)}</strong>.</p><p>Merci de votre confiance, à bientôt chez IS Beauty.</p><p style="margin-top:24px;font-size:13px;color:#7488A3">Un empêchement ? <a href="${escapeHtml(cancelUrl)}">Annuler ce rendez-vous</a>.</p>`,
          `Bonjour ${clientName},\nVotre rendez-vous pour ${serviceType} est confirmé le ${appointmentDateISO} à ${appointmentStart}.\nMerci de votre confiance, à bientôt chez IS Beauty.\nUn empêchement ? Annuler ce rendez-vous : ${cancelUrl}`
        );
      } catch (emailError) {
        console.warn('Erreur Brevo email:', emailError.message || emailError);
      }
      try {
        await broadcastPushNotification(
          'Rendez-vous confirmé',
          'Une nouvelle reservation a ete enregistree.'
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
    const user = await db.get('SELECT email, emailVerified FROM users WHERE id = ?', req.user.id);
    if (!user?.emailVerified) return res.status(403).json({ message: 'Veuillez verifier votre adresse email.' });
    const bookings = await db.all(
      'SELECT id, serviceZone, serviceType, appointmentDate, appointmentStart, appointmentEnd, status, price, pointsEarned FROM bookings WHERE userId = ? OR (userId IS NULL AND lower(clientEmail) = lower(?)) ORDER BY appointmentDate, appointmentStart',
      req.user.id, user.email
    );
    res.json({ bookings });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/cancel',
  body('token').isUUID(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array().map(({ value, ...error }) => error) });

      const { token } = req.body;
      const booking = await db.get('SELECT * FROM bookings WHERE cancellationToken = ?', token);

      if (!booking) {
        return res.status(404).json({ message: 'Réservation introuvable.' });
      }

      if (booking.status === 'completed') return res.status(409).json({ message: 'Un rendez-vous termine ne peut plus etre annule.' });
      if (booking.status === 'cancelled') {
        return res.status(409).json({ message: 'Ce rendez-vous est déjà annulé.' });
      }

      const cancelledAt = new Date().toISOString();
      const cancelled = await db.run(
        "UPDATE bookings SET status = 'cancelled', cancelledAt = ?, cancelledBy = 'client', updatedAt = ? WHERE id = ? AND status IN ('pending', 'confirmed')",
        cancelledAt,
        cancelledAt,
        booking.id
      );

      if (!cancelled.changes) return res.status(409).json({ message: 'Ce rendez-vous est deja annule.' });
      try {
        await sendBrevoEmail(
          booking.clientEmail,
          'Annulation de votre rendez-vous IS Beauty',
          `<p>Bonjour ${escapeHtml(booking.clientName)},</p><p>Votre rendez-vous du <strong>${escapeHtml(booking.appointmentDate)}</strong> à <strong>${escapeHtml(booking.appointmentStart)}</strong> a bien été annulé.</p><p>Vous pouvez réserver un nouveau créneau à tout moment sur notre site.</p>`,
          `Bonjour ${booking.clientName},\nVotre rendez-vous du ${booking.appointmentDate} à ${booking.appointmentStart} a bien été annulé.\nVous pouvez réserver un nouveau créneau à tout moment sur notre site.`
        );
      } catch (emailError) {
        console.warn('Erreur Brevo email (annulation):', emailError.message || emailError);
      }

      res.json({ message: 'Rendez-vous annulé avec succès.' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

