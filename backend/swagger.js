const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Expense Tracker API',
      version: '1.0.0',
      description:
        'Personal finance tracker backend — bank sync (Teller), transactions, budgets, ' +
        'rules, custom categories, and LLM-assisted auto-categorization.\n\n' +
        'All `/api/*` routes except `/api/health` require an `x-api-key` header. ' +
        'Use the **Authorize** button below to set it once for all requests on this page.',
    },
    servers: [
      { url: 'http://localhost:3002', description: 'Local backend' },
    ],
    tags: [
      { name: 'Health', description: 'Unauthenticated liveness check' },
      { name: 'Teller', description: 'Bank account enrollment and sync via Teller (shut down — retained for historical accounts)' },
      { name: 'Plaid', description: 'Bank account linking and sync via Plaid' },
      { name: 'Settings', description: 'App-wide settings' },
      { name: 'Accounts', description: 'Account management (rename, etc.), independent of provider' },
      { name: 'Transactions', description: 'Transaction queries, breakdowns, and categorization' },
      { name: 'Rules', description: 'Auto-categorization rules applied on sync' },
      { name: 'Budgets', description: 'Monthly budgets per category' },
      { name: 'Categories', description: 'Custom category names' },
      { name: 'LLM', description: 'LLM-assisted merchant categorization suggestions' },
    ],
    components: {
      securitySchemes: {
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
        },
      },
      parameters: {
        StartDate: {
          name: 'start_date', in: 'query',
          schema: { type: 'string', format: 'date', example: '2026-01-01' },
          description: 'Inclusive start date (YYYY-MM-DD)',
        },
        EndDate: {
          name: 'end_date', in: 'query',
          schema: { type: 'string', format: 'date', example: '2026-01-31' },
          description: 'Inclusive end date (YYYY-MM-DD)',
        },
      },
    },
    security: [{ apiKeyAuth: [] }],
  },
  apis: ['./server.js', './routes/*.js'],
};

module.exports = swaggerJsdoc(options);
