export function errorHandler(err, req, res, next) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  const status = err.message?.includes('booking_overlap') ? 409 : (err.status || 500);
  const message = status === 500 ? 'Erreur serveur interne.' : (status === 409 ? 'Ce cr?neau est d?j? r?serv?.' : err.message);

  res.status(status).json({
    error: message,
  });
}
