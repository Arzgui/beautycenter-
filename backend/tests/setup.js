import { jest } from '@jest/globals';
process.env.DATABASE_FILE = ':memory:';
process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-bytes';
process.env.DOTENV_CONFIG_PATH = '__no_test_env__';
for (const key of ['BREVO_API_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','VAPID_PRIVATE_KEY','VAPID_PUBLIC_KEY']) delete process.env[key];
await jest.unstable_mockModule('../utils/brevo.js', () => ({ sendBrevoEmail: jest.fn(async () => true), sendBrevoSms: jest.fn(async () => true) }));
await jest.unstable_mockModule('../utils/twilio.js', () => ({ sendConfirmationSms: jest.fn(async () => true), sendReminderSms: jest.fn(async () => true) }));
await jest.unstable_mockModule('../utils/push.js', () => ({ broadcastPushNotification: jest.fn(async () => true) }));
