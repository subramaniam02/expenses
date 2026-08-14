const express = require('express');
const router = express.Router();
const { getMeta, setMeta } = require('../db');

/**
 * @openapi
 * /api/settings:
 *   get:
 *     tags: [Settings]
 *     summary: Get app settings
 *     responses:
 *       200:
 *         description: Current settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 show_teller: { type: boolean, description: "Whether Teller-linked accounts/transactions are shown (default false — Teller's API has shut down)" }
 */
router.get('/', (req, res) => {
  res.json({ show_teller: getMeta('show_teller_accounts') === '1' });
});

/**
 * @openapi
 * /api/settings:
 *   put:
 *     tags: [Settings]
 *     summary: Update app settings
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [show_teller]
 *             properties:
 *               show_teller: { type: boolean }
 *     responses:
 *       200: { description: Updated settings }
 *       400: { description: show_teller must be a boolean }
 */
router.put('/', (req, res) => {
  const { show_teller } = req.body;
  if (typeof show_teller !== 'boolean') {
    return res.status(400).json({ error: 'show_teller must be a boolean' });
  }
  setMeta('show_teller_accounts', show_teller ? '1' : '0');
  res.json({ show_teller });
});

module.exports = router;
