const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const passport = require('passport');

const authRoutes = require('./routes/auth');
const secretRoutes = require('./routes/secrets');
const oauthRoutes = require('./routes/oauth');
const vaultRoutes = require('./routes/vault');
const requireSameOrigin = require('./middleware/originCheck');
const { notFound, errorHandler } = require('./middleware/errors');

// Strip `$`-prefixed keys from query filters so request bodies cannot inject operators.
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

function createApp(config) {
  const app = express();
  app.locals.config = config;

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use(passport.initialize());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', requireSameOrigin);
  app.use('/api/auth', authRoutes(config));
  app.use('/api/vault', vaultRoutes);
  app.use('/api/secrets', secretRoutes);

  if (config.google) app.use('/auth', oauthRoutes(config));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
