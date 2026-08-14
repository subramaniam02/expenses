require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const requireApiKey = require('./middleware/auth');
const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:5175')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin && process.env.NODE_ENV !== 'production') return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
}));

app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}));

app.use('/api/teller/sync', rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sync requests, please wait before trying again' },
}));

app.use('/api/plaid/sync', rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sync requests, please wait before trying again' },
}));

// ── Public routes (no auth) ───────────────────────────────────────────────────

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness check
 *     security: []
 *     responses:
 *       200:
 *         description: Service is up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 */
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// API docs — unauthenticated (Swagger UI's "Try it out" still requires the x-api-key
// header per-request via the Authorize button, since every documented route besides
// /api/health carries `security: [{ apiKeyAuth: [] }]`).
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
app.use('/api-docs', (req, res, next) => { res.removeHeader('Content-Security-Policy'); next(); }, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Auth (all other /api/* routes) ───────────────────────────────────────────
app.use('/api/', requireApiKey);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/api/teller', require('./routes/teller'));
app.use('/api/plaid', require('./routes/plaid'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/rules', require('./routes/rules'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/llm', require('./routes/llm'));

// ── Start ─────────────────────────────────────────────────────────────────────
const { startScheduler } = require('./sync');
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Expense Tracker backend running on port ${PORT}`);
  startScheduler();
});
