import { validAppointment } from '../../utils/dates.js';
import express from 'express';
import { db } from '../../config/database.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const bookings = await db.all('SELECT id, clientName, clientEmail, clientPhone, serviceZone, serviceType, appointmentDate, appointmentStart, appointmentEnd, status, price, pointsEarned, createdAt, updatedAt, cancelledAt, cancelledBy FROM bookings ORDER BY appointmentDate, appointmentStart');
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

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clientName, clientEmail, clientPhone, serviceZone, serviceType, appointmentDate, appointmentStart, appointmentEnd, price } = req.body;
    if (!await db.get('SELECT id FROM bookings WHERE id = ?', id)) return res.status(404).json({ message: 'R?servation introuvable.' });
    if (!validAppointment(appointmentDate, appointmentStart, appointmentEnd) || !Number.isInteger(price) || price < 0 || !clientName || !clientEmail || !clientPhone || !serviceZone || !serviceType) return res.status(400).json({ message: 'Rendez-vous invalide.' });
    await db.run(
      'UPDATE bookings SET clientName=?, clientEmail=?, clientPhone=?, serviceZone=?, serviceType=?, appointmentDate=?, appointmentStart=?, appointmentEnd=?, price=?, pointsEarned=CASE WHEN pointsAwarded = 0 THEN CAST(? / 10 AS INTEGER) ELSE pointsEarned END, reminderSentAt=NULL, updatedAt=? WHERE id=?',
      clientName, clientEmail, clientPhone, serviceZone, serviceType, appointmentDate, appointmentStart, appointmentEnd, price, price, new Date().toISOString(), id
    );
    res.json({ message: 'Rendez-vous mis à jour.' });
  } catch (error) {
    next(error);
  }
});

export default router;
