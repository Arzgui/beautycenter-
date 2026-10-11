import express from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
const router = express.Router();
const validate = [
  body('zone').isString().trim().matches(/^[a-z][a-z0-9_-]{0,49}$/),
  body('duration').isInt({ min: 15, max: 600 }).toInt(),
  body('price').isInt({ min: 0 }).toInt(),
  body('label').isString().trim().isLength({ min: 1, max: 150 }),
];
router.get('/', async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store'); res.json({ schedules: await db.all('SELECT * FROM schedules ORDER BY label') }); }
  catch (error) { next(error); }
});
async function save(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array().map(({ value, ...error }) => error) });
    const { zone, duration, price, label } = req.body;
    const current = req.params.id && await db.get('SELECT id, zone FROM schedules WHERE id = ?', req.params.id);
    if (req.params.id && !current) return res.status(404).json({ message: 'Prestation introuvable.' });
    if (current && current.zone !== zone) return res.status(400).json({ message: 'Le code de la prestation ne peut pas etre modifie.' });
    if (current) await db.run('UPDATE schedules SET duration=?, price=?, label=?, updatedAt=? WHERE id=?', duration, price, label, new Date().toISOString(), current.id);
    else await db.run('INSERT INTO schedules (id, zone, duration, price, label, createdAt) VALUES (?, ?, ?, ?, ?, ?)', uuidv4(), zone, duration, price, label, new Date().toISOString());
    res.status(current ? 200 : 201).json({ message: 'Prestation enregistree.' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ message: 'Ce code de prestation existe deja.' });
    next(error);
  }
}
router.post('/', validate, save);
router.patch('/:id', validate, save);
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await db.run('UPDATE schedules SET active = 0, updatedAt = ? WHERE id = ?', new Date().toISOString(), req.params.id);
    res.status(result.changes ? 200 : 404).json({ message: result.changes ? 'Prestation desactivee ; rendez-vous existants conserves.' : 'Prestation introuvable.' });
  } catch (error) { next(error); }
});
export default router;
