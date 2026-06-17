export function errorHandler(err, req, res, next) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  const status = err.status || 500;
  const message = status === 500 ? 'Erreur serveur interne.' : err.message;

  res.status(status).json({
    error: message,
  });
}
