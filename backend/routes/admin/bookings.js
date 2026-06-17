import express from 'express';
import { db } from '../../config/database.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const bookings = await db.all('SELECT * FROM bookings ORDER BY appointmentDate, appointmentStart');
    res.json({ bookings });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'confirmed', 'completed', 'canceled'].includes(status)) {
      return res.status(400).json({ message: 'Statut invalide.' });
    }

    const booking = await db.get('SELECT * FROM bookings WHERE id = ?', id);
    if (!booking) return res.status(404).json({ message: 'Réservation introuvable.' });

    await db.run('UPDATE bookings SET status = ?, updatedAt = ? WHERE id = ?', status, new Date().toISOString(), id);

    if (status === 'completed' && booking.status !== 'completed') {
      const points = booking.pointsEarned || Math.floor((booking.price || 0) / 10);
      if (points > 0 && booking.clientEmail) {
        const user = await db.get('SELECT id, points FROM users WHERE email = ?', booking.clientEmail);
        if (user) {
          await db.run('UPDATE users SET points = points + ? WHERE id = ?', points, user.id);
          console.log(`+${points} points ajoutés à ${booking.clientEmail}`);
        }
      }
    }

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
    await db.run(
      'UPDATE bookings SET clientName=?, clientEmail=?, clientPhone=?, serviceZone=?, serviceType=?, appointmentDate=?, appointmentStart=?, appointmentEnd=?, price=?, updatedAt=? WHERE id=?',
      clientName, clientEmail, clientPhone, serviceZone, serviceType, appointmentDate, appointmentStart, appointmentEnd, price, new Date().toISOString(), id
    );
    res.json({ message: 'Rendez-vous mis à jour.' });
  } catch (error) {
    next(error);
  }
});

export default router;
