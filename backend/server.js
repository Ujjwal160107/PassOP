require('dotenv').config();
const mongoose = require('mongoose');
const { loadConfig } = require('./config');
const { createApp } = require('./app');

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

mongoose.connect(config.mongoUri)
  .then(() => {
    createApp(config).listen(config.port, () => console.log(`API listening on port ${config.port}`));
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
