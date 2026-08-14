const express = require('express');
const router = express.Router();
const plaidClient = require('../plaidClient');
const {
  getSafeAccounts, upsertAccount, upsertPlaidItem, getPlaidItemByItemId, deletePlaidItem,
} = require('../db');

/**
 * @openapi
 * /api/plaid/link-token:
 *   post:
 *     tags: [Plaid]
 *     summary: Create a Plaid Link token
 *     description: Pass `item_id` to reopen Link in update/repair mode for an existing item (Plaid's equivalent of Teller's enrollmentId repair flow); omit it to link a new institution.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               item_id: { type: string }
 *     responses:
 *       200: { description: Link token created }
 *       404: { description: Unknown item_id }
 *       500: { description: Failed to create link token }
 */
router.post('/link-token', async (req, res) => {
  try {
    const { item_id } = req.body;
    const params = {
      user: { client_user_id: 'user-1' },
      client_name: 'Expense Tracker',
      language: 'en',
      country_codes: ['US'],
    };

    if (item_id) {
      const item = getPlaidItemByItemId(item_id);
      if (!item) return res.status(404).json({ error: 'Unknown item_id' });
      params.access_token = item.access_token; // update mode — reuses the existing Item, no products needed
    } else {
      params.products = ['transactions'];
      // Must be set at link time — Plaid locks in an Item's history window (default 90 days)
      // the moment Transactions is added, and it can't be extended later by resyncing.
      params.transactions = { days_requested: 730 };
    }

    const response = await plaidClient.linkTokenCreate(params);
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('link-token error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

/**
 * @openapi
 * /api/plaid/exchange:
 *   post:
 *     tags: [Plaid]
 *     summary: Exchange a Link public_token for an access_token and store the linked accounts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [public_token]
 *             properties:
 *               public_token: { type: string }
 *               institution: { type: object, properties: { name: { type: string } } }
 *     responses:
 *       200: { description: Accounts linked }
 *       400: { description: Missing public_token }
 *       500: { description: Failed to link account }
 */
router.post('/exchange', async (req, res) => {
  try {
    const { public_token, institution } = req.body;
    if (!public_token) return res.status(400).json({ error: 'Missing public_token' });

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeRes.data;
    const institutionName = institution?.name || 'Unknown';

    upsertPlaidItem({ item_id, access_token, institution_name: institutionName });

    const accountsRes = await plaidClient.accountsGet({ access_token });
    for (const account of accountsRes.data.accounts) {
      upsertAccount({
        enrollment_id: item_id,
        account_id: account.account_id,
        name: account.name,
        official_name: account.official_name || null,
        type: account.type,
        subtype: account.subtype || null,
        institution_name: institutionName,
        last_four: account.mask || null,
        access_token: null,
        balance_current: account.balances.current ?? null,
        balance_available: account.balances.available ?? null,
        balance_limit: account.balances.limit ?? null,
        provider: 'plaid',
      });
    }

    // Pull transaction history immediately rather than waiting for the next scheduled sync
    // (up to 4 hours away) — otherwise a freshly linked account shows accounts but no transactions.
    try {
      const { runPlaidSync } = require('../plaidSync');
      await runPlaidSync();
    } catch (syncErr) {
      console.error('post-link sync error:', syncErr.message);
    }

    res.json({ success: true, accounts_linked: accountsRes.data.accounts.length });
  } catch (err) {
    console.error('exchange error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to link account' });
  }
});

/**
 * @openapi
 * /api/plaid/accounts:
 *   get:
 *     tags: [Plaid]
 *     summary: List linked accounts (Teller + Plaid)
 *     responses:
 *       200: { description: Array of accounts }
 */
router.get('/accounts', (req, res) => {
  try {
    res.json(getSafeAccounts());
  } catch (err) {
    console.error('GET /accounts error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve accounts' });
  }
});

/**
 * @openapi
 * /api/plaid/items/{item_id}:
 *   delete:
 *     tags: [Plaid]
 *     summary: Unlink a Plaid item and delete its accounts and transactions
 *     description: Use this to relink an institution from scratch — e.g. to fix an Item's transaction history window, which Plaid locks in at creation and can't be extended by resyncing.
 *     parameters:
 *       - name: item_id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Item removed }
 *       404: { description: Unknown item_id }
 *       500: { description: Failed to remove item }
 */
router.delete('/items/:item_id', async (req, res) => {
  try {
    const item = getPlaidItemByItemId(req.params.item_id);
    if (!item) return res.status(404).json({ error: 'Unknown item_id' });

    try {
      await plaidClient.itemRemove({ access_token: item.access_token });
    } catch (removeErr) {
      // Still clean up local state even if Plaid's side fails (e.g. already revoked) —
      // an unreachable dead item shouldn't block the user from relinking.
      console.warn('itemRemove warning:', removeErr.response?.data || removeErr.message);
    }

    deletePlaidItem(req.params.item_id);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /items error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

/**
 * @openapi
 * /api/plaid/sync:
 *   post:
 *     tags: [Plaid]
 *     summary: Sync transactions from Plaid for all linked items
 *     description: Rate-limited to 5 requests per 5 minutes.
 *     responses:
 *       200: { description: Sync result }
 *       500: { description: Failed to sync transactions }
 */
router.post('/sync', async (req, res) => {
  try {
    const { runPlaidSync } = require('../plaidSync');
    const result = await runPlaidSync();
    res.json(result);
  } catch (err) {
    console.error('sync error:', err.message);
    res.status(500).json({ error: 'Failed to sync transactions' });
  }
});

module.exports = router;
