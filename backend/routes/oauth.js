const express = require('express');
const passport = require('passport');
const { configureGoogle } = require('../auth/google');
const { issueSession } = require('../utils/authUtils');

function oauthRoutes(config) {
  configureGoogle(config);
  const router = express.Router();

  router.get('/google', passport.authenticate('google', {
    session: false,
    scope: ['profile', 'email'],
    prompt: 'select_account',
  }));

  router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${config.frontendUrl}/?auth=fail` }),
    (req, res) => {
      issueSession(res, req.user, config);
      res.redirect(config.frontendUrl);
    },
  );

  return router;
}

module.exports = oauthRoutes;
