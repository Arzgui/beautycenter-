import express from 'express';
import { body, validationResult } from 'express-validator';
import { sendReminderSms } from '../utils/twilio.js';
import { verifyToken } from '../middleware/auth.js';
import bodyParser from 'body-parser';

const router = express.Router();
router.use(bodyParser.urlencoded({ extended: false }));

router.post('/twilio-webhook', async (req, res) => {
  const { Body, From } = req.body;
  console.log('Webhook Twilio reçu:', { Body, From });
  res.send('<Response></Response>');
});

router.post(
  '/send-reminder',
  verifyToken,
  body('phone').trim().notEmpty(),
  body('name').trim().notEmpty(),
  body('appointmentDate').isISO8601(),
  body('appointmentStart').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { phone, name, appointmentDate, appointmentStart } = req.body;
      await sendReminderSms(phone, name, appointmentDate, appointmentStart);
      res.json({ message: 'Rappel envoyé.' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
