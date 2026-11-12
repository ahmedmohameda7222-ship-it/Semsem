import { createClient } from '@supabase/supabase-js'

export function backend(key = process.env.SUPABASE_SERVICE_ROLE_KEY) {
  return createClient(process.env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function post(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).end()
    return false
  }
  if (
    req.headers.origin &&
    new URL(req.headers.origin).host !== req.headers.host
  ) {
    res.status(403).end()
    return false
  }
  return true
}
