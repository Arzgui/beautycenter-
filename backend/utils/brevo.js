import dotenv from 'dotenv';
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'contact@isbeauty.fr';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'IS Beauty';
const BREVO_SMS_SENDER = process.env.BREVO_SMS_SENDER || 'ISBEAU';

export async function sendBrevoEmail(toEmail, subject, htmlContent, textContent) {
  if (!BREVO_API_KEY || !toEmail || !subject || !htmlContent) {
    console.warn('Notification provider not configured');
    return false;
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {  // ✅ nouvelle URL
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: toEmail }],
      subject,
      htmlContent,
      textContent: textContent || htmlContent.replace(/<[^>]+>/g, ''),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Brevo email failed (${res.status})`);
  } else {
    return true;
  }
}

export async function sendBrevoSms(phone, message) {
  if (!BREVO_API_KEY || !phone || !message || !BREVO_SMS_SENDER) {
    console.warn('Notification provider not configured');
    return false;
  }

  const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: BREVO_SMS_SENDER,
      recipient: phone,
      content: message,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Brevo SMS failed (${res.status})`);
  } else {
    return true;
  }
}