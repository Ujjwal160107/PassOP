const mongoose = require('mongoose');

const EncryptedSchema = new mongoose.Schema({ ciphertext: String, iv: String }, { _id: false });

// Parameters the client needs to re-derive the vault key, plus a known plaintext encrypted
// under that key so a wrong master password is detected instead of producing garbage.
const VaultSchema = new mongoose.Schema({
  salt: String,
  iterations: Number,
  verifier: EncryptedSchema,
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  passwordHash: String,
  oauth: { provider: String, providerId: String },
  vault: { type: VaultSchema, default: undefined },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);
