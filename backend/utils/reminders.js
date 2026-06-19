import schedule from 'node-schedule';
import { db } from '../config/database.js';
import { sendBrevoEmail, sendBrevoSms } from '../utils/brevo.js';
import { sendReminderSms } from '../utils/twilio.js';

function getTomorrowDateISO() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.toISOString().slice(0, 10);
}

export async function sendDueReminders() {
  const tomorrowISO = getTomorrowDateISO();

  const bookings = await db.all(
    "SELECT * FROM bookings WHERE appointmentDate = ? AND status != 'cancelled' AND reminderSentAt IS NULL",
    tomorrowISO
  );

  for (const booking of bookings) {
    const cancelUrl = `${process.env.SITE_URL || 'http://localhost:4000'}/annuler.html?token=${booking.cancellationToken}`;

    try {
      await sendBrevoEmail(
        booking.clientEmail,
        'Rappel de votre rendez-vous IS Beauty demain',
        `<p>Bonjour ${booking.clientName},</p><p>Petit rappel : votre rendez-vous pour <strong>${booking.serviceType}</strong> est prévu <strong>demain</strong>, le <strong>${booking.appointmentDate}</strong> à <strong>${booking.appointmentStart}</strong>.</p><p>Merci de vous présenter quelques minutes avant l'heure prévue.</p><p style="margin-top:24px;font-size:13px;color:#7488A3">Un empêchement ? <a href="${cancelUrl}">Annuler ce rendez-vous</a>.</p>`,
        `Bonjour ${booking.clientName},\nPetit rappel : votre rendez-vous pour ${booking.serviceType} est prévu demain, le ${booking.appointmentDate} à ${booking.appointmentStart}.\nMerci de vous présenter quelques minutes avant l'heure prévue.\nUn empêchement ? Annuler ce rendez-vous : ${cancelUrl}`
      );
    } catch (emailError) {
      console.warn('Erreur Brevo email (rappel J-1):', emailError.message || emailError);
    }

    try {
      if (process.env.BREVO_API_KEY && process.env.BREVO_SMS_SENDER) {
        await sendBrevoSms(
          booking.clientPhone,
          `Rappel IS Beauty : RDV demain ${booking.appointmentDate} à ${booking.appointmentStart}. Annuler : ${cancelUrl}`
        );
      } else {
        await sendReminderSms(booking.clientPhone, booking.clientName, booking.appointmentDate, booking.appointmentStart);
      }
    } catch (smsError) {
      console.warn('Erreur SMS (rappel J-1):', smsError.message || smsError);
    }

    try {
      await db.run('UPDATE bookings SET reminderSentAt = ? WHERE id = ?', new Date().toISOString(), booking.id);
    } catch (dbError) {
      console.warn('Erreur enregistrement reminderSentAt:', dbError.message || dbError);
    }
  }

  return bookings.length;
}

export function startReminderScheduler() {
  // Tous les jours à 9h00, heure du serveur
  schedule.scheduleJob('0 9 * * *', async () => {
    try {
      const count = await sendDueReminders();
      console.log(`Rappels J-1 envoyés : ${count}`);
    } catch (error) {
      console.error('Erreur lors de l\'envoi des rappels J-1:', error);
    }
  });
  console.log('Planificateur de rappels J-1 démarré (tous les jours à 9h00).');
}