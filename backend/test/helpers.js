process.env.MONGOMS_DISTRO ??= 'ubuntu-22.04';

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../app');

const FRONTEND = 'http://app.test';
let mongod;

async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function stopDb() {
  await mongoose.disconnect();
  await mongod?.stop();
}

async function clearDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map(c => c.deleteMany({})));
}

function testConfig(overrides = {}) {
  return {
    mongoUri: 'unused',
    jwtSecret: 'x'.repeat(40),
    frontendUrl: FRONTEND,
    apiBaseUrl: 'http://api.test',
    google: null,
    isProduction: false,
    port: 0,
    authLimit: 1000,
    maxEntries: 1000,
    ...overrides,
  };
}

function makeApp(overrides) {
  return createApp(testConfig(overrides));
}

// supertest agent that keeps cookies and always sends the trusted Origin
function makeAgent(app) {
  const agent = request.agent(app);
  for (const method of ['get', 'post', 'put', 'delete']) {
    const original = agent[method].bind(agent);
    agent[method] = (...args) => original(...args).set('Origin', FRONTEND);
  }
  return agent;
}

async function signup(agent, email = 'user@example.com', password = 'correct horse battery') {
  const res = await agent.post('/api/auth/signup').send({ email, password });
  if (res.status !== 200) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.user;
}

module.exports = { FRONTEND, startDb, stopDb, clearDb, testConfig, makeApp, makeAgent, signup };
