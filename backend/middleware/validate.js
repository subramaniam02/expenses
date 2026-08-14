const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_PERIODS = ['month', 'week'];

function validateDates(req, res, next) {
  const { start_date, end_date } = req.query;

  if (start_date && !DATE_RE.test(start_date)) {
    return res.status(400).json({ error: 'Invalid start_date — use YYYY-MM-DD' });
  }
  if (end_date && !DATE_RE.test(end_date)) {
    return res.status(400).json({ error: 'Invalid end_date — use YYYY-MM-DD' });
  }
  if (start_date && end_date && start_date > end_date) {
    return res.status(400).json({ error: 'start_date must be before end_date' });
  }

  next();
}

function validatePeriod(req, res, next) {
  const { period } = req.query;
  if (period && !VALID_PERIODS.includes(period)) {
    return res.status(400).json({ error: `Invalid period — must be one of: ${VALID_PERIODS.join(', ')}` });
  }
  next();
}

module.exports = { validateDates, validatePeriod };
