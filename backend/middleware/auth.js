const mongoose = require('mongoose');
const User = require('../models/User');
const { readSession } = require('../utils/authUtils');

async function requireAuth(req, res, next) {
  const userId = readSession(req, req.app.locals.config);
  if (!userId || !mongoose.isValidObjectId(userId)) return res.status(401).json({ error: 'Not authenticated' });

  const user = await User.findById(userId).select('-passwordHash');
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

module.exports = requireAuth;
