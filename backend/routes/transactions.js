const express = require('express');
const router = express.Router();
const { db, normalizeCategory, ensureCategoryExists } = require('../db');
const { validateDates, validatePeriod } = require('../middleware/validate');

function getDateFilter(start_date, end_date) {
  const conditions = [];
  const params = [];
  if (start_date) { conditions.push('t.date >= ?'); params.push(start_date); }
  if (end_date)   { conditions.push('t.date <= ?'); params.push(end_date); }
  return { conditions, params };
}

function safeJsonParse(str, fallback = []) {
  try { return JSON.parse(str); } catch { return fallback; }
}

/**
 * @openapi
 * /api/transactions:
 *   get:
 *     tags: [Transactions]
 *     summary: List raw transactions
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *       - name: account_id
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of transactions, newest first }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to retrieve transactions }
 */
router.get('/', validateDates, (req, res) => {
  try {
    const { start_date, end_date, account_id } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    if (account_id) { conditions.push('t.account_id = ?'); params.push(account_id); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const rows = db.prepare(`
      SELECT t.*, a.name as account_name, a.institution_name
      FROM visible_transactions t
      LEFT JOIN accounts a ON t.account_id = a.account_id
      ${where}
      ORDER BY t.date DESC
    `).all(...params);
    res.json(rows);
  } catch (err) {
    console.error('GET /transactions error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve transactions' });
  }
});

/**
 * @openapi
 * /api/transactions/categories:
 *   get:
 *     tags: [Transactions]
 *     summary: Expense totals grouped by category
 *     description: Only positive, non-pending (posted) amounts are included. Each group carries its own transactions array.
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *     responses:
 *       200: { description: "Array of { category, total, count, transactions } sorted by total desc" }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to retrieve categories }
 */
router.get('/categories', validateDates, (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    conditions.push('t.pending = 0');
    conditions.push('t.amount > 0');
    const where = 'WHERE ' + conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        COALESCE(t.personal_finance_category,
          CASE
            WHEN t.category IS NOT NULL AND t.category != 'null'
            THEN json_extract(t.category, '$[0]')
            ELSE 'Uncategorized'
          END
        ) as category,
        SUM(t.amount) as total,
        COUNT(*) as count,
        json_group_array(
          json_object(
            'id', t.id,
            'transaction_id', t.transaction_id,
            'date', t.date,
            'name', t.name,
            'merchant_name', t.merchant_name,
            'amount', t.amount,
            'account_id', t.account_id,
            'account_name', a.name,
            'institution_name', a.institution_name,
            'personal_finance_category', t.personal_finance_category,
            'payment_channel', t.payment_channel
          )
        ) as transactions
      FROM visible_transactions t
      LEFT JOIN accounts a ON t.account_id = a.account_id
      ${where}
      GROUP BY category
      ORDER BY total DESC
    `).all(...params);

    res.json(rows.map(row => ({ ...row, transactions: safeJsonParse(row.transactions) })));
  } catch (err) {
    console.error('GET /categories error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

/**
 * @openapi
 * /api/transactions/merchants:
 *   get:
 *     tags: [Transactions]
 *     summary: Expense totals grouped by merchant
 *     description: Only positive amounts are included (pending included, unlike /categories). Each group carries its own transactions array.
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *     responses:
 *       200: { description: "Array of { merchant, total, count, transactions } sorted by total desc" }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to retrieve merchants }
 */
router.get('/merchants', validateDates, (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    conditions.push('t.amount > 0');
    const where = 'WHERE ' + conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        COALESCE(NULLIF(t.merchant_name, ''), t.name) as merchant,
        SUM(t.amount) as total,
        COUNT(*) as count,
        json_group_array(
          json_object(
            'id', t.id,
            'transaction_id', t.transaction_id,
            'date', t.date,
            'name', t.name,
            'merchant_name', t.merchant_name,
            'amount', t.amount,
            'account_id', t.account_id,
            'account_name', a.name,
            'institution_name', a.institution_name,
            'personal_finance_category', t.personal_finance_category,
            'category', t.category,
            'payment_channel', t.payment_channel
          )
        ) as transactions
      FROM visible_transactions t
      LEFT JOIN accounts a ON t.account_id = a.account_id
      ${where}
      GROUP BY merchant
      ORDER BY total DESC
    `).all(...params);

    res.json(rows.map(row => ({ ...row, transactions: safeJsonParse(row.transactions) })));
  } catch (err) {
    console.error('GET /merchants error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve merchants' });
  }
});

/**
 * @openapi
 * /api/transactions/top:
 *   get:
 *     tags: [Transactions]
 *     summary: Top 10 largest expense transactions
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *     responses:
 *       200: { description: Array of up to 10 transactions, largest amount first }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to retrieve top transactions }
 */
router.get('/top', validateDates, (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    conditions.push('t.amount > 0');
    const where = 'WHERE ' + conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT t.*, a.name as account_name, a.institution_name
      FROM visible_transactions t
      LEFT JOIN accounts a ON t.account_id = a.account_id
      ${where}
      ORDER BY t.amount DESC
      LIMIT 10
    `).all(...params);

    res.json(rows);
  } catch (err) {
    console.error('GET /top error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve top transactions' });
  }
});

/**
 * @openapi
 * /api/transactions/expenses:
 *   get:
 *     tags: [Transactions]
 *     summary: List expense transactions (positive amounts)
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *     responses:
 *       200: { description: Array of transactions, newest first }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to retrieve expenses }
 */
router.get('/expenses', validateDates, (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    conditions.push('t.amount > 0');
    const where = 'WHERE ' + conditions.join(' AND ');
    const rows = db.prepare(`
      SELECT t.*, a.name as account_name, a.institution_name
      FROM visible_transactions t
      LEFT JOIN accounts a ON t.account_id = a.account_id
      ${where}
      ORDER BY t.date DESC
    `).all(...params);
    res.json(rows);
  } catch (err) {
    console.error('GET /expenses error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve expenses' });
  }
});

/**
 * @openapi
 * /api/transactions/income:
 *   get:
 *     tags: [Transactions]
 *     summary: List income transactions (negative amounts, excluding credit-card payments)
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *     responses:
 *       200: { description: Array of transactions, newest first }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to retrieve income }
 */
router.get('/income', validateDates, (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    conditions.push('t.amount < 0');
    conditions.push("a.type != 'credit'"); // credit card payments are transfers, not income
    const where = 'WHERE ' + conditions.join(' AND ');
    const rows = db.prepare(`
      SELECT t.*, a.name as account_name, a.institution_name
      FROM visible_transactions t
      LEFT JOIN accounts a ON t.account_id = a.account_id
      ${where}
      ORDER BY t.date DESC
    `).all(...params);
    res.json(rows);
  } catch (err) {
    console.error('GET /income error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve income' });
  }
});

/**
 * @openapi
 * /api/transactions/refunds:
 *   get:
 *     tags: [Transactions]
 *     summary: List refund/credit transactions (negative amounts)
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *     responses:
 *       200: { description: Array of transactions, newest first }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to retrieve refunds }
 */
router.get('/refunds', validateDates, (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    conditions.push('t.amount < 0');
    const where = 'WHERE ' + conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT t.*, a.name as account_name, a.institution_name
      FROM visible_transactions t
      LEFT JOIN accounts a ON t.account_id = a.account_id
      ${where}
      ORDER BY t.date DESC
    `).all(...params);

    res.json(rows);
  } catch (err) {
    console.error('GET /refunds error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve refunds' });
  }
});

/**
 * @openapi
 * /api/transactions/import/qfx:
 *   post:
 *     tags: [Transactions]
 *     summary: Import transactions from a QFX/OFX file
 *     description: Skips transactions on/after the earliest existing Teller-synced date for the account (to avoid overlap), and de-dupes by FITID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content, account_id]
 *             properties:
 *               content: { type: string, description: Raw QFX/OFX file contents }
 *               account_id: { type: string }
 *     responses:
 *       200:
 *         description: Import summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imported: { type: integer }
 *                 skipped_overlap: { type: integer }
 *                 skipped_duplicate: { type: integer }
 *                 total_in_file: { type: integer }
 *                 cutoff_date: { type: string, nullable: true }
 *       400: { description: content and account_id are required, or account not found }
 *       500: { description: Failed to import QFX file }
 */
router.post('/import/qfx', (req, res) => {
  try {
    const { content, account_id } = req.body;
    if (!content || !account_id) {
      return res.status(400).json({ error: 'content and account_id are required' });
    }

    const account = db.prepare('SELECT * FROM accounts WHERE account_id = ?').get(account_id);
    if (!account) return res.status(400).json({ error: 'Account not found' });

    // Cutoff: earliest existing Teller transaction for this account
    const earliest = db.prepare(
      "SELECT MIN(date) as min_date FROM transactions WHERE account_id = ? AND transaction_id NOT LIKE 'qfx_%'"
    ).get(account_id);
    const cutoffDate = earliest?.min_date || null;

    // Parse QFX/OFX — handles both SGML (no closing leaf tags) and XML formats
    function getField(block, name) {
      const m = block.match(new RegExp(`<${name}>([^<\\n\\r]+)`, 'i'));
      return m ? m[1].trim() : null;
    }

    const parts = content.split(/<STMTTRN>/i);
    const parsed = [];
    for (let i = 1; i < parts.length; i++) {
      const block = parts[i].split(/<\/STMTTRN>/i)[0];
      const fitid   = getField(block, 'FITID');
      const dtpost  = getField(block, 'DTPOSTED');
      const trnamt  = getField(block, 'TRNAMT');
      const name    = getField(block, 'NAME');
      const memo    = getField(block, 'MEMO');
      if (!fitid || !dtpost || !trnamt) continue;

      // Date: YYYYMMDDHHMMSS[.xxx][TZ] → YYYY-MM-DD
      const ds = dtpost.replace(/[^0-9]/g, '').substring(0, 8);
      const date = `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`;

      // QFX amounts: negative = debit/charge, positive = credit/payment
      // Our DB convention: expenses positive, income negative → negate QFX amount
      const amount = -(parseFloat(trnamt));
      const desc = name || memo || 'Unknown';
      parsed.push({ fitid, date, amount, desc });
    }

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO transactions
        (transaction_id, account_id, amount, date, name, merchant_name, personal_finance_category, pending)
      VALUES (?, ?, ?, ?, ?, ?, null, 0)
    `);

    let imported = 0, skippedDate = 0, skippedDupe = 0;
    for (const tx of parsed) {
      if (cutoffDate && tx.date >= cutoffDate) { skippedDate++; continue; }
      const info = stmt.run(`qfx_${tx.fitid}`, account_id, tx.amount, tx.date, tx.desc, tx.desc);
      info.changes > 0 ? imported++ : skippedDupe++;
    }

    res.json({
      imported,
      skipped_overlap: skippedDate,
      skipped_duplicate: skippedDupe,
      total_in_file: parsed.length,
      cutoff_date: cutoffDate,
    });
  } catch (err) {
    console.error('QFX import error:', err.message);
    res.status(500).json({ error: 'Failed to import QFX file' });
  }
});

/**
 * @openapi
 * /api/transactions/bulk-categorize:
 *   post:
 *     tags: [Transactions]
 *     summary: Set the category for multiple transactions at once
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [transaction_ids]
 *             properties:
 *               transaction_ids: { type: array, items: { type: string }, minItems: 1 }
 *               category: { type: string, nullable: true, description: Pass null to clear the category }
 *     responses:
 *       200: { description: '{ updated, category }' }
 *       400: { description: Invalid transaction_ids or category }
 *       500: { description: Failed to bulk-update categories }
 */
router.post('/bulk-categorize', (req, res) => {
  try {
    const { transaction_ids, category } = req.body;
    if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ error: 'transaction_ids must be a non-empty array' });
    }
    if (typeof category !== 'string' && category !== null) {
      return res.status(400).json({ error: 'category must be a string or null' });
    }
    const cat = normalizeCategory(category);
    ensureCategoryExists(cat);
    const placeholders = transaction_ids.map(() => '?').join(',');
    const info = db.prepare(`
      UPDATE transactions
      SET personal_finance_category = ?,
          category = ?,
          manually_categorized = ?
      WHERE transaction_id IN (${placeholders})
    `).run(cat, cat ? JSON.stringify([cat]) : null, cat ? 1 : 0, ...transaction_ids);
    res.json({ updated: info.changes, category: cat });
  } catch (err) {
    console.error('POST /bulk-categorize error:', err.message);
    res.status(500).json({ error: 'Failed to bulk-update categories' });
  }
});

/**
 * @openapi
 * /api/transactions/uncategorized:
 *   get:
 *     tags: [Transactions]
 *     summary: List merchants with uncategorized, posted expense transactions
 *     responses:
 *       200: { description: "Array of { merchant, count, total, last_date } sorted by count desc" }
 *       500: { description: Failed to retrieve uncategorized transactions }
 */
router.get('/uncategorized', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        COALESCE(NULLIF(t.merchant_name, ''), t.name) as merchant,
        COUNT(*)        as count,
        SUM(t.amount)   as total,
        MAX(t.date)     as last_date
      FROM visible_transactions t
      WHERE (t.personal_finance_category IS NULL OR t.personal_finance_category = '')
        AND t.amount > 0
        AND t.pending = 0
      GROUP BY merchant
      ORDER BY count DESC
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('GET /uncategorized error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve uncategorized transactions' });
  }
});

/**
 * @openapi
 * /api/transactions/{transaction_id}/category:
 *   patch:
 *     tags: [Transactions]
 *     summary: Set the category for a single transaction
 *     parameters:
 *       - name: transaction_id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category: { type: string, nullable: true, description: Pass null to clear the category }
 *     responses:
 *       200: { description: '{ success, transaction_id, category }' }
 *       400: { description: category must be a string or null }
 *       500: { description: Failed to update category }
 */
router.patch('/:transaction_id/category', (req, res) => {
  try {
    const { transaction_id } = req.params;
    const { category } = req.body;
    if (typeof category !== 'string' && category !== null) {
      return res.status(400).json({ error: 'category must be a string or null' });
    }
    const cat = normalizeCategory(category);
    ensureCategoryExists(cat);
    db.prepare(`
      UPDATE transactions
      SET personal_finance_category = ?,
          category = ?,
          manually_categorized = ?
      WHERE transaction_id = ?
    `).run(cat, cat ? JSON.stringify([cat]) : null, cat ? 1 : 0, transaction_id);
    res.json({ success: true, transaction_id, category: cat });
  } catch (err) {
    console.error('PATCH /category error:', err.message);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

/**
 * @openapi
 * /api/transactions/summary:
 *   get:
 *     tags: [Transactions]
 *     summary: Income/expense/net/refund totals plus linked account balances
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *     responses:
 *       200:
 *         description: Summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_income: { type: number }
 *                 total_expenses: { type: number }
 *                 total_refunds: { type: number }
 *                 refund_count: { type: integer }
 *                 net: { type: number }
 *                 transaction_count: { type: integer }
 *                 accounts: { type: array, items: { type: object } }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to retrieve summary }
 */
router.get('/summary', validateDates, (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    const baseWhere = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const incomeRow = db.prepare(`
      SELECT COALESCE(ABS(SUM(amount)), 0) as total FROM visible_transactions t
      ${baseWhere ? baseWhere + ' AND' : 'WHERE'} amount < 0
    `).get(...params);

    const expensesRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM visible_transactions t
      ${baseWhere ? baseWhere + ' AND' : 'WHERE'} amount > 0
    `).get(...params);

    const refundsRow = db.prepare(`
      SELECT COALESCE(ABS(SUM(amount)), 0) as total, COUNT(*) as count FROM visible_transactions t
      ${baseWhere ? baseWhere + ' AND' : 'WHERE'} amount < 0
    `).get(...params);

    const countRow = db.prepare(`
      SELECT COUNT(*) as total FROM visible_transactions t ${baseWhere}
    `).get(...params);

    const accounts = db.prepare(`
      SELECT name, balance_current, balance_available, type, subtype, institution_name
      FROM visible_accounts
      WHERE hidden = 0
    `).all();

    const totalIncome = incomeRow.total || 0;
    const totalExpenses = expensesRow.total || 0;

    res.json({
      total_income: totalIncome,
      total_expenses: totalExpenses,
      total_refunds: refundsRow.total || 0,
      refund_count: refundsRow.count || 0,
      net: totalIncome - totalExpenses,
      transaction_count: countRow.total || 0,
      accounts,
    });
  } catch (err) {
    console.error('GET /summary error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve summary' });
  }
});

/**
 * @openapi
 * /api/transactions/by-period:
 *   get:
 *     tags: [Transactions]
 *     summary: Income/expense/net totals bucketed by week or month
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *       - name: period
 *         in: query
 *         schema: { type: string, enum: [month, week], default: month }
 *     responses:
 *       200: { description: "Array of { period_label, income, expenses, net } ascending by period" }
 *       400: { description: Invalid start_date/end_date/period }
 *       500: { description: Failed to retrieve period data }
 */
router.get('/by-period', validateDates, validatePeriod, (req, res) => {
  try {
    const { start_date, end_date, period = 'month' } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    const baseWhere = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const periodExpr = period === 'week'
      ? "strftime('%Y-W%W', t.date)"
      : "strftime('%Y-%m', t.date)";

    const rows = db.prepare(`
      SELECT
        ${periodExpr} as period_label,
        COALESCE(ABS(SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)), 0) as income,
        COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) as expenses,
        COALESCE(ABS(SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)), 0) -
        COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) as net
      FROM visible_transactions t
      ${baseWhere}
      GROUP BY period_label
      ORDER BY period_label ASC
    `).all(...params);

    res.json(rows);
  } catch (err) {
    console.error('GET /by-period error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve period data' });
  }
});

// ── Recurring detection helper ────────────────────────────────────────────────
function detectRecurring() {
  const rows = db.prepare(`
    SELECT
      COALESCE(NULLIF(t.merchant_name,''), t.name) as merchant,
      t.personal_finance_category as category,
      t.amount, t.date, t.transaction_id, t.account_id,
      a.name as account_name, a.institution_name
    FROM visible_transactions t
    LEFT JOIN accounts a ON t.account_id = a.account_id
    WHERE t.amount > 0 AND t.pending = 0
      AND t.date >= date('now', '-24 months')
    ORDER BY merchant, t.date ASC
  `).all();

  const groups = {};
  for (const r of rows) {
    if (!groups[r.merchant]) groups[r.merchant] = [];
    groups[r.merchant].push(r);
  }

  const recurring = [];
  const today = new Date();

  for (const [merchant, txns] of Object.entries(groups)) {
    if (txns.length < 2) continue;
    txns.sort((a, b) => a.date.localeCompare(b.date));

    const intervals = [];
    for (let i = 1; i < txns.length; i++) {
      const diff = (new Date(txns[i].date) - new Date(txns[i - 1].date)) / 86400000;
      intervals.push(Math.round(diff));
    }

    const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;

    // Require tight regularity (or enough data points to be confident)
    if (cv > 0.4 && txns.length < 4) continue;

    let frequency;
    if      (mean <= 5)   frequency = 'daily';
    else if (mean <= 9)   frequency = 'weekly';
    else if (mean <= 18)  frequency = 'bi-weekly';
    else if (mean <= 50)  frequency = 'monthly';
    else if (mean <= 100) frequency = 'quarterly';
    else                  frequency = 'annual';

    const amounts = txns.map(t => t.amount);
    const avgAmount = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const amountFixed = (Math.max(...amounts) - Math.min(...amounts)) / avgAmount < 0.12;

    const lastDate = new Date(txns[txns.length - 1].date);
    const nextExpected = new Date(lastDate);
    nextExpected.setDate(nextExpected.getDate() + Math.round(mean));
    const daysUntilNext = Math.round((nextExpected - today) / 86400000);

    recurring.push({
      merchant,
      category: txns[txns.length - 1].category,
      frequency,
      avg_amount: avgAmount,
      amount_fixed: amountFixed,
      last_date: txns[txns.length - 1].date,
      next_expected: nextExpected.toISOString().split('T')[0],
      days_until_next: daysUntilNext,
      count: txns.length,
      mean_interval: Math.round(mean),
      account_name: txns[txns.length - 1].account_name,
      institution_name: txns[txns.length - 1].institution_name,
    });
  }

  return recurring.sort((a, b) => b.avg_amount - a.avg_amount);
}

/**
 * @openapi
 * /api/transactions/recurring:
 *   get:
 *     tags: [Transactions]
 *     summary: Detect recurring merchant charges from the last 24 months
 *     description: Groups posted expenses by merchant and infers a frequency (daily/weekly/bi-weekly/monthly/quarterly/annual) from the regularity of the intervals between charges.
 *     responses:
 *       200: { description: Array of recurring items sorted by avg_amount desc }
 *       500: { description: Failed to detect recurring transactions }
 */
router.get('/recurring', (req, res) => {
  try {
    res.json(detectRecurring());
  } catch (err) {
    console.error('GET /recurring error:', err.message);
    res.status(500).json({ error: 'Failed to detect recurring transactions' });
  }
});

/**
 * @openapi
 * /api/transactions/anomalies:
 *   get:
 *     tags: [Transactions]
 *     summary: Detect duplicate charges, unusually large charges, and first-time high-value merchants
 *     description: Looks at posted expenses from the last 90 days against up to 12 months of merchant history.
 *     responses:
 *       200: { description: Array of anomalies sorted by severity (high, medium, low) }
 *       500: { description: Failed to detect anomalies }
 */
router.get('/anomalies', (req, res) => {
  try {
    const anomalies = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    // Build merchant history for median calculations (12 months is enough context)
    const allTxns = db.prepare(`
      SELECT
        COALESCE(NULLIF(t.merchant_name,''), t.name) as merchant,
        t.amount, t.date, t.transaction_id, t.name, t.merchant_name,
        t.personal_finance_category, t.account_id,
        a.name as account_name, a.institution_name
      FROM visible_transactions t
      LEFT JOIN accounts a ON t.account_id = a.account_id
      WHERE t.amount > 0 AND t.pending = 0
        AND t.date >= date('now', '-12 months')
      ORDER BY t.date DESC
    `).all();

    const byMerchant = {};
    for (const t of allTxns) {
      if (!byMerchant[t.merchant]) byMerchant[t.merchant] = [];
      byMerchant[t.merchant].push(t);
    }

    const seenPairs = new Set();

    for (const [merchant, txns] of Object.entries(byMerchant)) {
      const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
      const amounts = sorted.map(t => t.amount).sort((a, b) => a - b);
      const median = amounts[Math.floor(amounts.length / 2)];

      // 1. Duplicate charges — same merchant, amount within 1%, within 48h, recent
      const recentTxns = sorted.filter(t => t.date >= cutoff);
      for (let i = 0; i < recentTxns.length; i++) {
        for (let j = i + 1; j < recentTxns.length; j++) {
          const a = recentTxns[i], b = recentTxns[j];
          const daysDiff = Math.abs(new Date(a.date) - new Date(b.date)) / 86400000;
          if (daysDiff > 2) break;
          if (Math.abs(a.amount - b.amount) / Math.max(a.amount, 0.01) > 0.01) continue;
          const pairKey = [a.transaction_id, b.transaction_id].sort().join('|');
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);
          anomalies.push({
            type: 'duplicate',
            severity: 'high',
            title: `Possible duplicate at ${merchant}`,
            description: `$${a.amount.toFixed(2)} charged ${daysDiff < 1 ? 'same day' : Math.round(daysDiff) + ' day(s) apart'}`,
            transactions: [a, b],
          });
        }
      }

      // 2. Unusually large — amount > 2.5× median, merchant has 3+ historical txns, recent
      if (txns.length >= 3 && median >= 5) {
        for (const tx of txns) {
          if (tx.date < cutoff) continue;
          if (tx.amount > median * 2.5 && tx.amount > 30) {
            anomalies.push({
              type: 'unusually_large',
              severity: 'medium',
              title: `Unusually large charge at ${merchant}`,
              description: `$${tx.amount.toFixed(2)} vs typical $${median.toFixed(2)}`,
              transactions: [tx],
            });
          }
        }
      }

      // 3. First-time high-value merchant — only 1 transaction ever, amount > $100, recent
      if (txns.length === 1 && txns[0].amount > 100 && txns[0].date >= cutoff) {
        anomalies.push({
          type: 'new_merchant',
          severity: 'low',
          title: `First charge from ${merchant}`,
          description: `$${txns[0].amount.toFixed(2)} — no prior transactions here`,
          transactions: [txns[0]],
        });
      }
    }

    const order = { high: 0, medium: 1, low: 2 };
    anomalies.sort((a, b) => order[a.severity] - order[b.severity]);
    res.json(anomalies);
  } catch (err) {
    console.error('GET /anomalies error:', err.message);
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

/**
 * @openapi
 * /api/transactions/forecast:
 *   get:
 *     tags: [Transactions]
 *     summary: Project upcoming recurring charges
 *     description: Extrapolates detected recurring charges forward from their next expected date.
 *     parameters:
 *       - name: days
 *         in: query
 *         schema: { type: integer, default: 60, maximum: 90 }
 *         description: How many days ahead to project (capped at 90).
 *     responses:
 *       200: { description: '{ projected, weekly_buckets, total_projected, days }' }
 *       500: { description: Failed to generate forecast }
 */
router.get('/forecast', (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 60, 90);
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + days);

    const recurring = detectRecurring();
    const projected = [];

    for (const item of recurring) {
      let next = new Date(item.next_expected);
      while (next <= endDate) {
        if (next >= today) {
          projected.push({
            date: next.toISOString().split('T')[0],
            merchant: item.merchant,
            category: item.category,
            amount: item.avg_amount,
            amount_fixed: item.amount_fixed,
            frequency: item.frequency,
            account_name: item.account_name,
          });
        }
        next = new Date(next);
        next.setDate(next.getDate() + item.mean_interval);
      }
    }

    projected.sort((a, b) => a.date.localeCompare(b.date));

    // Weekly buckets for summary
    const buckets = {};
    for (const p of projected) {
      const d = new Date(p.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split('T')[0];
      buckets[key] = (buckets[key] || 0) + p.amount;
    }

    const total_projected = projected.reduce((s, p) => s + p.amount, 0);

    res.json({ projected, weekly_buckets: buckets, total_projected, days });
  } catch (err) {
    console.error('GET /forecast error:', err.message);
    res.status(500).json({ error: 'Failed to generate forecast' });
  }
});

// GET /api/transactions/tax-report
const TAX_CATEGORIES = [
  'Medical', 'Healthcare', 'Charitable Giving', 'Donations',
  'Business Services', 'Professional Services', 'Education',
  'Home Improvement', 'Travel', 'Meals & Entertainment',
];

/**
 * @openapi
 * /api/transactions/tax-report:
 *   get:
 *     tags: [Transactions]
 *     summary: Group posted expenses by tax-relevant category
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *       - name: categories
 *         in: query
 *         schema: { type: string }
 *         description: Comma-separated category list overriding the default tax-relevant categories (Medical, Charitable Giving, Business Services, etc).
 *     responses:
 *       200: { description: '{ summary, grand_total, available_categories }' }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to generate tax report }
 */
router.get('/tax-report', validateDates, (req, res) => {
  try {
    const { start_date, end_date, categories } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    const cats = categories
      ? categories.split(',').map(c => c.trim()).filter(Boolean)
      : TAX_CATEGORIES;

    const placeholders = cats.map(() => '?').join(',');
    conditions.push(`LOWER(t.personal_finance_category) IN (${placeholders})`);
    params.push(...cats.map(c => c.toLowerCase()));
    conditions.push('t.amount > 0');
    conditions.push('t.pending = 0');

    const where = 'WHERE ' + conditions.join(' AND ');
    const rows = db.prepare(`
      SELECT t.*, a.name as account_name, a.institution_name
      FROM visible_transactions t
      LEFT JOIN accounts a ON t.account_id = a.account_id
      ${where}
      ORDER BY t.personal_finance_category, t.date DESC
    `).all(...params);

    // Group by category
    const grouped = {};
    for (const tx of rows) {
      const cat = tx.personal_finance_category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = { category: cat, total: 0, transactions: [] };
      grouped[cat].total += tx.amount;
      grouped[cat].transactions.push(tx);
    }

    const summary = Object.values(grouped).sort((a, b) => b.total - a.total);
    const grand_total = summary.reduce((s, g) => s + g.total, 0);

    res.json({ summary, grand_total, available_categories: TAX_CATEGORIES });
  } catch (err) {
    console.error('GET /tax-report error:', err.message);
    res.status(500).json({ error: 'Failed to generate tax report' });
  }
});

/**
 * @openapi
 * /api/transactions/tax-report/export:
 *   get:
 *     tags: [Transactions]
 *     summary: Export the tax report as a CSV file
 *     parameters:
 *       - $ref: '#/components/parameters/StartDate'
 *       - $ref: '#/components/parameters/EndDate'
 *       - name: categories
 *         in: query
 *         schema: { type: string }
 *         description: Comma-separated category list overriding the default tax-relevant categories.
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to export tax report }
 */
router.get('/tax-report/export', validateDates, (req, res) => {
  try {
    const { start_date, end_date, categories } = req.query;
    const { conditions, params } = getDateFilter(start_date, end_date);
    const cats = categories
      ? categories.split(',').map(c => c.trim()).filter(Boolean)
      : TAX_CATEGORIES;

    const placeholders = cats.map(() => '?').join(',');
    conditions.push(`LOWER(t.personal_finance_category) IN (${placeholders})`);
    params.push(...cats.map(c => c.toLowerCase()));
    conditions.push('t.amount > 0');
    conditions.push('t.pending = 0');

    const where = 'WHERE ' + conditions.join(' AND ');
    const rows = db.prepare(`
      SELECT t.date, t.name, t.merchant_name, t.personal_finance_category,
             t.amount, a.name as account_name, a.institution_name
      FROM visible_transactions t
      LEFT JOIN accounts a ON t.account_id = a.account_id
      ${where}
      ORDER BY t.personal_finance_category, t.date DESC
    `).all(...params);

    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Date', 'Merchant', 'Description', 'Category', 'Amount', 'Account', 'Institution'];
    const lines  = rows.map(r => [
      r.date, r.merchant_name || r.name, r.name,
      r.personal_finance_category, r.amount.toFixed(2),
      r.account_name, r.institution_name,
    ].map(escape).join(','));

    const csv = [header.join(','), ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tax-report-${start_date || 'all'}-${end_date || 'all'}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('GET /tax-report/export error:', err.message);
    res.status(500).json({ error: 'Failed to export tax report' });
  }
});

/**
 * @openapi
 * /api/transactions/overview-insight:
 *   get:
 *     tags: [Transactions]
 *     summary: Spend vs. the previous equal-length period, plus top 3 categories
 *     parameters:
 *       - name: start_date
 *         in: query
 *         required: true
 *         schema: { type: string, format: date }
 *       - name: end_date
 *         in: query
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: '{ current_expenses, prev_expenses, pct_change, top_categories, period_label }' }
 *       400: { description: Invalid start_date/end_date }
 *       500: { description: Failed to retrieve overview insight }
 */
router.get('/overview-insight', validateDates, (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    // Compute previous period of equal length
    const startMs = new Date(start_date).getTime();
    const endMs   = new Date(end_date).getTime();
    const spanMs  = endMs - startMs;
    const prevEnd   = new Date(startMs - 86400000).toISOString().split('T')[0];
    const prevStart = new Date(startMs - spanMs - 86400000).toISOString().split('T')[0];

    const expensesForRange = (s, e) => {
      const { conditions, params } = getDateFilter(s, e);
      conditions.push('t.amount > 0');
      conditions.push('t.pending = 0');
      const where = 'WHERE ' + conditions.join(' AND ');
      return db.prepare(`SELECT COALESCE(SUM(t.amount), 0) as total FROM visible_transactions t ${where}`).get(...params).total || 0;
    };

    const currentExpenses = expensesForRange(start_date, end_date);
    const prevExpenses    = expensesForRange(prevStart, prevEnd);

    const pctChange = prevExpenses > 0
      ? ((currentExpenses - prevExpenses) / prevExpenses) * 100
      : null;

    // Top 3 spending categories for current period
    const { conditions: cc, params: cp } = getDateFilter(start_date, end_date);
    cc.push('t.amount > 0'); cc.push('t.pending = 0');
    const topCats = db.prepare(`
      SELECT
        COALESCE(t.personal_finance_category,
          CASE WHEN t.category IS NOT NULL AND t.category != 'null'
               THEN json_extract(t.category, '$[0]')
               ELSE 'Uncategorized' END
        ) as category,
        SUM(t.amount) as total
      FROM visible_transactions t
      WHERE ${cc.join(' AND ')}
      GROUP BY category
      ORDER BY total DESC
      LIMIT 3
    `).all(...cp);

    // Format period label e.g. "Apr 1 – Apr 30, 2026"
    const fmtDate = (iso) => {
      const d = new Date(iso + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    const periodLabel = `${fmtDate(start_date)} – ${fmtDate(end_date)}`;

    res.json({
      current_expenses: currentExpenses,
      prev_expenses: prevExpenses,
      pct_change: pctChange !== null ? Math.round(pctChange * 10) / 10 : null,
      top_categories: topCats,
      period_label: periodLabel,
    });
  } catch (err) {
    console.error('GET /overview-insight error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve overview insight' });
  }
});

module.exports = router;
