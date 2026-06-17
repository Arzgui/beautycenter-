import { body } from 'express-validator';

export const bookingValidationRules = [
  body('clientName').trim().notEmpty().withMessage('Le nom est requis.'),
  body('clientEmail').isEmail().withMessage('Email invalide.'),
  body('clientPhone').trim().notEmpty().withMessage('Le téléphone est requis.'),
  body('serviceZone').isIn(['visage', 'aisselles', 'maillot', 'jambes', 'corps']).withMessage('Zone invalide.'),
  body('appointmentDate').isISO8601().withMessage('Date invalide.'),
  body('appointmentStart').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Heure invalide.'),
  body('price').isInt({ min: 1 }).withMessage('Prix invalide.'),
];
