import dotenv from 'dotenv';
import Twilio from 'twilio';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

let client = null;
if (accountSid && authToken) {
  try {
    client = Twilio(accountSid, authToken);
  } catch (err) {
    console.warn('Twilio client init failed:', err.message || err);
    client = null;
  }
} else {
  console.info('Twilio non configuré: les SMS Twilio seront désactivés.');
}

async function safeSendSms(to, body) {
  if (!client || !twilioPhone) {
    console.info('SMS non envoyé (Twilio non configuré):', to, body);
    return;
  }
  try {
    await client.messages.create({ from: twilioPhone, to, body });
  } catch (err) {
    console.warn('Erreur en envoyant le SMS via Twilio:', err.message || err);
  }
}

export async function sendConfirmationSms(phone, name, date, time, service) {
  const body = `Bonjour ${name}, votre rendez-vous IS Beauty pour ${service} est confirmé le ${date} à ${time}. À bientôt !`;
  await safeSendSms(phone, body);
}

export async function sendReminderSms(phone, name, date, time) {
  const body = `Rappel IS Beauty : votre séance est prévue le ${date} à ${time}. Pensez à venir 10 min avant.`;
  await safeSendSms(phone, body);
}
