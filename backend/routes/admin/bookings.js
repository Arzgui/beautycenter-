import { getService } from '../../utils/services.js';
import { body, validationResult } from 'express-validator';
import { validAppointment } from '../../utils/dates.js';
import express from 'express';
import { db } from '../../config/database.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const bookings = await db.all('SELECT id, userId, clientName, clientEmail, clientPhone, serviceZone, serviceType, appointmentDate, appointmentStart, appointmentEnd, status, price, pointsEarned, createdAt, updatedAt, cancelledAt, cancelledBy FROM bookings ORDER BY appointmentDate, appointmentStart');
    res.json({ bookings });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Statut invalide.' });
    }

    const booking = await db.get('SELECT * FROM bookings WHERE id = ?', id);
    if (!booking) return res.status(404).json({ message: 'Réservation introuvable.' });

    await db.run("UPDATE bookings SET status = ?, updatedAt = ?, cancelledAt = CASE WHEN ? = 'cancelled' THEN ? ELSE NULL END, cancelledBy = CASE WHEN ? = 'cancelled' THEN 'admin' ELSE NULL END WHERE id = ?", status, new Date().toISOString(), status, new Date().toISOString(), status, id);

    res.json({ message: 'Statut mis à jour.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM bookings WHERE id = ?', id);
    res.json({ message: 'Réservation supprimée.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id',
  body('clientName').isString().trim().notEmpty(),
  body('clientEmail').isEmail(),
  body('clientPhone').isString().trim().notEmpty(),
  body('serviceZone').isString().notEmpty(),
  body('appointmentDate').isString(),
  body('appointmentStart').matches(/^([01]\d|2[0-3]):[0-5]\d$/),
  body('appointmentEnd').optional().matches(/^([01]\d|2[0-3]):[0-5]\d$/),
  body('price').isInt({ min: 0 }).toInt(),
  body('userId').optional({ nullable: true }).isString().notEmpty(),
  async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array().map(({ value, ...error }) => error) });
    const { id } = req.params;
    const booking = await db.get('SELECT * FROM bookings WHERE id = ?', id);
    if (!booking) return res.status(404).json({ message: 'Reservation introuvable.' });
    const { clientName, clientEmail, clientPhone, serviceZone, appointmentDate, appointmentStart, price } = req.body;
    const service = await getService(serviceZone, true);
    if (!service || (!service.active && serviceZone !== booking.serviceZone)) return res.status(400).json({ message: 'Prestation inconnue.' });
    const timingChanged = appointmentDate !== booking.appointmentDate || appointmentStart !== booking.appointmentStart || serviceZone !== booking.serviceZone;
    const [hour, minute] = appointmentStart.split(':').map(Number);
    const end = hour * 60 + minute + service.duration;
    const appointmentEnd = timingChanged ? String(Math.floor(end / 60)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0') : booking.appointmentEnd;
    if (!validAppointment(appointmentDate, appointmentStart, appointmentEnd) || (req.body.appointmentEnd && req.body.appointmentEnd !== appointmentEnd)) return res.status(400).json({ message: 'Horaire incompatible avec la duree de la prestation.' });
    const userId = Object.hasOwn(req.body, 'userId') ? req.body.userId : booking.userId;
    if (booking.pointsAwarded && userId !== booking.userId) return res.status(409).json({ message: 'Les points ont deja ete attribues au compte associe.' });
    if (userId && userId !== booking.userId) {
      const account = await db.get('SELECT id FROM users WHERE id = ? AND emailVerified = 1 AND lower(email) = lower(?)', userId, clientEmail);
      if (!account) return res.status(400).json({ message: 'Choisissez le compte verifie correspondant a cette adresse email.' });
    }
    const result = await db.run(
      'UPDATE bookings SET clientName=?, clientEmail=?, clientPhone=?, serviceZone=?, serviceType=?, appointmentDate=?, appointmentStart=?, appointmentEnd=?, price=?, pointsEarned=CASE WHEN pointsAwarded = 0 THEN CAST(? / 10 AS INTEGER) ELSE pointsEarned END, reminderSentAt=CASE WHEN appointmentDate != ? OR appointmentStart != ? THEN NULL ELSE reminderSentAt END, userId=?, updatedAt=? WHERE id=? AND (pointsAwarded = 0 OR userId IS ?)',
      clientName, clientEmail, clientPhone, serviceZone, service.label, appointmentDate, appointmentStart, appointmentEnd, price, price, appointmentDate, appointmentStart, userId, new Date().toISOString(), id, userId
    );
    if (!result.changes) return res.status(409).json({ message: 'Le rendez-vous a change. Actualisez avant de modifier son compte associe.' });
    res.json({ message: 'Rendez-vous mis a jour.' });
  } catch (error) { next(error); }
});

export default router;
