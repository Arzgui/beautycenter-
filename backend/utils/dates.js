export function parisDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function tomorrowParis(now = new Date()) {
  const date = new Date(parisDate(now) + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
export function validAppointment(date, start, end) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(start || '') && /^([01]\d|2[0-3]):[0-5]\d$/.test(end || '') && start >= '09:00' && end <= '19:00' && start < end && new Date(date).getUTCDay() !== 0;
}
