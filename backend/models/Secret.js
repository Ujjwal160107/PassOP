const mongoose = require('mongoose');

// v2 entries hold only ciphertext + iv (the whole entry is encrypted client-side).
// Entries without v are legacy: plaintext site/username and a per-entry salt. They are
// rewritten as v2 by the client on unlock.
const SecretSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  v: Number,
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
  site: String,
  username: String,
  salt: String,
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      delete ret.userId;
      delete ret.__v;
      return ret;
    },
  },
});

SecretSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Secret', SecretSchema);
