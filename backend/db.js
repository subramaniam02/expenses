const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'expense_tracker.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// ── Encryption helpers ────────────────────────────────────────────────────────
const ALGO = 'aes-256-cbc';

function getEncryptionKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string. Generate: openssl rand -hex 32');
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `enc:${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text) {
  if (!text || !text.startsWith('enc:')) return text;
  try {
    const key = getEncryptionKey();
    const [, ivHex, encHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Failed to decrypt access token — check ENCRYPTION_KEY');
  }
}

// ── Schema migration: drop old Plaid schema if present ───────────────────────
const existingCols = db.prepare("PRAGMA table_info(accounts)").all().map(c => c.name);
if (existingCols.length > 0 && existingCols.includes('plaid_item_id')) {
  console.log('[db] Migrating schema from Plaid to Teller — existing data cleared.');
  db.exec('DROP TABLE IF EXISTS transactions; DROP TABLE IF EXISTS accounts;');
}

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    enrollment_id TEXT,
    account_id TEXT UNIQUE,
    name TEXT,
    official_name TEXT,
    type TEXT,
    subtype TEXT,
    institution_name TEXT,
    last_four TEXT,
    access_token TEXT,
    balance_current REAL,
    balance_available REAL,
    balance_limit REAL,
    status TEXT DEFAULT 'active',
    error_code TEXT,
    error_message TEXT,
    status_updated_at TEXT,
    provider TEXT DEFAULT 'teller',
    hidden INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

if (existingCols.length > 0 && !existingCols.includes('last_four')) {
  db.exec('ALTER TABLE accounts ADD COLUMN last_four TEXT');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE,
    account_id TEXT,
    amount REAL,
    date TEXT,
    name TEXT,
    merchant_name TEXT,
    category TEXT,
    personal_finance_category TEXT,
    pending INTEGER DEFAULT 0,
    payment_channel TEXT,
    manually_categorized INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
  );

  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_field TEXT NOT NULL DEFAULT 'any',
    match_type TEXT NOT NULL DEFAULT 'contains',
    match_value TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS custom_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS llm_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant TEXT NOT NULL,
    suggested_category TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    transaction_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_merchant ON llm_suggestions(merchant);
`);

// ── Indexes ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tx_date    ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_tx_amount  ON transactions(amount);
  CREATE INDEX IF NOT EXISTS idx_tx_pending ON transactions(pending);
  CREATE INDEX IF NOT EXISTS idx_tx_pfc     ON transactions(personal_finance_category);
  CREATE INDEX IF NOT EXISTS idx_tx_merchant ON transactions(merchant_name);
  CREATE INDEX IF NOT EXISTS idx_tx_account  ON transactions(account_id);
`);

// ── Migrations ────────────────────────────────────────────────────────────────
const txCols = db.prepare('PRAGMA table_info(transactions)').all().map(c => c.name);
if (!txCols.includes('manually_categorized')) {
  db.exec('ALTER TABLE transactions ADD COLUMN manually_categorized INTEGER DEFAULT 0');
}

const ruleCols = db.prepare('PRAGMA table_info(rules)').all().map(c => c.name);
if (!ruleCols.includes('rename_to')) {
  db.exec('ALTER TABLE rules ADD COLUMN rename_to TEXT');
}

const llmCols = db.prepare('PRAGMA table_info(llm_suggestions)').all().map(c => c.name);
if (!llmCols.includes('alt_categories')) {
  db.exec('ALTER TABLE llm_suggestions ADD COLUMN alt_categories TEXT');
}

const accCols = db.prepare('PRAGMA table_info(accounts)').all().map(c => c.name);
if (!accCols.includes('status')) {
  db.exec(`
    ALTER TABLE accounts ADD COLUMN status TEXT DEFAULT 'active';
    ALTER TABLE accounts ADD COLUMN error_code TEXT;
    ALTER TABLE accounts ADD COLUMN error_message TEXT;
    ALTER TABLE accounts ADD COLUMN status_updated_at TEXT;
  `);
}
if (!accCols.includes('provider')) {
  // Distinguishes which sync path (Teller vs Plaid) owns a row, since both write into
  // this same generic accounts table — Teller's runSync must not try to call Plaid
  // accounts and vice versa. Existing rows predate Plaid re-support, hence 'teller' default.
  db.exec("ALTER TABLE accounts ADD COLUMN provider TEXT DEFAULT 'teller'");
}
if (!accCols.includes('hidden')) {
  // Per-account hide, independent of the Teller-wide show_teller_accounts setting — lets
  // the user manually retire a specific account (e.g. closed) from every spend view while
  // still managing it (and un-hiding it) from the Accounts tab.
  db.exec('ALTER TABLE accounts ADD COLUMN hidden INTEGER DEFAULT 0');
}

// Item-level state for Plaid (one Item = one institution login, like Teller's enrollment_id,
// but Plaid access_token/sync-cursor are keyed per item rather than duplicated per account row).
db.exec(`
  CREATE TABLE IF NOT EXISTS plaid_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT UNIQUE,
    access_token TEXT,
    institution_name TEXT,
    cursor TEXT,
    status TEXT DEFAULT 'active',
    error_code TEXT,
    error_message TEXT,
    status_updated_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Visibility views ──────────────────────────────────────────────────────────
// Teller's API has shut down — its accounts/transactions stay in the DB (historical
// data) but are hidden from every read-only display query by default, toggleable via
// the 'show_teller_accounts' setting (Settings page). Re-created on every startup
// (views have no ALTER, and this keeps the definition in sync with this file) — the
// subquery against `meta` is re-evaluated per query, so toggling the setting takes
// effect immediately with no view recreation needed.
//
// visible_accounts intentionally does NOT filter on the per-account `hidden` flag —
// getSafeAccounts() (Accounts tab) uses it and needs to keep showing hidden accounts
// so the user can un-hide them. visible_transactions DOES filter on `hidden`, since
// hiding an account is meant to pull its spend out of every transaction-based view.
db.exec(`
  DROP VIEW IF EXISTS visible_accounts;
  CREATE VIEW visible_accounts AS
    SELECT * FROM accounts
    WHERE provider != 'teller'
       OR COALESCE((SELECT value FROM meta WHERE key = 'show_teller_accounts'), '0') = '1';

  DROP VIEW IF EXISTS visible_transactions;
  CREATE VIEW visible_transactions AS
    SELECT t.* FROM transactions t
    WHERE (
      NOT EXISTS (
        SELECT 1 FROM accounts a WHERE a.account_id = t.account_id AND a.provider = 'teller'
      )
      OR COALESCE((SELECT value FROM meta WHERE key = 'show_teller_accounts'), '0') = '1'
    )
    AND NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.account_id = t.account_id AND a.hidden = 1
    );
`);

// ── Normalize category casing ─────────────────────────────────────────────────
// Category values used to be stored with whatever casing was typed (rules, manual
// edits, LLM output), so "Groceries" and "groceries" were treated as distinct
// categories — duplicate slices in breakdowns, budgets silently not matching spend,
// etc. Categories are now normalized to lowercase on write (see normalizeCategory);
// this one-time (idempotent — the WHERE clauses make re-runs a no-op) cleanup fixes
// data that predates that change.
function dedupeCaseInsensitive(table, column) {
  const groups = db.prepare(`
    SELECT GROUP_CONCAT(id) as ids FROM ${table}
    GROUP BY LOWER(${column}) HAVING COUNT(*) > 1
  `).all();
  for (const { ids } of groups) {
    const [, ...drop] = ids.split(',').map(Number).sort((a, b) => b - a); // keep newest id
    if (drop.length) db.prepare(`DELETE FROM ${table} WHERE id IN (${drop.join(',')})`).run();
  }
  db.prepare(`UPDATE ${table} SET ${column} = LOWER(${column}) WHERE ${column} != LOWER(${column})`).run();
}
dedupeCaseInsensitive('budgets', 'category');
dedupeCaseInsensitive('custom_categories', 'name');

db.exec(`
  UPDATE transactions SET personal_finance_category = LOWER(personal_finance_category)
    WHERE personal_finance_category IS NOT NULL AND personal_finance_category != LOWER(personal_finance_category);
  UPDATE transactions SET category = LOWER(category)
    WHERE category IS NOT NULL AND category != 'null' AND category != LOWER(category);
  UPDATE rules SET category = LOWER(category) WHERE category != LOWER(category);
  UPDATE llm_suggestions SET suggested_category = LOWER(suggested_category) WHERE suggested_category != LOWER(suggested_category);
  UPDATE llm_suggestions SET alt_categories = LOWER(alt_categories)
    WHERE alt_categories IS NOT NULL AND alt_categories != LOWER(alt_categories);
`);

/** Canonical form for a category string — lowercased so "Groceries"/"groceries" collapse to one value. Display code title-cases for presentation. */
function normalizeCategory(cat) {
  const trimmed = cat?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

const ensureCategoryStmt = db.prepare('INSERT INTO custom_categories (name) VALUES (?) ON CONFLICT(name) DO NOTHING');
/** Registers a (normalized) category so it shows up in category pickers everywhere, regardless of which flow first wrote it — rules, budgets, LLM suggestions, manual edits, or Teller sync. */
function ensureCategoryExists(cat) {
  if (cat) ensureCategoryStmt.run(cat);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Teller accounts with decrypted access tokens — internal use only. Plaid accounts are
 * synced via plaid_items (access_token/cursor scoped to the Item, not the account row). */
function getAccounts() {
  return db.prepare("SELECT * FROM accounts WHERE provider = 'teller'").all().map(row => ({
    ...row,
    access_token: decrypt(row.access_token),
  }));
}

/** Accounts safe for frontend — no access_token or sensitive fields. Transaction stats
 * deliberately come from the raw `transactions` table, not `visible_transactions` — this
 * is an account-management view, so a hidden or Teller-toggled-off account should still
 * report its true history depth rather than 0. */
function getSafeAccounts() {
  return db.prepare(`
    SELECT a.account_id, a.enrollment_id, a.name, a.official_name, a.type, a.subtype,
           a.institution_name, a.balance_current, a.balance_available, a.balance_limit,
           a.status, a.error_code, a.error_message, a.status_updated_at, a.created_at,
           a.provider, a.hidden,
           tx.first_transaction_date, COALESCE(tx.transaction_count, 0) as transaction_count
    FROM visible_accounts a
    LEFT JOIN (
      SELECT account_id, MIN(date) as first_transaction_date, COUNT(*) as transaction_count
      FROM transactions
      GROUP BY account_id
    ) tx ON tx.account_id = a.account_id
  `).all();
}

/** Records the outcome of the most recent sync attempt for one account. */
function updateAccountStatus(accountId, status, errorCode, errorMessage) {
  db.prepare(`
    UPDATE accounts SET status = ?, error_code = ?, error_message = ?, status_updated_at = datetime('now')
    WHERE account_id = ?
  `).run(status, errorCode, errorMessage, accountId);
}

function upsertAccount(account) {
  // Plaid accounts don't carry their own access_token (it lives on plaid_items, keyed
  // by item_id, since Plaid syncs per-Item rather than per-account like Teller did).
  const encryptedToken = account.access_token ? encrypt(account.access_token) : null;
  return db.prepare(`
    INSERT INTO accounts (
      enrollment_id, account_id, name, official_name, type, subtype,
      institution_name, last_four, access_token, balance_current, balance_available,
      balance_limit, provider, created_at
    ) VALUES (
      @enrollment_id, @account_id, @name, @official_name, @type, @subtype,
      @institution_name, @last_four, @access_token, @balance_current, @balance_available,
      @balance_limit, @provider, datetime('now')
    )
    ON CONFLICT(account_id) DO UPDATE SET
      name = excluded.name,
      official_name = excluded.official_name,
      type = excluded.type,
      subtype = excluded.subtype,
      institution_name = excluded.institution_name,
      last_four = excluded.last_four,
      access_token = excluded.access_token,
      balance_current = excluded.balance_current,
      balance_available = excluded.balance_available,
      balance_limit = excluded.balance_limit
  `).run({ ...account, access_token: encryptedToken, provider: account.provider || 'teller' });
}

/**
 * Finds an existing account that likely represents the same real-world bank
 * account as an incoming Teller account, so a fresh (non-repair) enrollment
 * doesn't fork a second, disconnected row. Prefers institution + last_four
 * (stable across relinks) and falls back to institution + account name (the
 * only other identifier Teller's /accounts response gives us) if that finds
 * nothing. Returns null if a candidate query has more than one match
 * (ambiguous — safer to insert a new row than guess).
 */
function findAccountForRekey(institutionName, name, lastFour) {
  if (lastFour) {
    const byLastFour = db.prepare(`
      SELECT account_id FROM accounts WHERE institution_name = ? AND last_four = ?
    `).all(institutionName, lastFour);
    if (byLastFour.length === 1) return byLastFour[0];
    if (byLastFour.length > 1) return null;
  }
  const byName = db.prepare(`
    SELECT account_id FROM accounts WHERE institution_name = ? AND name = ?
  `).all(institutionName, name);
  return byName.length === 1 ? byName[0] : null;
}

/**
 * Re-enrolling an account (repair or fresh link) can come back with a new
 * Teller account_id for the same physical account. This moves an existing
 * account row (and all its transaction history) onto the new id instead of
 * leaving behind a stale duplicate.
 */
function rekeyAccount(oldAccountId, newAccountId, account) {
  const encryptedToken = encrypt(account.access_token);
  const rekey = db.transaction(() => {
    // transactions.account_id has a (non-deferred) FK into accounts.account_id, so neither
    // retargeting the transactions first (new parent doesn't exist yet) nor renaming the old
    // accounts row first (still-referenced by old id) works directly. Insert the new row,
    // move the transactions onto it, then drop the now-unreferenced old row.
    db.prepare(`
      INSERT INTO accounts (
        enrollment_id, account_id, name, official_name, type, subtype,
        institution_name, last_four, access_token, balance_current, balance_available,
        balance_limit, status, created_at
      ) VALUES (
        @enrollment_id, @newAccountId, @name, @official_name, @type, @subtype,
        @institution_name, @last_four, @access_token, @balance_current, @balance_available,
        @balance_limit, 'active', datetime('now')
      )
    `).run({ ...account, access_token: encryptedToken, newAccountId });
    db.prepare('UPDATE transactions SET account_id = ? WHERE account_id = ?').run(newAccountId, oldAccountId);
    db.prepare('DELETE FROM accounts WHERE account_id = ?').run(oldAccountId);
  });
  rekey();
}

// ── Plaid items ────────────────────────────────────────────────────────────────
// One row per Plaid Item (one institution login, covering all its accounts) — holds
// the access_token and transactions/sync cursor, which Plaid scopes to the Item rather
// than to individual accounts the way Teller did.

function upsertPlaidItem({ item_id, access_token, institution_name }) {
  db.prepare(`
    INSERT INTO plaid_items (item_id, access_token, institution_name, status, created_at)
    VALUES (?, ?, ?, 'active', datetime('now'))
    ON CONFLICT(item_id) DO UPDATE SET
      access_token = excluded.access_token,
      institution_name = excluded.institution_name,
      status = 'active', error_code = NULL, error_message = NULL, status_updated_at = datetime('now')
  `).run(item_id, encrypt(access_token), institution_name);
}

function getPlaidItemByItemId(itemId) {
  const row = db.prepare('SELECT * FROM plaid_items WHERE item_id = ?').get(itemId);
  return row ? { ...row, access_token: decrypt(row.access_token) } : null;
}

function getPlaidItems() {
  return db.prepare('SELECT * FROM plaid_items').all().map(row => ({
    ...row,
    access_token: decrypt(row.access_token),
  }));
}

function setPlaidItemCursor(itemId, cursor) {
  db.prepare('UPDATE plaid_items SET cursor = ? WHERE item_id = ?').run(cursor, itemId);
}

function updatePlaidItemStatus(itemId, status, errorCode, errorMessage) {
  db.prepare(`
    UPDATE plaid_items SET status = ?, error_code = ?, error_message = ?, status_updated_at = datetime('now')
    WHERE item_id = ?
  `).run(status, errorCode, errorMessage, itemId);
}

/** Renames an account for display. Returns false if no account matched. */
function renameAccount(accountId, name) {
  const info = db.prepare('UPDATE accounts SET name = ? WHERE account_id = ?').run(name, accountId);
  return info.changes > 0;
}

/** Hides/unhides an account — pulls it out of every transaction-based view (visible_transactions)
 * while it stays visible in the Accounts tab so it can be un-hidden. Returns false if no match. */
function setAccountHidden(accountId, hidden) {
  const info = db.prepare('UPDATE accounts SET hidden = ? WHERE account_id = ?').run(hidden ? 1 : 0, accountId);
  return info.changes > 0;
}

/**
 * Fully removes a Plaid item's accounts and their transactions (not just the item row) —
 * used when relinking to fix an Item's history window, which Plaid locks in at creation
 * and can't be extended by resyncing. Caller is responsible for calling Plaid's
 * /item/remove first; this only cleans up local state.
 */
function deletePlaidItem(itemId) {
  const remove = db.transaction(() => {
    const accountIds = db.prepare("SELECT account_id FROM accounts WHERE enrollment_id = ? AND provider = 'plaid'")
      .all(itemId).map(r => r.account_id);
    for (const accountId of accountIds) {
      db.prepare('DELETE FROM transactions WHERE account_id = ?').run(accountId);
    }
    db.prepare("DELETE FROM accounts WHERE enrollment_id = ? AND provider = 'plaid'").run(itemId);
    db.prepare('DELETE FROM plaid_items WHERE item_id = ?').run(itemId);
  });
  remove();
}

function upsertTransaction(tx) {
  return db.prepare(`
    INSERT INTO transactions (
      transaction_id, account_id, amount, date, name, merchant_name,
      category, personal_finance_category, pending, payment_channel, created_at
    ) VALUES (
      @transaction_id, @account_id, @amount, @date, @name, @merchant_name,
      @category, @personal_finance_category, @pending, @payment_channel, datetime('now')
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
      account_id                = excluded.account_id,
      amount                    = excluded.amount,
      date                      = excluded.date,
      name                      = excluded.name,
      merchant_name             = excluded.merchant_name,
      pending                   = excluded.pending,
      payment_channel           = excluded.payment_channel,
      category                  = CASE WHEN manually_categorized = 1 THEN category                  ELSE excluded.category                  END,
      personal_finance_category = CASE WHEN manually_categorized = 1 THEN personal_finance_category ELSE excluded.personal_finance_category END
  `).run(tx);
}

// ── Rule application ──────────────────────────────────────────────────────────
const ALLOWED_RULE_FIELDS = new Set(['merchant_name', 'name', 'any']);

function applyRules() {
  const rules = db.prepare('SELECT * FROM rules ORDER BY id ASC').all();
  if (!rules.length) return 0;
  let total = 0;

  function buildCondition(field, type, val) {
    if (type === 'exact')       return [`LOWER(COALESCE(${field},'')) = LOWER(?)`, val];
    if (type === 'starts_with') return [`LOWER(COALESCE(${field},'')) LIKE LOWER(?)`, val + '%'];
    return                             [`LOWER(COALESCE(${field},'')) LIKE LOWER(?)`, '%' + val + '%'];
  }

  for (const rule of rules) {
    if (!ALLOWED_RULE_FIELDS.has(rule.match_field)) continue;
    const cat = normalizeCategory(rule.category);
    ensureCategoryExists(cat); // self-heals rules created before category auto-registration existed
    const catJson = JSON.stringify([cat]);
    const renameTo = rule.rename_to || null;
    let whereSql, whereParams;

    if (rule.match_field === 'any') {
      const [c1, p1] = buildCondition('merchant_name', rule.match_type, rule.match_value);
      const [c2, p2] = buildCondition('name',          rule.match_type, rule.match_value);
      whereSql    = `(${c1} OR ${c2})`;
      whereParams = [p1, p2];
    } else {
      const [cond, p] = buildCondition(rule.match_field, rule.match_type, rule.match_value);
      whereSql    = cond;
      whereParams = [p];
    }

    // Category update respects manually_categorized; rename always applies when set.
    const sql = `
      UPDATE transactions SET
        personal_finance_category = CASE WHEN manually_categorized=0 THEN ? ELSE personal_finance_category END,
        category                  = CASE WHEN manually_categorized=0 THEN ? ELSE category END,
        merchant_name             = CASE WHEN ? IS NOT NULL THEN ? ELSE merchant_name END
      WHERE ${whereSql}
    `;
    total += db.prepare(sql).run(cat, catJson, renameTo, renameTo, ...whereParams).changes;
  }
  return total;
}

function getMeta(key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

function setMeta(key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

module.exports = {
  db, getAccounts, getSafeAccounts, upsertAccount, updateAccountStatus, findAccountForRekey, rekeyAccount,
  upsertPlaidItem, getPlaidItemByItemId, getPlaidItems, setPlaidItemCursor, updatePlaidItemStatus, deletePlaidItem, renameAccount, setAccountHidden,
  upsertTransaction, applyRules, getMeta, setMeta, normalizeCategory, ensureCategoryExists,
};
