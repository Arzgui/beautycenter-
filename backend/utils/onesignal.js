import dotenv from 'dotenv';

dotenv.config();

const appId = process.env.ONESIGNAL_APP_ID;
const apiKey = process.env.ONESIGNAL_API_KEY;

export async function sendPushNotification(playerId, heading, message) {
  if (!appId || !apiKey || !playerId) return;

  await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      headings: { en: heading },
      contents: { en: message },
      include_player_ids: [playerId],
    }),
  });
}
