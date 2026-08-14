const express = require('express');
const router = express.Router();
const { db } = require('../db');

/**
 * @openapi
 * /api/categories:
 *   get:
 *     tags: [Categories]
 *     summary: List custom category names
 *     responses:
 *       200: { description: Array of custom categories }
 *       500: { description: Failed to fetch categories }
 */
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM custom_categories ORDER BY name ASC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * @openapi
 * /api/categories:
 *   post:
 *     tags: [Categories]
 *     summary: Create a custom category
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200: { description: The created category }
 *       400: { description: name is required }
 *       409: { description: Category already exists }
 *       500: { description: Failed to create category }
 */
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const result = db.prepare(
      'INSERT INTO custom_categories (name) VALUES (?) ON CONFLICT(name) DO NOTHING'
    ).run(name.trim().toLowerCase());
    if (result.changes === 0) return res.status(409).json({ error: 'Category already exists' });
    const row = db.prepare('SELECT * FROM custom_categories WHERE name = ?').get(name.trim().toLowerCase());
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

/**
 * @openapi
 * /api/categories/{id}:
 *   delete:
 *     tags: [Categories]
 *     summary: Delete a custom category
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Category not found }
 *       500: { description: Failed to delete category }
 */
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM custom_categories WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
