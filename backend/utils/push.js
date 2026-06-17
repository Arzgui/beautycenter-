import dotenv from 'dotenv';
import webpush from 'web-push';
import { db } from '../config/database.js';

dotenv.config();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@isbeauty.fr';

let vapidKeys = {
  publicKey: VAPID_PUBLIC_KEY,
  privateKey: VAPID_PRIVATE_KEY,
};

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  const generatedKeys = webpush.generateVAPIDKeys();
  vapidKeys = {
    publicKey: generatedKeys.publicKey,
    privateKey: generatedKeys.privateKey,
  };
  console.warn('⚠️  VAPID keys absentes : des clés temporaires ont été générées. Configurez VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY dans .env.');
}

webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);

export function getVapidPublicKey() {
  return vapidKeys.publicKey;
}

async function removeStaleSubscription(endpoint) {
  await db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', endpoint);
}

export async function sendPushNotification(subscription, payload) {
  if (!subscription?.endpoint) return;

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (error) {
    const statusCode = error?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await removeStaleSubscription(subscription.endpoint);
    } else {
      console.warn('Push notification failed:', error.message || error);
    }
  }
}

export async function broadcastPushNotification(title, body) {
  const subscriptions = await db.all('SELECT subscription FROM push_subscriptions');
  console.log(`Push: ${subscriptions.length} abonnement(s) trouvé(s)`);  // ← ajoutez ça
  const payload = { title, body, url: '/' };
  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        const subscription = JSON.parse(row.subscription);
        await sendPushNotification(subscription, payload);
      } catch (error) {
        console.warn('Erreur de notification push pour un abonnement:', error.message || error);
      }
    })
  );
}
