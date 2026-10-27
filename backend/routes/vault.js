const express = require('express');
const mongoose = require('mongoose');
const requireAuth = require('../middleware/auth');
const User = require('../models/User');
const { vaultSchema } = require('../validation');

const router = express.Router();
router.use(requireAuth);

const toJson = vault => (vault ? { salt: vault.salt, iterations: vault.iterations, verifier: { ciphertext: vault.verifier.ciphertext, iv: vault.verifier.iv } } : null);

router.get('/', (req, res) => {
  res.json({ vault: toJson(req.user.vault) });
});

router.post('/', async (req, res) => {
  const vault = vaultSchema.parse(req.body);
  // Conditional update so two concurrent setups cannot both win. The filter is built here,
  // not from input, so it is marked trusted to survive sanitizeFilter.
  const updated = await User.findOneAndUpdate(
    { _id: req.user._id, vault: mongoose.trusted({ $exists: false }) },
    { $set: { vault } },
    { new: true },
  );
  if (!updated) return res.status(409).json({ error: 'Vault already exists' });
  res.status(201).json({ vault: toJson(updated.vault) });
});

module.exports = router;
