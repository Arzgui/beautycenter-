import dotenv from 'dotenv';
import Twilio from 'twilio';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

let client = null;
if (accountSid && authToken) {
  try {
    client = Twilio(accountSid, authToken, { timeout: 10000 });
  } catch (err) {
    console.warn('Twilio client init failed:', err.message || err);
    client = null;
  }
} else {
  console.info('Twilio non configuré: les SMS Twilio seront désactivés.');
}

async function safeSendSms(to, body) {
  if (!client || !twilioPhone) {
    return false;
  }
  try {
    await client.messages.create({ from: twilioPhone, to, body });
    return true;
  } catch (err) {
    throw err;
  }
}

export async function sendConfirmationSms(phone, name, date, time, service) {
  const body = `Bonjour ${name}, votre rendez-vous IS Beauty pour ${service} est confirmé le ${date} à ${time}. À bientôt !`;
  return safeSendSms(phone, body);
}

export async function sendReminderSms(phone, name, date, time) {
  const body = `Rappel IS Beauty : votre séance est prévue le ${date} à ${time}. Pensez à venir 10 min avant.`;
  return safeSendSms(phone, body);
}
