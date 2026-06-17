import express from 'express';
import { db } from '../../config/database.js';
import { sendBrevoEmail } from '../../utils/brevo.js';

const router = express.Router();

router.post('/invite', async (req, res, next) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) return res.status(400).json({ message: 'Email et nom requis.' });

    const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
    if (existing) return res.status(409).json({ message: 'Cette cliente a déjà un compte.' });

    await sendBrevoEmail(
      email,
      'Rejoignez votre espace fidélité IS Beauty ✦',
      `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#070B14;color:#DCE6F2;padding:40px;border-radius:12px;border:1px solid rgba(26,236,255,0.12)">
        <h1 style="font-size:24px;color:#fff;margin-bottom:8px">Bonjour ${name} ✦</h1>
        <p style="color:#7488A3;margin-bottom:24px">Vos séances chez IS Beauty vous donnent droit à des récompenses exclusives.</p>
        <p style="margin-bottom:24px">Rejoignez votre <strong style="color:#B6F4FF">espace fidélité</strong> pour suivre vos points, débloquer des avantages et gérer vos rendez-vous en ligne.</p>
        <a href="http://localhost:4000/compte.html" style="display:inline-block;padding:14px 28px;background:#B6F4FF;color:#070B14;font-weight:700;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;border-radius:8px;text-decoration:none">
          Créer mon espace
        </a>
        <p style="margin-top:32px;font-size:12px;color:#7488A3">IS Beauty — Épilation Médico Laser ICE — Forbach</p>
      </div>`,
    );

    res.json({ message: `Invitation envoyée à ${email}.` });
  } catch (error) {
    next(error);
  }
});

export default router;