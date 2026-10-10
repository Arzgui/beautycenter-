import { db } from '../config/database.js';
export const defaultServices = {
  bilan: { duration: 30, price: 0, label: 'Bilan Médico Laser ICE' },
  visage: { duration: 30, price: 40, label: 'Visage & cou' },
  aisselles: { duration: 30, price: 20, label: 'Aisselles' },
  maillot: { duration: 45, price: 50, label: 'Maillot' },
  jambes: { duration: 45, price: 30, label: 'Jambes & bras' },
  bras: { duration: 45, price: 28, label: 'Bras / Demi-bras' },
  dos: { duration: 60, price: 50, label: 'Dos / ventre' },
  corps: { duration: 60, price: 150, label: 'Corps complet' },
  forfait: { duration: 120, price: 120, label: 'Forfait multi-zones' },
};
export function getService(zone, includeInactive = false) {
  return db.get('SELECT id, zone, label, duration, price, active FROM schedules WHERE zone = ?' + (includeInactive ? '' : ' AND active = 1'), zone);
}
