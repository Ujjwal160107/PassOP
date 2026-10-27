const error = (description, message) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: message } } },
});

const json = (schema, example) => ({ content: { 'application/json': { schema, ...(example && { example }) } } });

const ERRORS = {
  badRequest: error('Invalid input. The message names the first problem.', 'Password must be at least 8 characters'),
  unauthorized: error('No valid session cookie.', 'Not authenticated'),
  forbidden: error('`Origin` header is not the PassOP frontend.', 'Request origin not allowed'),
  notFound: error('No such entry for this user, or a malformed id.', 'Not found'),
  tooMany: error('Rate limit hit: 10 sign-up or login attempts per 15 minutes per IP.', 'Too many attempts. Try again in 15 minutes.'),
};

const ENTRY_EXAMPLE = { ciphertext: 'q0Rk3m1bA9yT2uXo5fVhC8sW4eZj7nLpGdKiMtQwErYuPaSd…', iv: 'm4Xb2LqP9sTvY7cE' };

function openApiSpec(config) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'PassOP API',
      version: '2.0.0',
      description: [
        'Zero-knowledge password vault. The browser encrypts every entry with AES-256-GCM under a key derived from the master password (PBKDF2-SHA256, 600,000 iterations). **Passwords only ever reach the API as ciphertext.** Each entry’s site and username are also stored readable, with the owner’s email, so the database shows what an entry is.',
        '',
        '- **Session:** a 7-day HS256 JWT in an `httpOnly` cookie named `token`, set by sign-up, login or Google sign-in.',
        '- **CSRF defence:** every non-GET request under `/api` must send `Origin` equal to the PassOP frontend, or it gets `403`. That is why *Try it out* is enabled for GET requests only on this page.',
        '- **Rate limits:** 300 requests per 15 minutes per IP overall; 10 sign-up or login attempts per 15 minutes per IP.',
        '- **Validation:** every body is checked with zod. Unknown fields are rejected, and Mongo query operators are stripped.',
      ].join('\n'),
    },
    servers: [{ url: config.apiBaseUrl }],
    tags: [
      { name: 'Health', description: 'Liveness check' },
      { name: 'Auth', description: 'Accounts and sessions (email and password)' },
      { name: 'Google OAuth', description: 'Sign in with Google (OAuth 2.0 via Passport)' },
      { name: 'Vault', description: 'Key-derivation parameters and the encrypted check value' },
      { name: 'Secrets', description: 'Encrypted vault entries, scoped to the signed-in user' },
    ],
    paths: {
      '/api/health': {
        get: {
          tags: ['Health'],
          summary: 'Check the API is up',
          responses: { 200: { description: 'API is running', ...json({ type: 'object', properties: { ok: { type: 'boolean' } } }, { ok: true }) } },
        },
      },
      '/api/auth/signup': {
        post: {
          tags: ['Auth'],
          summary: 'Create an account',
          description: 'The account password is hashed with bcrypt (12 rounds). It is separate from the master password, which never leaves the browser.',
          requestBody: { required: true, ...json({ $ref: '#/components/schemas/Credentials' }) },
          responses: {
            200: { description: 'Account created; session cookie set', headers: { 'Set-Cookie': { $ref: '#/components/headers/SessionCookie' } }, ...json({ $ref: '#/components/schemas/UserResponse' }) },
            400: ERRORS.badRequest,
            403: ERRORS.forbidden,
            409: error('Email already registered.', 'An account with this email already exists'),
            429: ERRORS.tooMany,
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in',
          description: 'Unknown emails still run a bcrypt comparison, so response time does not reveal which accounts exist.',
          requestBody: { required: true, ...json({ $ref: '#/components/schemas/Credentials' }) },
          responses: {
            200: { description: 'Logged in; session cookie set', headers: { 'Set-Cookie': { $ref: '#/components/headers/SessionCookie' } }, ...json({ $ref: '#/components/schemas/UserResponse' }) },
            400: ERRORS.badRequest,
            401: error('Wrong email or password.', 'Invalid credentials'),
            403: ERRORS.forbidden,
            429: ERRORS.tooMany,
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Log out',
          responses: {
            200: { description: 'Session cookie cleared', ...json({ $ref: '#/components/schemas/Ok' }, { ok: true }) },
            403: ERRORS.forbidden,
          },
        },
      },
      '/api/auth/session': {
        get: {
          tags: ['Auth'],
          summary: 'Who is signed in',
          security: [{ cookieAuth: [] }],
          responses: {
            200: { description: 'The signed-in user', ...json({ $ref: '#/components/schemas/UserResponse' }) },
            401: ERRORS.unauthorized,
          },
        },
      },
      '/auth/google': {
        get: {
          tags: ['Google OAuth'],
          summary: 'Start Google sign-in',
          description: 'Redirects to Google with a random `state` value, also stored in a short-lived cookie. Open it in the browser rather than with Try it out.',
          responses: { 302: { description: 'Redirect to Google’s account picker' } },
        },
      },
      '/auth/google/callback': {
        get: {
          tags: ['Google OAuth'],
          summary: 'Google redirects back here',
          description: 'Checks `state`, then signs in the Google account. An existing account is linked only when Google reports the email as verified and the account has no password.',
          parameters: [
            { name: 'code', in: 'query', schema: { type: 'string' }, description: 'Authorization code from Google' },
            { name: 'state', in: 'query', schema: { type: 'string' }, description: 'Must match the `oauth_state` cookie' },
          ],
          responses: { 302: { description: 'Session cookie set, then redirect to the app (or to `/?auth=fail`)' } },
        },
      },
      '/api/vault': {
        get: {
          tags: ['Vault'],
          summary: 'Get vault parameters',
          description: '`null` until the user has created a master password.',
          security: [{ cookieAuth: [] }],
          responses: {
            200: { description: 'Vault parameters, or null', ...json({ type: 'object', properties: { vault: { allOf: [{ $ref: '#/components/schemas/Vault' }], nullable: true } } }) },
            401: ERRORS.unauthorized,
          },
        },
        post: {
          tags: ['Vault'],
          summary: 'Create the vault',
          description: 'Stores the salt, iteration count and the encrypted check value used to detect a wrong master password. The master password itself is never sent. Can only succeed once per user.',
          security: [{ cookieAuth: [] }],
          requestBody: { required: true, ...json({ $ref: '#/components/schemas/Vault' }) },
          responses: {
            201: { description: 'Vault created', ...json({ type: 'object', properties: { vault: { $ref: '#/components/schemas/Vault' } } }) },
            400: ERRORS.badRequest,
            401: ERRORS.unauthorized,
            403: ERRORS.forbidden,
            409: error('A vault already exists.', 'Vault already exists'),
          },
        },
      },
      '/api/secrets': {
        get: {
          tags: ['Secrets'],
          summary: 'List my entries',
          description: 'Newest first. Each entry has a readable `site`, `username` and `ownerEmail`; the password is only inside the ciphertext.',
          security: [{ cookieAuth: [] }],
          responses: {
            200: { description: 'The user’s encrypted entries', ...json({ type: 'array', items: { $ref: '#/components/schemas/Secret' } }) },
            401: ERRORS.unauthorized,
          },
        },
        post: {
          tags: ['Secrets'],
          summary: 'Save an entry',
          security: [{ cookieAuth: [] }],
          requestBody: { required: true, ...json({ $ref: '#/components/schemas/SecretInput' }) },
          responses: {
            201: { description: 'Saved', ...json({ $ref: '#/components/schemas/Secret' }) },
            400: ERRORS.badRequest,
            401: ERRORS.unauthorized,
            403: ERRORS.forbidden,
            409: error('The user already has 1,000 entries.', 'Entry limit reached'),
          },
        },
      },
      '/api/secrets/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-f0-9]{24}$' }, description: 'Entry id' }],
        put: {
          tags: ['Secrets'],
          summary: 'Replace an entry',
          security: [{ cookieAuth: [] }],
          requestBody: { required: true, ...json({ $ref: '#/components/schemas/SecretInput' }) },
          responses: {
            200: { description: 'Updated', ...json({ $ref: '#/components/schemas/Secret' }) },
            400: ERRORS.badRequest,
            401: ERRORS.unauthorized,
            403: ERRORS.forbidden,
            404: ERRORS.notFound,
          },
        },
        delete: {
          tags: ['Secrets'],
          summary: 'Delete an entry',
          security: [{ cookieAuth: [] }],
          responses: {
            200: { description: 'Deleted', ...json({ $ref: '#/components/schemas/Ok' }, { ok: true }) },
            401: ERRORS.unauthorized,
            403: ERRORS.forbidden,
            404: ERRORS.notFound,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token', description: 'Session JWT set by sign-up, login or Google sign-in' },
      },
      headers: {
        SessionCookie: { description: '`token=<JWT>; HttpOnly; Path=/; Max-Age=604800` (plus `Secure; SameSite=None` in production)', schema: { type: 'string' } },
      },
      schemas: {
        Credentials: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 254, example: 'ujjwal@example.com' },
            password: { type: 'string', minLength: 8, description: '8 characters to 72 bytes', example: 'correct horse battery' },
          },
        },
        User: { type: 'object', properties: { id: { type: 'string', example: '6721f0c2a9e4b1d3c8f5a7e9' }, email: { type: 'string', example: 'ujjwal@example.com' } } },
        UserResponse: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
        Encrypted: {
          type: 'object',
          required: ['ciphertext', 'iv'],
          additionalProperties: false,
          description: 'AES-256-GCM output. The server never sees the plaintext.',
          properties: {
            ciphertext: { type: 'string', format: 'byte', maxLength: 16384, description: 'Base64 ciphertext with the GCM tag' },
            iv: { type: 'string', format: 'byte', description: 'Base64 of a random 12-byte IV, new for every save' },
          },
          example: ENTRY_EXAMPLE,
        },
        SecretInput: {
          type: 'object',
          required: ['site', 'username', 'ciphertext', 'iv'],
          additionalProperties: false,
          description: 'A vault entry. Site and username are stored readable; the password exists only inside the ciphertext. The server adds the owner’s email.',
          properties: {
            site: { type: 'string', maxLength: 2048, example: 'https://github.com' },
            username: { type: 'string', maxLength: 2048, example: 'ujjwal@demo.dev' },
            ciphertext: { type: 'string', format: 'byte', maxLength: 16384, description: 'Base64 AES-256-GCM output of `{ site, username, password }`' },
            iv: { type: 'string', format: 'byte', description: 'Base64 of a random 12-byte IV, new for every save' },
          },
          example: { site: 'https://github.com', username: 'ujjwal@demo.dev', ...ENTRY_EXAMPLE },
        },
        Vault: {
          type: 'object',
          required: ['salt', 'iterations', 'verifier'],
          additionalProperties: false,
          properties: {
            salt: { type: 'string', format: 'byte', description: 'Base64 of a random 16-byte PBKDF2 salt', example: 'c2FsdC1zYWx0LXNhbHQ=' },
            iterations: { type: 'integer', minimum: 100000, maximum: 10000000, example: 600000 },
            verifier: { allOf: [{ $ref: '#/components/schemas/Encrypted' }], description: 'A known text encrypted with the vault key, used to detect a wrong master password' },
          },
        },
        Secret: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '6721f3a8c4d2e1b0a9f8e7d6' },
            v: { type: 'integer', example: 2, description: 'Entry format version' },
            ownerEmail: { type: 'string', example: 'ujjwal@example.com', description: 'Email of the account that owns the entry' },
            site: { type: 'string', example: 'https://github.com', description: 'Readable site name' },
            username: { type: 'string', example: 'ujjwal@demo.dev', description: 'Readable username for the site' },
            ciphertext: { type: 'string', format: 'byte', example: ENTRY_EXAMPLE.ciphertext },
            iv: { type: 'string', format: 'byte', example: ENTRY_EXAMPLE.iv },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Ok: { type: 'object', properties: { ok: { type: 'boolean' } } },
        Error: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  };
}

module.exports = { openApiSpec };
