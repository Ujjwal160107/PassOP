const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { startDb, stopDb, clearDb, makeApp, makeAgent, signup, testConfig, FRONTEND } = require('./helpers');

before(startDb);
after(stopDb);
beforeEach(clearDb);

const PASSWORD = 'correct horse battery';

test('signup returns the user and an httpOnly session cookie', async () => {
  const res = await makeAgent(makeApp()).post('/api/auth/signup').send({ email: 'a@example.com', password: PASSWORD });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body.user).sort(), ['email', 'id']);
  assert.match(res.headers['set-cookie'].join(';'), /token=.+HttpOnly/);
});

test('email is case and whitespace insensitive', async () => {
  const app = makeApp();
  await signup(makeAgent(app), 'Bob@X.com', PASSWORD);
  const login = await makeAgent(app).post('/api/auth/login').send({ email: ' bob@x.com ', password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.email, 'bob@x.com');
  const dup = await makeAgent(app).post('/api/auth/signup').send({ email: 'BOB@x.com', password: PASSWORD });
  assert.equal(dup.status, 409);
});

test('operator objects in email are rejected', async () => {
  const app = makeApp();
  await signup(makeAgent(app));
  const res = await makeAgent(app).post('/api/auth/login').send({ email: { $ne: null }, password: 'x' });
  assert.equal(res.status, 400);
});

test('password must be 8 to 72 bytes', async () => {
  const agent = makeAgent(makeApp());
  const short = await agent.post('/api/auth/signup').send({ email: 'a@example.com', password: '1234567' });
  assert.equal(short.status, 400);
  const long = await agent.post('/api/auth/signup').send({ email: 'a@example.com', password: 'é'.repeat(37) });
  assert.equal(long.status, 400);
});

test('wrong password and unknown email give the same 401', async () => {
  const app = makeApp();
  await signup(makeAgent(app));
  const wrong = await makeAgent(app).post('/api/auth/login').send({ email: 'user@example.com', password: 'wrong password' });
  const unknown = await makeAgent(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: PASSWORD });
  assert.equal(wrong.status, 401);
  assert.deepEqual(unknown.body, wrong.body);
  assert.deepEqual(wrong.body, { error: 'Invalid credentials' });
});

test('state-changing requests need the frontend Origin', async () => {
  const app = makeApp();
  const body = { email: 'a@example.com', password: PASSWORD };
  const none = await request(app).post('/api/auth/signup').send(body);
  assert.equal(none.status, 403);
  const evil = await request(app).post('/api/auth/signup').set('Origin', 'http://evil.test').send(body);
  assert.equal(evil.status, 403);
  const good = await request(app).post('/api/auth/signup').set('Origin', FRONTEND).send(body);
  assert.equal(good.status, 200);
});

test('bearer header is not accepted as a session', async () => {
  const app = makeApp();
  const user = await signup(makeAgent(app));
  const token = jwt.sign({ sub: user.id }, testConfig().jwtSecret, { expiresIn: '1h' });
  const res = await request(app).get('/api/auth/session').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 401);
});

test('token signed with another algorithm is rejected', async () => {
  const app = makeApp();
  const user = await signup(makeAgent(app));
  const token = jwt.sign({ sub: user.id }, testConfig().jwtSecret, { algorithm: 'HS512', expiresIn: '1h' });
  const res = await request(app).get('/api/auth/session').set('Cookie', `token=${token}`);
  assert.equal(res.status, 401);
});

test('login is rate limited per IP', async () => {
  const app = makeApp({ authLimit: 2 });
  const body = { email: 'a@example.com', password: PASSWORD };
  await makeAgent(app).post('/api/auth/login').send(body);
  await makeAgent(app).post('/api/auth/login').send(body);
  const third = await makeAgent(app).post('/api/auth/login').send(body);
  assert.equal(third.status, 429);
});

test('logout ends the session', async () => {
  const agent = makeAgent(makeApp());
  await signup(agent);
  assert.equal((await agent.get('/api/auth/session')).status, 200);
  assert.equal((await agent.post('/api/auth/logout')).status, 200);
  assert.equal((await agent.get('/api/auth/session')).status, 401);
});
