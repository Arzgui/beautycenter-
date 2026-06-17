import express from 'express';
import { db } from '../../config/database.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const totalBookings = await db.get('SELECT COUNT(*) AS count FROM bookings');
    const totalClients = await db.get('SELECT COUNT(*) AS count FROM users WHERE role = ?', 'client');
    const pendingBookings = await db.get("SELECT COUNT(*) AS count FROM bookings WHERE status = 'pending'");
    const earnedPoints = await db.get('SELECT SUM(pointsEarned) AS total FROM bookings');

    res.json({
      stats: {
        totalBookings: totalBookings.count || 0,
        totalClients: totalClients.count || 0,
        pendingBookings: pendingBookings.count || 0,
        earnedPoints: earnedPoints.total || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
