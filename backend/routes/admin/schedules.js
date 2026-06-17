import express from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const schedules = await db.all('SELECT * FROM schedules ORDER BY label');
    res.json({ schedules });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  body('zone').trim().notEmpty(),
  body('duration').isInt({ min: 15 }),
  body('price').isInt({ min: 1 }),
  body('label').trim().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { zone, duration, price, label } = req.body;
      const id = uuidv4();
      const createdAt = new Date().toISOString();

      await db.run('INSERT INTO schedules (id, zone, duration, price, label, createdAt) VALUES (?, ?, ?, ?, ?, ?)', id, zone, duration, price, label, createdAt);
      res.status(201).json({ message: 'Créneau ajouté.' });
    } catch (error) {
      next(error);
    }
  }
);

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { zone, duration, price, label } = req.body;
    await db.run('UPDATE schedules SET zone = ?, duration = ?, price = ?, label = ?, updatedAt = ? WHERE id = ?', zone, duration, price, label, new Date().toISOString(), id);
    res.json({ message: 'Créneau mis à jour.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM schedules WHERE id = ?', id);
    res.json({ message: 'Créneau supprimé.' });
  } catch (error) {
    next(error);
  }
});

export default router;
