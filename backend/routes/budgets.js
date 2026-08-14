const express = require('express');
const router = express.Router();
const { db, normalizeCategory, ensureCategoryExists } = require('../db');

function currentMonthBounds() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const start = `${year}-${month}-01`;
  // Last day of month
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  const daysInMonth = lastDay;
  const daysElapsed = Math.max(now.getDate(), 1);
  return { start, end, daysInMonth, daysElapsed };
}

/**
 * @openapi
 * /api/budgets:
 *   get:
 *     tags: [Budgets]
 *     summary: List budgets with current-month spend and pace
 *     description: Each budget is annotated with current_spend, velocity_projected (pace-adjusted month-end estimate), and pct_used for the current calendar month.
 *     responses:
 *       200: { description: Array of budgets }
 *       500: { description: Failed to fetch budgets }
 */
router.get('/', (req, res) => {
  try {
    const budgets = db.prepare('SELECT * FROM budgets ORDER BY category ASC').all();
    const { start, end, daysInMonth, daysElapsed } = currentMonthBounds();

    const spendRows = db.prepare(`
      SELECT personal_finance_category as category, COALESCE(SUM(amount), 0) as spend
      FROM visible_transactions
      WHERE amount > 0 AND pending = 0 AND date >= ? AND date <= ?
      GROUP BY personal_finance_category
    `).all(start, end);
    const spendMap = Object.fromEntries(spendRows.map(r => [r.category, r.spend]));

    const result = budgets.map(b => {
      const spend = spendMap[b.category] || 0;
      const velocity_projected = (spend / daysElapsed) * daysInMonth;
      const pct = b.amount > 0 ? spend / b.amount : 0;
      return {
        ...b,
        current_spend: spend,
        velocity_projected,
        pct_used: pct,
        days_elapsed: daysElapsed,
        days_in_month: daysInMonth,
        period_start: start,
        period_end: end,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('GET /budgets error:', err.message);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

/**
 * @openapi
 * /api/budgets/suggestions:
 *   get:
 *     tags: [Budgets]
 *     summary: Suggest budget amounts from average monthly spend (last 3 months)
 *     responses:
 *       200: { description: "Array of { category, suggested_monthly }" }
 *       500: { description: Failed to fetch budget suggestions }
 */
router.get('/suggestions', (req, res) => {
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const since = threeMonthsAgo.toISOString().split('T')[0];

    const rows = db.prepare(`
      SELECT
        personal_finance_category as category,
        ROUND(SUM(amount) / 3.0, 2) as suggested_monthly
      FROM visible_transactions
      WHERE amount > 0 AND pending = 0
        AND date >= ?
        AND personal_finance_category IS NOT NULL
      GROUP BY personal_finance_category
      ORDER BY suggested_monthly DESC
    `).all(since);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch budget suggestions' });
  }
});

/**
 * @openapi
 * /api/budgets:
 *   post:
 *     tags: [Budgets]
 *     summary: Create or update (by category) a monthly budget
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, amount]
 *             properties:
 *               category: { type: string }
 *               amount: { type: number, minimum: 0 }
 *     responses:
 *       200: { description: Saved budget }
 *       400: { description: category and a non-negative amount are required }
 *       500: { description: Failed to save budget }
 */
router.post('/', (req, res) => {
  try {
    const { category, amount } = req.body;
    if (!category?.trim() || amount == null || isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: 'category and a non-negative amount are required' });
    }
    const cat = normalizeCategory(category);
    ensureCategoryExists(cat);
    db.prepare(`
      INSERT INTO budgets (category, amount) VALUES (?, ?)
      ON CONFLICT(category) DO UPDATE SET amount = excluded.amount
    `).run(cat, parseFloat(amount));
    res.json({ success: true, category: cat, amount: parseFloat(amount) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save budget' });
  }
});

/**
 * @openapi
 * /api/budgets/{id}:
 *   delete:
 *     tags: [Budgets]
 *     summary: Delete a budget
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Budget not found }
 *       500: { description: Failed to delete budget }
 */
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Budget not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

module.exports = router;
