const crypto = require('crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const STATE_COOKIE = 'oauth_state';

// Stateless replacement for passport's session-backed state store: the state lives in a
// short-lived httpOnly cookie and must match the `state` Google echoes back (login CSRF defence).
function cookieStateStore(config) {
  const options = { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/auth' };
  return {
    store(req, callback) {
      const state = crypto.randomBytes(16).toString('hex');
      req.res.cookie(STATE_COOKIE, state, { ...options, maxAge: 10 * 60 * 1000 });
      callback(null, state);
    },
    verify(req, state, callback) {
      const expected = req.cookies?.[STATE_COOKIE];
      req.res.clearCookie(STATE_COOKIE, options);
      const ok = typeof state === 'string' && typeof expected === 'string' && state.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected));
      callback(null, ok, ok ? undefined : { message: 'Invalid OAuth state' });
    },
  };
}

async function findOrCreateGoogleUser(profile) {
  const byProvider = await User.findOne({ 'oauth.providerId': profile.id });
  if (byProvider) return byProvider;

  const email = profile.emails?.[0]?.value?.trim().toLowerCase();
  const verified = profile.emails?.[0]?.verified === true || profile._json?.email_verified === true;
  if (!email) throw new Error('Google profile has no email');
  if (!verified) throw new Error('Google email not verified');

  const oauth = { provider: 'google', providerId: profile.id };
  const existing = await User.findOne({ email });
  // Signup does not verify email ownership, so anyone could have pre-registered this address
  // with a password they know. Linking would hand them the Google user's account.
  if (existing?.passwordHash) throw new Error('Account already has a password; sign in with it');
  if (existing) {
    existing.oauth = oauth;
    return existing.save();
  }
  return User.create({ email, oauth });
}

function configureGoogle(config) {
  passport.use(new GoogleStrategy(
    {
      clientID: config.google.id,
      clientSecret: config.google.secret,
      callbackURL: `${config.apiBaseUrl}/auth/google/callback`,
      store: cookieStateStore(config),
    },
    (accessToken, refreshToken, profile, done) => {
      findOrCreateGoogleUser(profile).then(user => done(null, user), err => done(null, false, { message: err.message }));
    },
  ));
}

module.exports = { configureGoogle, findOrCreateGoogleUser, cookieStateStore };
