const { ZodError } = require('zod');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Invalid request' });
  if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });

  console.error(err);
  res.status(500).json({ error: 'Server error' });
}

module.exports = { notFound, errorHandler };
