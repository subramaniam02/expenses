const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');

const config = new Configuration({
  basePath: PlaidEnvironments[(process.env.PLAID_ENV || 'sandbox').toLowerCase()],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

module.exports = new PlaidApi(config);
