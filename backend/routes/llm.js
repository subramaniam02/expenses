const express = require('express');
const router = express.Router();
const { db, normalizeCategory, ensureCategoryExists } = require('../db');
const { runLLMCategorization } = require('../llm');

let isRunning = false;

/**
 * @openapi
 * /api/llm/status:
 *   get:
 *     tags: [LLM]
 *     summary: Get LLM categorization status and suggestion counts
 *     responses:
 *       200:
 *         description: Status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pending: { type: integer }
 *                 accepted: { type: integer }
 *                 rejected: { type: integer }
 *                 running: { type: boolean }
 *                 ollama_url: { type: string }
 *                 model: { type: string }
 *       500: { description: Error }
 */
router.get('/status', (req, res) => {
  try {
    const pending  = db.prepare("SELECT COUNT(*) AS c FROM llm_suggestions WHERE status='pending'").get().c;
    const accepted = db.prepare("SELECT COUNT(*) AS c FROM llm_suggestions WHERE status='accepted'").get().c;
    const rejected = db.prepare("SELECT COUNT(*) AS c FROM llm_suggestions WHERE status='rejected'").get().c;
    res.json({
      pending, accepted, rejected,
      running: isRunning,
      ollama_url: process.env.OLLAMA_URL || 'http://host.docker.internal:11434',
      model: process.env.OLLAMA_MODEL || 'llama3',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/llm/suggestions:
 *   get:
 *     tags: [LLM]
 *     summary: List LLM merchant-category suggestions by status
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [pending, accepted, rejected], default: pending }
 *     responses:
 *       200: { description: Array of suggestions with total_amount and last_date }
 *       500: { description: Error }
 */
router.get('/suggestions', (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const rows = db.prepare(`
      SELECT s.*,
        COALESCE((
          SELECT SUM(ABS(t.amount))
          FROM transactions t
          WHERE COALESCE(t.merchant_name, t.name) = s.merchant
            AND (t.personal_finance_category IS NULL OR t.personal_finance_category = '')
            AND t.manually_categorized = 0
        ), 0) AS total_amount,
        (
          SELECT MAX(t.date)
          FROM transactions t
          WHERE COALESCE(t.merchant_name, t.name) = s.merchant
            AND (t.personal_finance_category IS NULL OR t.personal_finance_category = '')
            AND t.manually_categorized = 0
        ) AS last_date
      FROM llm_suggestions s
      WHERE s.status = ?
      ORDER BY s.transaction_count DESC, s.created_at DESC
    `).all(status);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/llm/categorize:
 *   post:
 *     tags: [LLM]
 *     summary: Manually trigger LLM categorization of uncategorized merchants
 *     description: Runs against the configured Ollama model, auto-applying the top-ranked category to matching transactions.
 *     responses:
 *       200: { description: '{ processed, suggested }' }
 *       409: { description: LLM categorization already running }
 *       500: { description: Error }
 */
router.post('/categorize', async (req, res) => {
  if (isRunning) return res.status(409).json({ error: 'LLM categorization already running' });
  isRunning = true;
  try {
    const result = await runLLMCategorization();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    isRunning = false;
  }
});

/**
 * @openapi
 * /api/llm/suggestions/accept-selected:
 *   post:
 *     tags: [LLM]
 *     summary: Accept a selected list of suggestions, optionally overriding the category
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required: [id]
 *               properties:
 *                 id: { type: integer }
 *                 category: { type: string }
 *     responses:
 *       200: { description: '{ success, accepted, updated }' }
 *       400: { description: items array required }
 *       500: { description: Error }
 */
router.post('/suggestions/accept-selected', (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items array required' });

    const txStmt = db.prepare(`
      UPDATE transactions SET
        personal_finance_category = ?,
        category                  = ?,
        manually_categorized      = 0
      WHERE COALESCE(merchant_name, name) = ?
        AND (personal_finance_category IS NULL OR personal_finance_category = '')
        AND manually_categorized = 0
    `);
    const acceptStmt = db.prepare("UPDATE llm_suggestions SET status='accepted', suggested_category=? WHERE id=?");

    let totalUpdated = 0;
    db.transaction(() => {
      for (const { id, category } of items) {
        const suggestion = db.prepare('SELECT merchant FROM llm_suggestions WHERE id=?').get(id);
        const cat = normalizeCategory(category);
        if (!suggestion || !cat) continue;
        ensureCategoryExists(cat);
        totalUpdated += txStmt.run(cat, JSON.stringify([cat]), suggestion.merchant).changes;
        acceptStmt.run(cat, id);
      }
    })();

    res.json({ success: true, accepted: items.length, updated: totalUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/llm/suggestions/accept-all:
 *   post:
 *     tags: [LLM]
 *     summary: Accept all pending suggestions as-is
 *     responses:
 *       200: { description: '{ success, accepted, updated }' }
 *       500: { description: Error }
 */
router.post('/suggestions/accept-all', (req, res) => {
  try {
    const pending = db.prepare("SELECT * FROM llm_suggestions WHERE status='pending'").all();
    let totalUpdated = 0;

    const txStmt = db.prepare(`
      UPDATE transactions SET
        personal_finance_category = ?,
        category                  = ?,
        manually_categorized      = 0
      WHERE COALESCE(merchant_name, name) = ?
        AND (personal_finance_category IS NULL OR personal_finance_category = '')
        AND manually_categorized = 0
    `);
    const acceptStmt = db.prepare("UPDATE llm_suggestions SET status='accepted' WHERE id=?");

    db.transaction(() => {
      for (const s of pending) {
        totalUpdated += txStmt.run(s.suggested_category, JSON.stringify([s.suggested_category]), s.merchant).changes;
        acceptStmt.run(s.id);
      }
    })();

    res.json({ success: true, accepted: pending.length, updated: totalUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/llm/suggestions/{id}/accept:
 *   post:
 *     tags: [LLM]
 *     summary: Accept a single suggestion, optionally overriding the category
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category: { type: string }
 *     responses:
 *       200: { description: '{ success, updated, category }' }
 *       404: { description: Suggestion not found }
 *       500: { description: Error }
 */
router.post('/suggestions/:id/accept', (req, res) => {
  try {
    const suggestion = db.prepare('SELECT * FROM llm_suggestions WHERE id=?').get(req.params.id);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });

    const cat = normalizeCategory(req.body?.category) || suggestion.suggested_category;
    ensureCategoryExists(cat);
    const catJson = JSON.stringify([cat]);

    const updated = db.prepare(`
      UPDATE transactions SET
        personal_finance_category = ?,
        category                  = ?,
        manually_categorized      = 0
      WHERE COALESCE(merchant_name, name) = ?
        AND (personal_finance_category IS NULL OR personal_finance_category = '')
        AND manually_categorized = 0
    `).run(cat, catJson, suggestion.merchant).changes;

    db.prepare("UPDATE llm_suggestions SET status='accepted', suggested_category=? WHERE id=?")
      .run(cat, req.params.id);

    res.json({ success: true, updated, category: cat });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/llm/suggestions/{id}/reject:
 *   post:
 *     tags: [LLM]
 *     summary: Reject a suggestion
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Rejected }
 *       404: { description: Suggestion not found }
 *       500: { description: Error }
 */
router.post('/suggestions/:id/reject', (req, res) => {
  try {
    const result = db.prepare("UPDATE llm_suggestions SET status='rejected' WHERE id=?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Suggestion not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/llm/suggestions/{id}:
 *   delete:
 *     tags: [LLM]
 *     summary: Delete a suggestion so its merchant can be re-analyzed
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Deleted }
 *       500: { description: Error }
 */
router.delete('/suggestions/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM llm_suggestions WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/llm/suggestions/for-merchants:
 *   get:
 *     tags: [LLM]
 *     summary: Look up ranked category suggestions for a set of merchants
 *     parameters:
 *       - name: merchants
 *         in: query
 *         required: true
 *         style: form
 *         explode: true
 *         schema: { type: array, items: { type: string } }
 *         example: ["Starbucks", "Amazon"]
 *     responses:
 *       200:
 *         description: Map of merchant name to up to 3 ranked category names
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: { type: array, items: { type: string } }
 *       500: { description: Error }
 */
router.get('/suggestions/for-merchants', (req, res) => {
  try {
    const merchants = [].concat(req.query.merchants || []).filter(Boolean);
    if (merchants.length === 0) return res.json({});

    const placeholders = merchants.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT merchant, suggested_category, alt_categories
      FROM llm_suggestions
      WHERE merchant IN (${placeholders})
    `).all(...merchants);

    const result = {};
    for (const row of rows) {
      let alts = [];
      try { alts = JSON.parse(row.alt_categories || '[]'); } catch {}
      result[row.merchant] = [row.suggested_category, ...alts].filter(Boolean).slice(0, 3);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
