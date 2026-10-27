const fs = require('fs');
const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { openApiSpec } = require('../docs/openapi');

const THEME = fs.readFileSync(path.join(__dirname, '../docs/theme.css'), 'utf8');

function docsRoutes(config) {
  const spec = openApiSpec(config);
  const router = express.Router();

  // serveFiles builds the init script and setup builds the page, so both need the options.
  const options = {
    customSiteTitle: 'PassOP API',
    customCss: THEME,
    swaggerOptions: {
      // Writes need the frontend's Origin, so they would only ever 403 from this page.
      supportedSubmitMethods: ['get'],
      validatorUrl: null,
      docExpansion: 'list',
      defaultModelsExpandDepth: 0,
      displayRequestDuration: true,
      withCredentials: true,
    },
  };

  router.get('/openapi.json', (req, res) => res.json(spec));
  router.use('/', swaggerUi.serveFiles(spec, options), swaggerUi.setup(spec, options));

  return router;
}

module.exports = docsRoutes;
