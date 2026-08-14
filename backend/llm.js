const axios = require('axios');
const { db, normalizeCategory, ensureCategoryExists } = require('./db');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://host.docker.internal:5002';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const BATCH_SIZE = 20;

const BUILT_IN_CATEGORIES = [
  'Food and Drink', 'Groceries', 'Restaurants', 'Coffee Shop', 'Fast Food',
  'Shopping', 'Clothing', 'Electronics', 'Home Improvement', 'General Merchandise',
  'Transportation', 'Gas', 'Parking', 'Public Transit', 'Rideshare',
  'Entertainment', 'Streaming', 'Games', 'Sports',
  'Health', 'Pharmacy', 'Doctor', 'Dental', 'Fitness', 'Gym',
  'Bills', 'Utilities', 'Phone', 'Internet', 'Insurance',
  'Travel', 'Hotel', 'Flight', 'Vacation',
  'Income', 'Payroll', 'Transfer', 'Refund',
  'Education', 'Subscriptions', 'Personal Care', 'Pets', 'Other',
];

function getValidCategories() {
  const custom = db.prepare('SELECT name FROM custom_categories ORDER BY name ASC').all().map(r => r.name);
  return [...new Set([...BUILT_IN_CATEGORIES, ...custom])];
}

async function categorizeBatch(merchants, validCategories) {
  const merchantList = merchants.map((m, i) => `${i + 1}. ${m}`).join('\n');
  const catList = validCategories.join(', ');

  const prompt = `You are a financial transaction categorizer. For each merchant, provide 3 possible categories ranked by best fit (rank 1 = most likely).

Valid categories: ${catList}

Merchants to categorize:
${merchantList}

Rules:
- Use only categories from the list above
- Rank based on what the merchant most likely sells or provides
- Respond ONLY with valid JSON, no explanation, no markdown fences

Format: {"Merchant Name": ["BestCategory", "SecondChoice", "ThirdChoice"], ...}`;

  const res = await axios.post(`${OLLAMA_URL}/api/chat`, {
    model: OLLAMA_MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    options: { temperature: 0.1 },
  }, { timeout: 90_000, headers: { 'X-App-Name': 'expenses' } });

  const content = res.data.message?.content || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`LLM returned no JSON. Response: ${content.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]);
}

async function runLLMCategorization() {
  const rows = db.prepare(`
    SELECT COALESCE(merchant_name, name) AS merchant, COUNT(*) AS cnt
    FROM transactions
    WHERE (personal_finance_category IS NULL OR personal_finance_category = '')
      AND manually_categorized = 0
      AND COALESCE(merchant_name, name) IS NOT NULL
    GROUP BY merchant
    ORDER BY cnt DESC
  `).all();

  if (rows.length === 0) {
    console.log('[llm] No uncategorized merchants.');
    return { processed: 0, suggested: 0 };
  }

  const existingSet = new Set(
    db.prepare('SELECT merchant FROM llm_suggestions').all().map(r => r.merchant)
  );
  const toProcess = rows.filter(r => !existingSet.has(r.merchant));

  if (toProcess.length === 0) {
    console.log('[llm] All uncategorized merchants already have suggestions.');
    return { processed: 0, suggested: 0 };
  }

  console.log(`[llm] Sending ${toProcess.length} merchants to ${OLLAMA_MODEL}…`);
  const validCategories = getValidCategories();
  let suggested = 0;

  const upsert = db.prepare(`
    INSERT INTO llm_suggestions (merchant, suggested_category, alt_categories, transaction_count, status)
    VALUES (?, ?, ?, ?, 'accepted')
    ON CONFLICT(merchant) DO UPDATE SET
      suggested_category = excluded.suggested_category,
      alt_categories     = excluded.alt_categories,
      transaction_count  = excluded.transaction_count,
      status             = 'accepted',
      created_at         = datetime('now')
  `);

  const applyTx = db.prepare(`
    UPDATE transactions SET
      personal_finance_category = ?,
      category                  = ?,
      manually_categorized      = 0
    WHERE COALESCE(merchant_name, name) = ?
      AND (personal_finance_category IS NULL OR personal_finance_category = '')
      AND manually_categorized = 0
  `);

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const merchants = batch.map(r => r.merchant);

    try {
      const result = await categorizeBatch(merchants, validCategories);
      const insertBatch = db.transaction(() => {
        for (const row of batch) {
          const raw = result[row.merchant];
          const ranked = (Array.isArray(raw) ? raw : (raw ? [raw] : [])).map(normalizeCategory).filter(Boolean);
          const cat = ranked[0];
          if (cat) {
            ranked.forEach(ensureCategoryExists);
            const alts = JSON.stringify(ranked.slice(1));
            upsert.run(row.merchant, cat, alts, row.cnt);
            applyTx.run(cat, JSON.stringify([cat]), row.merchant);
            suggested++;
          }
        }
      });
      insertBatch();
      console.log(`[llm] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} merchants → ${Object.keys(result).length} applied`);
    } catch (err) {
      console.error(`[llm] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message);
    }
  }

  console.log(`[llm] Done — ${suggested}/${toProcess.length} categories auto-applied.`);
  return { processed: toProcess.length, suggested };
}

module.exports = { runLLMCategorization, getValidCategories };
