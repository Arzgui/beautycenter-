import { tomorrowParis } from './dates.js';
import { escapeHtml } from './html.js';
import schedule from 'node-schedule';
import { db } from '../config/database.js';
import { sendBrevoEmail, sendBrevoSms } from '../utils/brevo.js';
import { sendReminderSms } from '../utils/twilio.js';

let running = false;
export async function sendDueReminders() {
  if (running) return 0;
  running = true;
  try {
    const tomorrowISO = tomorrowParis();

    const bookings = await db.all(
      "SELECT * FROM bookings WHERE appointmentDate = ? AND status IN ('pending', 'confirmed') AND reminderSentAt IS NULL",
      tomorrowISO
    );

    let sent = 0;
    for (const booking of bookings) {
      let delivered = false;
      const cancelUrl = `${process.env.SITE_URL || 'http://localhost:4000'}/annuler.html?token=${booking.cancellationToken}`;

      try {
        delivered = (await sendBrevoEmail(
          booking.clientEmail,
          'Rappel de votre rendez-vous IS Beauty demain',
          `<p>Bonjour ${escapeHtml(booking.clientName)},</p><p>Petit rappel : votre rendez-vous pour <strong>${escapeHtml(booking.serviceType)}</strong> est prévu <strong>demain</strong>, le <strong>${escapeHtml(booking.appointmentDate)}</strong> à <strong>${escapeHtml(booking.appointmentStart)}</strong>.</p><p>Merci de vous présenter quelques minutes avant l'heure prévue.</p><p style="margin-top:24px;font-size:13px;color:#7488A3">Un empêchement ? <a href="${escapeHtml(cancelUrl)}">Annuler ce rendez-vous</a>.</p>`,
          `Bonjour ${booking.clientName},\nPetit rappel : votre rendez-vous pour ${booking.serviceType} est prévu demain, le ${booking.appointmentDate} à ${booking.appointmentStart}.\nMerci de vous présenter quelques minutes avant l'heure prévue.\nUn empêchement ? Annuler ce rendez-vous : ${cancelUrl}`
        )) === true || delivered;
      } catch (emailError) {
        console.warn('Erreur Brevo email (rappel J-1):', emailError.message || emailError);
      }

      try {
        if (process.env.BREVO_API_KEY && process.env.BREVO_SMS_SENDER) {
          delivered = (await sendBrevoSms(
            booking.clientPhone,
            `Rappel IS Beauty : RDV demain ${booking.appointmentDate} à ${booking.appointmentStart}. Annuler : ${cancelUrl}`
          )) === true || delivered;
        } else {
          delivered = (await sendReminderSms(booking.clientPhone, booking.clientName, booking.appointmentDate, booking.appointmentStart)) === true || delivered;
        }
      } catch (smsError) {
        console.warn('Erreur SMS (rappel J-1):', smsError.message || smsError);
      }

      try {
        if (!delivered) continue;
        sent += 1;
        await db.run('UPDATE bookings SET reminderSentAt = ? WHERE id = ?', new Date().toISOString(), booking.id);
      } catch (dbError) {
        console.warn('Erreur enregistrement reminderSentAt:', dbError.message || dbError);
      }
    }

    return sent;
  } finally { running = false; }
}

export function startReminderScheduler() {
  // First run at 09:00 Paris; retry unsuccessful reminders every 15 minutes.
  schedule.scheduleJob({ rule: '*/15 9-18 * * *', tz: 'Europe/Paris' }, async () => {
    try {
      const count = await sendDueReminders();
      console.log(`Rappels J-1 envoyés : ${count}`);
    } catch (error) {
      console.error('Erreur lors de l\'envoi des rappels J-1:', error);
    }
  });
  console.log('Reminder scheduler: Europe/Paris, 09:00-18:45, every 15 minutes.');
}
