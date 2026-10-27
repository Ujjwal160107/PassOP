const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const User = require('../models/User');
const { findOrCreateGoogleUser } = require('../auth/google');
const { startDb, stopDb, clearDb, makeApp, FRONTEND } = require('./helpers');

before(startDb);
after(stopDb);
beforeEach(clearDb);

const googleApp = () => makeApp({ google: { id: 'client-id', secret: 'client-secret' } });
const profile = (overrides = {}) => ({
  id: 'g-123',
  emails: [{ value: 'g@example.com', verified: true }],
  ...overrides,
});

test('creates a user for a new verified Google account', async () => {
  const user = await findOrCreateGoogleUser(profile());
  assert.equal(user.email, 'g@example.com');
  assert.equal(user.oauth.providerId, 'g-123');
});

test('refuses to link Google into an existing password account (pre-hijack defence)', async () => {
  await User.create({ email: 'g@example.com', passwordHash: 'attacker-chosen' });
  await assert.rejects(findOrCreateGoogleUser(profile()), /already has a password/);
  const user = await User.findOne({ email: 'g@example.com' });
  assert.equal(user.oauth?.providerId, undefined);
});

test('links a verified Google email to an existing account without a password', async () => {
  const existing = await User.create({ email: 'g@example.com' });
  const user = await findOrCreateGoogleUser(profile());
  assert.equal(String(user._id), String(existing._id));
  assert.equal(user.oauth.providerId, 'g-123');
});

test('refuses to link an unverified Google email to an existing account', async () => {
  await User.create({ email: 'g@example.com', passwordHash: 'x' });
  await assert.rejects(
    findOrCreateGoogleUser(profile({ emails: [{ value: 'g@example.com', verified: false }] })),
    /not verified/,
  );
});

test('reuses the account found by Google id', async () => {
  const first = await findOrCreateGoogleUser(profile());
  const again = await findOrCreateGoogleUser(profile({ emails: [{ value: 'changed@example.com', verified: true }] }));
  assert.equal(String(again._id), String(first._id));
});

test('/auth/google redirects with a state that matches the state cookie', async () => {
  const res = await request(googleApp()).get('/auth/google');
  assert.equal(res.status, 302);
  const location = new URL(res.headers.location);
  assert.equal(location.hostname, 'accounts.google.com');
  const cookie = res.headers['set-cookie'].find(c => c.startsWith('oauth_state='));
  assert.ok(cookie, 'state cookie set');
  assert.match(cookie, /HttpOnly/);
  assert.equal(cookie.split(';')[0].split('=')[1], location.searchParams.get('state'));
});

test('callback with a mismatched state redirects to the failure page', async () => {
  const res = await request(googleApp())
    .get('/auth/google/callback?code=abc&state=wrong')
    .set('Cookie', 'oauth_state=right');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, `${FRONTEND}/?auth=fail`);
});

test('Google routes are absent when Google is not configured', async () => {
  const res = await request(makeApp()).get('/auth/google');
  assert.equal(res.status, 404);
});
