import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const BUILT_IN = [
  'accommodation', 'advertising', 'bar', 'charity', 'clothing', 'coffee',
  'dining', 'education', 'electronics', 'entertainment', 'fees', 'fuel',
  'general', 'groceries', 'health', 'home', 'income', 'insurance',
  'investment', 'loan', 'medical', 'personal care', 'service', 'shopping',
  'subscription', 'tax', 'transfer', 'transport', 'utilities',
]

export function useCategories() {
  const [custom, setCustom] = useState([])

  const load = useCallback(() => {
    axios.get('/api/categories')
      .then(r => setCustom(r.data))
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const customNames = custom.map(c => c.name)
  const all = [...new Set([...BUILT_IN, ...customNames])].sort()

  return { all, custom, reload: load, BUILT_IN }
}
