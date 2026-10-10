import express from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
import { validAppointment } from '../../utils/dates.js';
const router = express.Router();
router.get('/', async (req, res, next) => {
  try { res.json({ unavailability: await db.all('SELECT * FROM unavailability ORDER BY appointmentDate, appointmentStart') }); }
  catch (error) { next(error); }
});
router.post('/', body('reason').optional().isString().trim().isLength({ max: 200 }), async (req, res, next) => {
  try {
    const { appointmentDate, appointmentStart, appointmentEnd, reason = '' } = req.body;
    if (!validationResult(req).isEmpty() || !validAppointment(appointmentDate, appointmentStart, appointmentEnd)) return res.status(400).json({ message: 'Indisponibilite invalide.' });
    const id = uuidv4();
    await db.run('INSERT INTO unavailability (id, appointmentDate, appointmentStart, appointmentEnd, reason, createdAt) VALUES (?, ?, ?, ?, ?, ?)', id, appointmentDate, appointmentStart, appointmentEnd, reason, new Date().toISOString());
    res.status(201).json({ id });
  } catch (error) { next(error); }
});
router.delete('/:id', async (req, res, next) => {
  try { const result = await db.run('DELETE FROM unavailability WHERE id = ?', req.params.id); res.sendStatus(result.changes ? 204 : 404); }
  catch (error) { next(error); }
});
export default router;
