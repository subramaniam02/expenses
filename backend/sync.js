const axios = require('axios');
const https = require('https');
const fs = require('fs');
const { getAccounts, upsertTransaction, applyRules, db, getMeta, setMeta, normalizeCategory, ensureCategoryExists, updateAccountStatus } = require('./db');
const { runLLMCategorization } = require('./llm');
const { runPlaidSync } = require('./plaidSync');

const TELLER_BASE = 'https://api.teller.io';
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const SKIP_PENDING = process.env.SKIP_PENDING === 'true';

function getLastSyncedAt() { return getMeta('last_synced_at'); }

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

async function runSync() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    console.log('[sync] No accounts to sync.');
    return { synced: 0, accounts_synced: 0, accounts_total: 0, accounts_failed: [] };
  }

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const startDate = twoYearsAgo.toISOString().split('T')[0];

  let totalSynced = 0;
  const accountsFailed = [];

  for (const account of accounts) {
    try {
      let allTxns = [];
      let fromId;

      while (true) {
        const params = { count: 250 };
        if (fromId) params.from_id = fromId;

        const txRes = await tellerGet(
          `/accounts/${account.account_id}/transactions`,
          account.access_token,
          params
        );

        const page = txRes.data;
        allTxns = allTxns.concat(page);
        if (page.length < 250) break;
        fromId = page[page.length - 1].id;
      }

      const dedupStmt = db.prepare(`
        DELETE FROM transactions
        WHERE account_id = ?
          AND pending = 1
          AND transaction_id != ?
          AND LOWER(name) = LOWER(?)
          AND ABS(amount - ?) / MAX(ABS(?), 0.01) < 0.02
          AND ABS(julianday(date) - julianday(?)) <= 5
      `);

      for (const tx of allTxns) {
        const category = normalizeCategory(tx.details?.category);
        ensureCategoryExists(category);
        // Teller sign convention:
        //   depository: negative=debit(expense), positive=credit(income) → negate to make expenses positive
        //   credit: positive=charge(expense), negative=payment → keep as-is so charges stay positive
        const rawAmount = parseFloat(tx.amount);
        const amount = account.type === 'credit' ? rawAmount : -rawAmount;
        const isPending = tx.status === 'pending' ? 1 : 0;

        if (isPending && SKIP_PENDING) continue;

        upsertTransaction({
          transaction_id: tx.id,
          account_id: account.account_id,
          amount,
          date: tx.date,
          name: tx.description,
          merchant_name: tx.details?.counterparty?.name || null,
          category: category ? JSON.stringify([category]) : null,
          personal_finance_category: category || null,
          pending: isPending,
          payment_channel: tx.type || null,
        });

        // When a posted transaction arrives, remove any pending version that matches
        // (same account, name, amount within 2%, date within 5 days, different ID).
        // This handles banks that assign a new ID when a pending charge posts.
        if (!isPending) {
          dedupStmt.run(account.account_id, tx.id, tx.description, amount, amount, tx.date);
        }
      }

      totalSynced += allTxns.length;

      try {
        const balRes = await tellerGet(
          `/accounts/${account.account_id}/balances`,
          account.access_token
        );
        const bal = balRes.data;
        db.prepare(`
          UPDATE accounts SET balance_current = ?, balance_available = ?
          WHERE account_id = ?
        `).run(
          bal.ledger ? parseFloat(bal.ledger) : null,
          bal.available ? parseFloat(bal.available) : null,
          account.account_id
        );
      } catch (balErr) {
        console.warn(`[sync] Balance update failed for ${account.account_id}:`, balErr.message);
      }

      updateAccountStatus(account.account_id, 'active', null, null);
    } catch (accountErr) {
      const providerError = accountErr.response?.data?.error;
      console.error(`[sync] Failed for account ${account.account_id}:`, providerError || accountErr.message);
      accountsFailed.push({
        account_id: account.account_id,
        name: account.name,
        institution_name: account.institution_name,
        error_code: providerError?.code || null,
      });
      // Only enrollment.disconnected.* codes mean the user needs to take action (reauth/MFA) —
      // other failures (timeouts, transient network errors) aren't something reconnecting fixes.
      if (providerError?.code?.startsWith('enrollment.disconnected')) {
        updateAccountStatus(account.account_id, 'reauth_required', providerError.code, providerError.message);
      }
    }
  }

  const accountsOk = accounts.length - accountsFailed.length;
  const rulesApplied = applyRules();
  setMeta('last_synced_at', new Date().toISOString());
  console.log(`[sync] Done — ${totalSynced} transactions across ${accountsOk}/${accounts.length} account(s)` +
    (accountsFailed.length ? ` (${accountsFailed.length} failed)` : '') +
    `. Rules applied: ${rulesApplied} categorized.`);

  // Run LLM categorization asynchronously — don't block sync response
  runLLMCategorization().catch(err => console.error('[llm] Auto-categorization error:', err.message));

  return { synced: totalSynced, accounts_synced: accountsOk, accounts_total: accounts.length, accounts_failed: accountsFailed };
}

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 min heartbeat

let isSyncing = false;

async function runSyncGuarded(reason) {
  if (isSyncing) {
    console.log(`[sync] Skipping ${reason} sync — one is already in progress.`);
    return;
  }
  isSyncing = true;
  console.log(`[sync] Running ${reason} sync...`);
  try {
    await runSync();
  } catch (err) {
    console.error(`[sync] ${reason} sync error:`, err.message);
  }
  try {
    await runPlaidSync();
  } catch (err) {
    console.error(`[plaid-sync] ${reason} sync error:`, err.message);
  } finally {
    isSyncing = false;
  }
}

function startScheduler() {
  console.log(`[sync] Scheduler started — checks every 5 min, syncs once 4+ hours have passed since the last sync.`);

  // Run once on startup (after 10s delay to let the server settle)
  setTimeout(() => runSyncGuarded('initial'), 10_000);

  // Wall-clock heartbeat, checked against the persisted last_synced_at — unlike a
  // single 4-hour setInterval, this self-heals across process restarts and host
  // sleep instead of requiring 4 hours of uninterrupted process uptime to ever fire.
  setInterval(() => {
    const lastSyncedAt = getLastSyncedAt();
    const msSinceLastSync = lastSyncedAt ? Date.now() - new Date(lastSyncedAt).getTime() : Infinity;
    if (msSinceLastSync >= FOUR_HOURS) {
      runSyncGuarded('scheduled');
    }
  }, CHECK_INTERVAL);
}

module.exports = { runSync, startScheduler, getLastSyncedAt };
