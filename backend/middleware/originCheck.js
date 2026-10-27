const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF defence: the session cookie is SameSite=None in production, so a cross-site page could
// otherwise send it. Browsers always attach Origin to cross-origin and same-origin writes.
function requireSameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('Origin') !== req.app.locals.config.frontendUrl) {
    return res.status(403).json({ error: 'Request origin not allowed' });
  }
  next();
}

module.exports = requireSameOrigin;
