const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { FRONTEND, makeApp } = require('./helpers');

const ROUTES = [
  'get /api/health',
  'post /api/auth/signup',
  'post /api/auth/login',
  'post /api/auth/logout',
  'get /api/auth/session',
  'get /api/vault',
  'post /api/vault',
  'get /api/secrets',
  'post /api/secrets',
  'put /api/secrets/{id}',
  'delete /api/secrets/{id}',
  'get /auth/google',
  'get /auth/google/callback',
];

const googleApp = () => makeApp({ google: { id: 'client-id', secret: 'client-secret' } });

async function spec(app = googleApp()) {
  const res = await request(app).get('/docs/openapi.json');
  assert.equal(res.status, 200);
  return res.body;
}

test('docs page is served with security headers', async () => {
  const res = await request(makeApp()).get('/docs/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.text, /swagger-ui/);
  assert.ok(res.headers['content-security-policy']);
});

test('docs assets load from the API itself', async () => {
  const res = await request(makeApp()).get('/docs/swagger-ui-bundle.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /javascript/);
});

test('docs only offer Try it out for GET requests', async () => {
  const res = await request(makeApp()).get('/docs/swagger-ui-init.js');
  assert.equal(res.status, 200);
  assert.match(res.text, /"supportedSubmitMethods":\s*\[\s*"get"\s*\]/);
});

test('spec lists exactly the API routes', async () => {
  const { paths } = await spec();
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  const documented = Object.entries(paths)
    .flatMap(([path, item]) => Object.keys(item).filter(k => methods.has(k)).map(m => `${m} ${path}`));
  assert.deepEqual(documented.sort(), [...ROUTES].sort());
});

test('spec targets the configured API URL', async () => {
  const body = await spec(makeApp({ apiBaseUrl: 'https://api.example.com' }));
  assert.match(body.openapi, /^3\./);
  assert.equal(body.servers[0].url, 'https://api.example.com');
});

test('every documented route exists in the app', async () => {
  const app = googleApp();
  for (const route of ROUTES) {
    const [method, path] = route.split(' ');
    const res = await request(app)[method](path.replace('{id}', '507f1f77bcf86cd799439011')).set('Origin', FRONTEND);
    assert.notEqual(res.status, 404, `${route} is documented but not routed`);
  }
});
