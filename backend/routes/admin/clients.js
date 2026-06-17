import express from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
import bcrypt from 'bcrypt';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const clients = await db.all('SELECT id, email, name, points, createdAt FROM users WHERE role = ?', 'client');
    res.json({ clients });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  body('email').isEmail(),
  body('password').isLength({ min: 10 }),
  body('name').trim().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, password, name } = req.body;
      const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
      if (existing) return res.status(409).json({ message: 'Email déjà utilisé.' });

      const passwordHash = await bcrypt.hash(password, 12);
      const id = uuidv4();
      const createdAt = new Date().toISOString();

      await db.run('INSERT INTO users (id, email, passwordHash, name, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)', id, email, passwordHash, name, 'client', createdAt);
      res.status(201).json({ message: 'Client créé.' });
    } catch (error) {
      next(error);
    }
  }
);

router.patch('/:id/points', body('points').isInt(), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { id } = req.params;
    const { points } = req.body;
    await db.run('UPDATE users SET points = ? WHERE id = ?', points, id);
    res.json({ message: 'Points mis à jour.' });
  } catch (error) {
    next(error);
  }
});

export default router;
