// Lets async route handlers throw: Express 4 then sends the error to the error handler.
require('express-async-errors');

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const { setup } = require('./db/setup');
const { ApiError, errors } = require('./lib/errors');
const rateLimit = require('./middleware/rateLimit');
const { requireApiKey, requireSession, requireAdmin } = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1); // Render sits in front of the app
app.disable('x-powered-by');

app.use(cors({
  origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()),
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-admin-secret'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '10kb' }));

const v1 = express.Router();

v1.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

v1.use(rateLimit);
v1.use('/admin', requireAdmin, require('./routes/admin'));
v1.use('/auth', require('./routes/auth'));
v1.use(requireApiKey, requireSession);
v1.use('/contacts', require('./routes/contacts'));
v1.use('/', require('./routes/wallet'));

app.use('/v1', v1);

// Swagger docs: interactive at /docs, raw spec at /openapi.json
const openapi = YAML.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8'));
app.get('/openapi.json', (req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, {
  customSiteTitle: 'KolaPay API docs',
  swaggerOptions: { persistAuthorization: true, tryItOutEnabled: true },
}));

app.get('/', (req, res) => res.json({ name: 'KolaPay API', docs: '/docs', health: '/v1/health' }));

app.use((req, res, next) => next(errors.notFound(`${req.method} ${req.path}`)));

// One error shape for everything: { error: { code, message, details } }
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    err = errors.validation('body', 'The request body is not valid JSON. Use JSON.stringify().');
  } else if (err.type === 'entity.too.large') {
    err = errors.validation('body', 'The request body is too large.');
  } else if (!(err instanceof ApiError)) {
    console.error(err);
    err = new ApiError(500, 'SERVER_ERROR', 'Something went wrong on our side. Try again.');
  }
  const body = { code: err.code, message: err.message };
  if (err.details) body.details = err.details;
  res.status(err.status).json({ error: body });
});

setup()
  .then(() => app.listen(config.port, () => console.log(`KolaPay API listening on port ${config.port}`)))
  .catch((err) => {
    console.error('Could not set up the database:', err.message);
    process.exit(1);
  });

module.exports = app;
