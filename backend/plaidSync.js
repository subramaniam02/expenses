const plaidClient = require('./plaidClient');
const {
  getPlaidItems, setPlaidItemCursor, updatePlaidItemStatus, updateAccountStatus,
  upsertTransaction, applyRules, getMeta, setMeta, normalizeCategory, ensureCategoryExists, db,
} = require('./db');
const { runLLMCategorization } = require('./llm');

function accountIdsForItem(itemId) {
  return db.prepare("SELECT account_id FROM accounts WHERE enrollment_id = ? AND provider = 'plaid'")
    .all(itemId).map(r => r.account_id);
}

async function runPlaidSync() {
  const items = getPlaidItems();
  if (items.length === 0) {
    console.log('[plaid-sync] No items to sync.');
    return { synced: 0, items_synced: 0, items_total: 0, items_failed: [] };
  }

  let totalSynced = 0;
  const itemsFailed = [];

  for (const item of items) {
    try {
      let cursor = item.cursor || undefined;
      let hasMore = true;
      let added = 0;

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: item.access_token,
          cursor,
          options: { days_requested: 730 },
        });
        const data = response.data;

        for (const tx of [...data.added, ...data.modified]) {
          // Plaid's PFC enums (e.g. FOOD_AND_DRINK_GROCERIES) are stored through the same
          // normalizeCategory/formatCat pipeline as Teller's lowercase categories, so display
          // stays consistent even though Plaid's taxonomy is more granular.
          const category = normalizeCategory(tx.personal_finance_category?.detailed || tx.personal_finance_category?.primary);
          ensureCategoryExists(category);

          upsertTransaction({
            transaction_id: tx.transaction_id,
            account_id: tx.account_id,
            // Plaid: positive = money out (expense), negative = money in (income) — for every
            // account type, unlike Teller which needed a per-type sign flip. No conversion needed.
            amount: tx.amount,
            date: tx.date,
            name: tx.name,
            merchant_name: tx.merchant_name || null,
            category: category ? JSON.stringify([category]) : null,
            personal_finance_category: category,
            pending: tx.pending ? 1 : 0,
            payment_channel: tx.payment_channel || null,
          });
          added++;
        }

        for (const removed of data.removed) {
          db.prepare('DELETE FROM transactions WHERE transaction_id = ?').run(removed.transaction_id);
        }

        cursor = data.next_cursor;
        hasMore = data.has_more;
      }

      setPlaidItemCursor(item.item_id, cursor);
      totalSynced += added;

      try {
        const accountsRes = await plaidClient.accountsGet({ access_token: item.access_token });
        for (const account of accountsRes.data.accounts) {
          db.prepare(`
            UPDATE accounts SET balance_current = ?, balance_available = ?, balance_limit = ?
            WHERE account_id = ?
          `).run(
            account.balances.current ?? null,
            account.balances.available ?? null,
            account.balances.limit ?? null,
            account.account_id
          );
        }
      } catch (balErr) {
        console.warn(`[plaid-sync] Balance update failed for item ${item.item_id}:`, balErr.message);
      }

      updatePlaidItemStatus(item.item_id, 'active', null, null);
      for (const accountId of accountIdsForItem(item.item_id)) {
        updateAccountStatus(accountId, 'active', null, null);
      }
    } catch (itemErr) {
      const plaidError = itemErr.response?.data;
      console.error(`[plaid-sync] Failed for item ${item.item_id}:`, plaidError || itemErr.message);
      itemsFailed.push({
        item_id: item.item_id,
        institution_name: item.institution_name,
        error_code: plaidError?.error_code || null,
      });
      if (plaidError?.error_type === 'ITEM_ERROR') {
        updatePlaidItemStatus(item.item_id, 'reauth_required', plaidError.error_code, plaidError.error_message);
        for (const accountId of accountIdsForItem(item.item_id)) {
          updateAccountStatus(accountId, 'reauth_required', plaidError.error_code, plaidError.error_message);
        }
      }
    }
  }

  const itemsOk = items.length - itemsFailed.length;
  const rulesApplied = applyRules();
  setMeta('last_synced_at', new Date().toISOString());
  console.log(`[plaid-sync] Done — ${totalSynced} transactions across ${itemsOk}/${items.length} item(s)` +
    (itemsFailed.length ? ` (${itemsFailed.length} failed)` : '') +
    `. Rules applied: ${rulesApplied} categorized.`);

  runLLMCategorization().catch(err => console.error('[llm] Auto-categorization error:', err.message));

  return { synced: totalSynced, items_synced: itemsOk, items_total: items.length, items_failed: itemsFailed };
}

module.exports = { runPlaidSync };
