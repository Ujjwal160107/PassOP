const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Secret = require('../models/Secret');
const { startDb, stopDb, clearDb, makeApp, makeAgent, signup } = require('./helpers');

before(startDb);
after(stopDb);
beforeEach(clearDb);

const b64 = (n, fill = 1) => Buffer.alloc(n, fill).toString('base64');
const entry = (fill = 1) => ({ ciphertext: b64(40, fill), iv: b64(12) });

async function signedIn(overrides) {
  const app = makeApp(overrides);
  const agent = makeAgent(app);
  const user = await signup(agent);
  return { app, agent, user };
}

test('create, list, update and delete an entry', async () => {
  const { agent } = await signedIn();
  const created = await agent.post('/api/secrets').send(entry(1));
  assert.equal(created.status, 201);
  assert.equal(created.body.v, 2);
  assert.equal(created.body.userId, undefined);

  const updated = await agent.put(`/api/secrets/${created.body._id}`).send(entry(2));
  assert.equal(updated.status, 200);
  assert.equal(updated.body.ciphertext, entry(2).ciphertext);

  const list = await agent.get('/api/secrets');
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].ciphertext, entry(2).ciphertext);

  assert.equal((await agent.delete(`/api/secrets/${created.body._id}`)).status, 200);
  assert.equal((await agent.get('/api/secrets')).body.length, 0);
});

test('list is newest first', async () => {
  const { agent } = await signedIn();
  const first = await agent.post('/api/secrets').send(entry(1));
  const second = await agent.post('/api/secrets').send(entry(2));
  const list = await agent.get('/api/secrets');
  assert.deepEqual(list.body.map(s => s._id), [second.body._id, first.body._id]);
});

test('users cannot see or touch each other\'s entries', async () => {
  const { app, agent: alice } = await signedIn();
  const bob = makeAgent(app);
  await signup(bob, 'bob@example.com');
  const secret = await alice.post('/api/secrets').send(entry());

  assert.equal((await bob.get('/api/secrets')).body.length, 0);
  assert.equal((await bob.put(`/api/secrets/${secret.body._id}`).send(entry(3))).status, 404);
  assert.equal((await bob.delete(`/api/secrets/${secret.body._id}`)).status, 404);
  assert.equal((await alice.get('/api/secrets')).body[0].ciphertext, entry().ciphertext);
});

test('updating a legacy entry removes its plaintext fields', async () => {
  const { agent, user } = await signedIn();
  const legacy = await Secret.create({
    userId: user.id, site: 'https://a.com', username: 'me', ciphertext: 'U2FsdGVk', iv: 'ab', salt: 'cd',
  });
  const listed = (await agent.get('/api/secrets')).body[0];
  assert.equal(listed.site, 'https://a.com');
  assert.equal(listed.v, undefined);

  await agent.put(`/api/secrets/${legacy._id}`).send(entry());
  const doc = await Secret.findById(legacy._id).lean();
  assert.equal(doc.v, 2);
  assert.equal(doc.site, undefined);
  assert.equal(doc.username, undefined);
  assert.equal(doc.salt, undefined);
});

test('plaintext and malformed fields are rejected', async () => {
  const { agent } = await signedIn();
  assert.equal((await agent.post('/api/secrets').send({ ...entry(), site: 'https://a.com' })).status, 400);
  assert.equal((await agent.post('/api/secrets').send({ ...entry(), iv: b64(16) })).status, 400);
  assert.equal((await agent.post('/api/secrets').send({ ...entry(), ciphertext: 'A'.repeat(16385) })).status, 400);
  assert.equal((await agent.post('/api/secrets').send({ ...entry(), ciphertext: 'not base64!' })).status, 400);
});

test('a malformed id is a 404 and the server keeps serving', async () => {
  const { agent } = await signedIn();
  const res = await agent.put('/api/secrets/not-an-id').send(entry());
  assert.equal(res.status, 404);
  assert.equal((await agent.delete(`/api/secrets/${new mongoose.Types.ObjectId()}`)).status, 404);
  assert.equal((await agent.get('/api/health')).status, 200);
});

test('oversized body is a JSON 413', async () => {
  const { agent } = await signedIn();
  const res = await agent.post('/api/secrets').send({ ciphertext: 'A'.repeat(70 * 1024), iv: b64(12) });
  assert.equal(res.status, 413);
  assert.equal(typeof res.body.error, 'string');
});

test('entry count is capped per user', async () => {
  const { agent } = await signedIn({ maxEntries: 2 });
  await agent.post('/api/secrets').send(entry(1));
  await agent.post('/api/secrets').send(entry(2));
  const third = await agent.post('/api/secrets').send(entry(3));
  assert.equal(third.status, 409);
  assert.deepEqual(third.body, { error: 'Entry limit reached' });
});
