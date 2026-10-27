const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');
const { credentialsSchema } = require('../validation');
const { issueSession, clearSession, publicUser } = require('../utils/authUtils');

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so both failure paths cost one bcrypt.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

function authRoutes(config) {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.authLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
  });

  router.post('/signup', limiter, async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    if (await User.exists({ email })) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({ email, passwordHash });
    issueSession(res, user, config);
    res.json({ user: publicUser(user) });
  });

  router.post('/login', limiter, async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const user = await User.findOne({ email });
    const match = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user?.passwordHash || !match) return res.status(401).json({ error: 'Invalid credentials' });

    issueSession(res, user, config);
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', (req, res) => {
    clearSession(res, config);
    res.json({ ok: true });
  });

  router.get('/session', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  return router;
}

module.exports = authRoutes;
