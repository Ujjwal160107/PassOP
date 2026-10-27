const REQUIRED = ['MONGO_URI', 'JWT_SECRET', 'FRONTEND_URL'];

function loadConfig(env = process.env) {
  const invalid = REQUIRED.filter(key => !env[key]);
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) invalid.push('JWT_SECRET (needs at least 32 characters)');
  if (invalid.length) throw new Error(`Missing or invalid env: ${invalid.join(', ')}`);

  const port = Number(env.PORT) || 3000;
  return {
    mongoUri: env.MONGO_URI,
    jwtSecret: env.JWT_SECRET,
    frontendUrl: env.FRONTEND_URL.replace(/\/$/, ''),
    apiBaseUrl: (env.API_BASE_URL || `http://localhost:${port}`).replace(/\/$/, ''),
    google: env.GOOGLE_ID && env.GOOGLE_SECRET ? { id: env.GOOGLE_ID, secret: env.GOOGLE_SECRET } : null,
    isProduction: env.NODE_ENV === 'production',
    port,
    authLimit: 10,
    maxEntries: 1000,
  };
}

module.exports = { loadConfig };
