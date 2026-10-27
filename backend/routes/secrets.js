const express = require('express');
const mongoose = require('mongoose');
const requireAuth = require('../middleware/auth');
const Secret = require('../models/Secret');
const { encryptedSchema } = require('../validation');

const router = express.Router();
router.use(requireAuth);

const ownedBy = (req) => ({ _id: req.params.id, userId: req.user._id });
const notFound = res => res.status(404).json({ error: 'Not found' });

router.param('id', (req, res, next, id) => (mongoose.isValidObjectId(id) ? next() : notFound(res)));

router.get('/', async (req, res) => {
  const secrets = await Secret.find({ userId: req.user._id }).sort({ createdAt: -1, _id: -1 });
  res.json(secrets);
});

router.post('/', async (req, res) => {
  const { ciphertext, iv } = encryptedSchema.parse(req.body);
  const { maxEntries } = req.app.locals.config;
  if (await Secret.countDocuments({ userId: req.user._id }) >= maxEntries) {
    return res.status(409).json({ error: 'Entry limit reached' });
  }
  const secret = await Secret.create({ userId: req.user._id, v: 2, ciphertext, iv });
  res.status(201).json(secret);
});

router.put('/:id', async (req, res) => {
  const { ciphertext, iv } = encryptedSchema.parse(req.body);
  const secret = await Secret.findOneAndUpdate(
    ownedBy(req),
    { $set: { v: 2, ciphertext, iv }, $unset: { site: 1, username: 1, salt: 1 } },
    { new: true },
  );
  if (!secret) return notFound(res);
  res.json(secret);
});

router.delete('/:id', async (req, res) => {
  const deleted = await Secret.findOneAndDelete(ownedBy(req));
  if (!deleted) return notFound(res);
  res.json({ ok: true });
});

module.exports = router;
