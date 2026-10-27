const jwt = require('jsonwebtoken');

const COOKIE = 'token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Frontend and API live on different sites in production, so the cookie must be SameSite=None there.
// clearCookie only matches when these options are identical to the ones used to set it.
function cookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/',
  };
}

function issueSession(res, user, config) {
  const token = jwt.sign({ sub: String(user._id) }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '7d' });
  res.cookie(COOKIE, token, { ...cookieOptions(config), maxAge: MAX_AGE_MS });
}

function clearSession(res, config) {
  res.clearCookie(COOKIE, cookieOptions(config));
}

function readSession(req, config) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }).sub;
  } catch {
    return null;
  }
}

const publicUser = user => ({ id: user._id, email: user.email });

module.exports = { issueSession, clearSession, readSession, cookieOptions, publicUser };
