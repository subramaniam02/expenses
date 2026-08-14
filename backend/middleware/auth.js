const API_KEY = process.env.API_KEY;

module.exports = function requireApiKey(req, res, next) {
  // If no API_KEY configured, block all requests to force explicit setup
  if (!API_KEY) {
    return res.status(503).json({ error: 'Server not configured: API_KEY missing' });
  }

  const provided = req.headers['x-api-key'];
  if (!provided || provided !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};
