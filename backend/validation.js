const { z } = require('zod');

const credentialsSchema = z.object({
  email: z.string({ error: 'Email is required' }).trim().toLowerCase().max(254, 'Email is too long')
    .pipe(z.email('Enter a valid email address')),
  password: z.string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .refine(p => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes'),
});

module.exports = { credentialsSchema };

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const base64 = (field, max) => z.string({ error: `${field} is required` })
  .min(1, `${field} is required`)
  .max(max, `${field} is too long`)
  .regex(BASE64, `${field} must be base64`);
const base64Bytes = (field, bytes) => base64(field, 128)
  .refine(s => Buffer.from(s, 'base64').length === bytes, `${field} must be ${bytes} bytes`);

const encryptedSchema = z.object({
  ciphertext: base64('ciphertext', 16384),
  iv: base64Bytes('iv', 12),
}).strict();

const vaultSchema = z.object({
  salt: base64Bytes('salt', 16),
  iterations: z.number().int().min(100000).max(10000000),
  verifier: encryptedSchema,
}).strict();

// A vault entry: the password stays inside the ciphertext; site and username are kept readable.
const secretSchema = encryptedSchema.extend({
  site: z.string({ error: 'site is required' }).max(2048, 'site is too long'),
  username: z.string({ error: 'username is required' }).max(2048, 'username is too long'),
});

module.exports.encryptedSchema = encryptedSchema;
module.exports.secretSchema = secretSchema;
module.exports.vaultSchema = vaultSchema;
