const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const { getSafeAccounts, upsertAccount, findAccountForRekey, rekeyAccount, db } = require('../db');
const { runSync, getLastSyncedAt } = require('../sync');

const TELLER_BASE = 'https://api.teller.io';

function createAgent() {
  const certPath = process.env.TELLER_CERT_PATH;
  const keyPath = process.env.TELLER_KEY_PATH;
  if (certPath && keyPath) {
    return new https.Agent({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    });
  }
  return new https.Agent();
}

async function tellerGet(path, accessToken, params = {}) {
  return axios.get(`${TELLER_BASE}${path}`, {
    params,
    auth: { username: accessToken, password: '' },
    httpsAgent: createAgent(),
  });
}

/**
 * @openapi
 * /api/teller/enroll:
 *   post:
 *     tags: [Teller]
 *     summary: Enroll accounts from a completed Teller Connect session
 *     description: Called by the frontend after Teller Connect succeeds. Fetches the linked accounts from Teller and upserts them.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [access_token, enrollment_id]
 *             properties:
 *               access_token: { type: string }
 *               enrollment_id: { type: string }
 *               institution: { type: object, properties: { name: { type: string } } }
 *               user_id: { type: string }
 *     responses:
 *       200:
 *         description: Accounts linked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 accounts_linked: { type: integer }
 *       400: { description: Missing access_token or enrollment_id }
 *       500: { description: Failed to enroll account }
 */
router.post('/enroll', async (req, res) => {
  try {
    const { access_token, enrollment_id, institution, user_id } = req.body;

    console.log('[enroll] body:', JSON.stringify(req.body));
    if (!access_token || !enrollment_id) {
      return res.status(400).json({ error: 'Missing access_token or enrollment_id' });
    }

    const accountsRes = await tellerGet('/accounts', access_token);
    const tellerAccounts = accountsRes.data;

    for (const account of tellerAccounts) {
      const institutionName = institution?.name || account.institution?.name || 'Unknown';
      const accountFields = {
        enrollment_id,
        account_id: account.id,
        name: account.name,
        official_name: null,
        type: account.type,
        subtype: account.subtype || null,
        institution_name: institutionName,
        last_four: account.last_four || null,
        access_token,
        balance_current: null,
        balance_available: null,
        balance_limit: null,
      };

      // A fresh (non-repair) Teller Connect session can hand back a new account_id
      // for an account we already track — reattach it to the existing row (and its
      // transaction history) instead of leaving a stale duplicate behind.
      const existing = findAccountForRekey(institutionName, account.name, account.last_four);
      if (existing && existing.account_id !== account.id) {
        rekeyAccount(existing.account_id, account.id, accountFields);
      } else {
        upsertAccount(accountFields);
      }
    }

    res.json({ success: true, accounts_linked: tellerAccounts.length });
  } catch (err) {
    console.error('enroll error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to enroll account' });
  }
});

/**
 * @openapi
 * /api/teller/sync:
 *   post:
 *     tags: [Teller]
 *     summary: Sync transactions from Teller for all enrolled accounts
 *     description: Rate-limited to 5 requests per 5 minutes.
 *     responses:
 *       200: { description: Sync result }
 *       500: { description: Failed to sync transactions }
 */
router.post('/sync', async (req, res) => {
  try {
    const result = await runSync();
    res.json(result);
  } catch (err) {
    console.error('sync error:', err.message);
    res.status(500).json({ error: 'Failed to sync transactions' });
  }
});

/**
 * @openapi
 * /api/teller/dedup-pending:
 *   post:
 *     tags: [Teller]
 *     summary: Remove pending transactions superseded by a matching posted one
 *     description: One-off maintenance endpoint to clear pre-existing duplicates left over from before dedup was applied at sync time.
 *     responses:
 *       200:
 *         description: Number of rows removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 removed: { type: integer }
 *       500: { description: Failed to dedup pending transactions }
 */
router.post('/dedup-pending', (req, res) => {
  try {
    const { db } = require('../db');
    const info = db.prepare(`
      DELETE FROM transactions
      WHERE pending = 1
        AND EXISTS (
          SELECT 1 FROM transactions posted
          WHERE posted.account_id  = transactions.account_id
            AND posted.pending     = 0
            AND posted.transaction_id != transactions.transaction_id
            AND LOWER(posted.name) = LOWER(transactions.name)
            AND ABS(posted.amount - transactions.amount) / MAX(ABS(transactions.amount), 0.01) < 0.02
            AND ABS(julianday(posted.date) - julianday(transactions.date)) <= 5
        )
    `).run();
    res.json({ removed: info.changes });
  } catch (err) {
    console.error('dedup-pending error:', err.message);
    res.status(500).json({ error: 'Failed to dedup pending transactions' });
  }
});

/**
 * @openapi
 * /api/teller/status:
 *   get:
 *     tags: [Teller]
 *     summary: Get the last successful sync time
 *     responses:
 *       200:
 *         description: Last sync timestamp
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 last_synced_at: { type: string, format: date-time, nullable: true }
 */
router.get('/status', (req, res) => {
  const recorded = getLastSyncedAt();
  // Fall back to newest transaction's created_at when meta hasn't been written yet
  const fallback = recorded
    ? null
    : db.prepare("SELECT MAX(created_at) as t FROM transactions").get()?.t ?? null;
  res.json({ last_synced_at: recorded || fallback });
});

/**
 * @openapi
 * /api/teller/accounts:
 *   get:
 *     tags: [Teller]
 *     summary: List linked accounts
 *     description: Returns accounts without access tokens (safe for the frontend).
 *     responses:
 *       200: { description: Array of accounts }
 *       500: { description: Failed to retrieve accounts }
 */
router.get('/accounts', (req, res) => {
  try {
    res.json(getSafeAccounts());
  } catch (err) {
    console.error('GET /accounts error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve accounts' });
  }
});

module.exports = router;
