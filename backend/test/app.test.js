const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeApp } = require('./helpers');
const { loadConfig } = require('../config');

test('GET /api/health returns ok', async () => {
  const res = await request(makeApp()).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('unknown route returns JSON 404', async () => {
  const res = await request(makeApp()).get('/nope');
  assert.equal(res.status, 404);
  assert.equal(typeof res.body.error, 'string');
});

test('loadConfig lists every missing required variable', () => {
  assert.throws(() => loadConfig({}), /MONGO_URI, JWT_SECRET, FRONTEND_URL/);
});

test('loadConfig rejects a short JWT secret', () => {
  assert.throws(
    () => loadConfig({ MONGO_URI: 'mongodb://x', JWT_SECRET: 'short12345', FRONTEND_URL: 'http://a' }),
    /JWT_SECRET/,
  );
});

test('loadConfig disables Google without credentials', () => {
  const config = loadConfig({ MONGO_URI: 'mongodb://x', JWT_SECRET: 'y'.repeat(32), FRONTEND_URL: 'http://a' });
  assert.equal(config.google, null);
  assert.equal(config.authLimit, 10);
  assert.equal(config.maxEntries, 1000);
});
