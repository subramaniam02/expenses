// Categories are stored lowercase (case-insensitive to avoid "Groceries"/"groceries"
// duplicates) — this is the single place that turns them into a display label.
export function formatCat(cat, fallback = 'Uncategorized') {
  if (!cat) return fallback
  return cat.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}
