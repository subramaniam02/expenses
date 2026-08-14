const express = require('express');
const router = express.Router();
const { renameAccount, setAccountHidden } = require('../db');

/**
 * @openapi
 * /api/accounts/{account_id}:
 *   patch:
 *     tags: [Accounts]
 *     summary: Rename and/or hide an account
 *     description: Hiding pulls the account out of every transaction-based view (Overview, Breakdown, Budgets, etc.) while keeping it visible in the Accounts tab so it can be un-hidden.
 *     parameters:
 *       - name: account_id
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
 *               name: { type: string }
 *               hidden: { type: boolean }
 *     responses:
 *       200: { description: '{ success, account_id, name?, hidden? }' }
 *       400: { description: At least one of name/hidden is required, or invalid type }
 *       404: { description: Unknown account_id }
 *       500: { description: Failed to update account }
 */
router.patch('/:account_id', (req, res) => {
  try {
    const { account_id } = req.params;
    const hasName = req.body.name !== undefined;
    const hasHidden = req.body.hidden !== undefined;
    if (!hasName && !hasHidden) {
      return res.status(400).json({ error: 'At least one of name/hidden is required' });
    }

    const result = { success: true, account_id };

    if (hasName) {
      const name = req.body.name?.trim();
      if (!name) return res.status(400).json({ error: 'name must be a non-empty string' });
      if (!renameAccount(account_id, name)) return res.status(404).json({ error: 'Unknown account_id' });
      result.name = name;
    }

    if (hasHidden) {
      if (typeof req.body.hidden !== 'boolean') return res.status(400).json({ error: 'hidden must be a boolean' });
      if (!setAccountHidden(account_id, req.body.hidden)) return res.status(404).json({ error: 'Unknown account_id' });
      result.hidden = req.body.hidden;
    }

    res.json(result);
  } catch (err) {
    console.error('PATCH /accounts error:', err.message);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

module.exports = router;
