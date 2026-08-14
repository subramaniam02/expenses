const express = require('express');
const router = express.Router();
const { db, applyRules, normalizeCategory, ensureCategoryExists } = require('../db');

const ALLOWED_FIELDS = ['merchant_name', 'name', 'any'];
const ALLOWED_TYPES  = ['contains', 'exact', 'starts_with'];

/**
 * @openapi
 * /api/rules:
 *   get:
 *     tags: [Rules]
 *     summary: List auto-categorization rules
 *     responses:
 *       200: { description: Array of rules }
 *       500: { description: Failed to fetch rules }
 */
router.get('/', (req, res) => {
  try {
    const rules = db.prepare('SELECT * FROM rules ORDER BY id ASC').all();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

/**
 * @openapi
 * /api/rules:
 *   post:
 *     tags: [Rules]
 *     summary: Create an auto-categorization rule
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [match_value, category]
 *             properties:
 *               match_field: { type: string, enum: [merchant_name, name, any], default: any }
 *               match_type: { type: string, enum: [contains, exact, starts_with], default: contains }
 *               match_value: { type: string }
 *               category: { type: string }
 *               rename_to: { type: string, nullable: true }
 *     responses:
 *       200: { description: The created rule }
 *       400: { description: Missing or invalid fields }
 *       500: { description: Failed to create rule }
 */
router.post('/', (req, res) => {
  try {
    const { match_field = 'any', match_type = 'contains', match_value, category, rename_to } = req.body;
    if (!match_value?.trim() || !category?.trim()) {
      return res.status(400).json({ error: 'match_value and category are required' });
    }
    if (!ALLOWED_FIELDS.includes(match_field)) {
      return res.status(400).json({ error: 'Invalid match_field' });
    }
    if (!ALLOWED_TYPES.includes(match_type)) {
      return res.status(400).json({ error: 'Invalid match_type' });
    }
    const renameTo = rename_to?.trim() || null;
    const cat = normalizeCategory(category);
    ensureCategoryExists(cat);
    const result = db.prepare(
      'INSERT INTO rules (match_field, match_type, match_value, category, rename_to) VALUES (?, ?, ?, ?, ?)'
    ).run(match_field, match_type, match_value.trim(), cat, renameTo);
    res.json({
      id: result.lastInsertRowid, match_field, match_type,
      match_value: match_value.trim(), category: cat, rename_to: renameTo,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

/**
 * @openapi
 * /api/rules/{id}:
 *   delete:
 *     tags: [Rules]
 *     summary: Delete a rule
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Rule not found }
 *       500: { description: Failed to delete rule }
 */
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM rules WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

/**
 * @openapi
 * /api/rules/apply:
 *   post:
 *     tags: [Rules]
 *     summary: Apply all rules to existing transactions
 *     responses:
 *       200:
 *         description: Number of transactions updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 updated: { type: integer }
 *       500: { description: Failed to apply rules }
 */
router.post('/apply', (req, res) => {
  try {
    const updated = applyRules();
    res.json({ updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply rules' });
  }
});

module.exports = router;
