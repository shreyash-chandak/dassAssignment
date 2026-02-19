function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;
  const message = err.message || "Internal server error";

  // eslint-disable-next-line no-console
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(status).json({ message });
}

module.exports = errorHandler;