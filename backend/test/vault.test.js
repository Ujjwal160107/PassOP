const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { startDb, stopDb, clearDb, makeApp, makeAgent, signup } = require('./helpers');

before(startDb);
after(stopDb);
beforeEach(clearDb);

const b64 = n => Buffer.alloc(n, 7).toString('base64');
const vault = (overrides = {}) => ({
  salt: b64(16),
  iterations: 600000,
  verifier: { ciphertext: b64(31), iv: b64(12) },
  ...overrides,
});

test('vault endpoints need a session', async () => {
  const res = await request(makeApp()).get('/api/vault');
  assert.equal(res.status, 401);
});

test('a new user has no vault', async () => {
  const agent = makeAgent(makeApp());
  await signup(agent);
  const res = await agent.get('/api/vault');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { vault: null });
});

test('vault can be created once', async () => {
  const agent = makeAgent(makeApp());
  await signup(agent);
  const created = await agent.post('/api/vault').send(vault());
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.vault, vault());
  assert.deepEqual((await agent.get('/api/vault')).body.vault, vault());
  const again = await agent.post('/api/vault').send(vault());
  assert.equal(again.status, 409);
});

test('vault salt must be 16 bytes', async () => {
  const agent = makeAgent(makeApp());
  await signup(agent);
  const res = await agent.post('/api/vault').send(vault({ salt: b64(8) }));
  assert.equal(res.status, 400);
});
