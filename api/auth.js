import { createHash } from 'node:crypto'
import { backend, post } from '../server/supabase.js'

export default async function handler(req, res) {
  try {
    if (!post(req, res)) return
    const { profile, action, code } = req.body ?? {}
    if (
      !['sasa', 'semsem'].includes(profile) ||
      !['request', 'verify'].includes(action)
    ) {
      return res.status(400).json({ error: 'Choose a profile to continue.' })
    }
    if (
      action === 'verify' &&
      (typeof code !== 'string' || !/^\d{6}$/.test(code))
    ) {
      return res.status(400).json({ error: 'Enter the six-digit code.' })
    }
    const db = backend()
    const ip =
      req.headers['x-vercel-forwarded-for'] ??
      req.socket?.remoteAddress ??
      'unknown'
    const ipHash = createHash('sha256').update(String(ip)).digest('hex')
    const buckets = [
      {
        bucket_key: action + ':ip:' + ipHash,
        max_hits: action === 'verify' ? 20 : 6,
        window_seconds: 900,
      },
      {
        bucket_key: action + ':profile:' + profile,
        max_hits: action === 'verify' ? 30 : 5,
        window_seconds: 900,
      },
    ]
    for (const bucket of buckets) {
      const { data, error } = await db.rpc('consume_otp', bucket)
      if (error) throw error
      if (!data)
        return res
          .status(429)
          .json({ error: 'Please wait before trying again.' })
    }
    const { data: profileRow, error } = await db
      .from('profiles')
      .select('id')
      .eq('stable_key', profile)
      .maybeSingle()
    if (error) throw error
    if (!profileRow)
      return res
        .status(503)
        .json({ error: 'Sign-in is temporarily unavailable.' })
    const { data: account, error: accountError } =
      await db.auth.admin.getUserById(profileRow.id)
    if (accountError || !account.user.email || !account.user.email_confirmed_at)
      throw new Error('Account unavailable')
    const email = account.user.email
    const auth = backend(process.env.SUPABASE_PUBLISHABLE_KEY).auth
    if (action === 'request') {
      const { error: requestError } = await auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      })
      if (requestError)
        return res
          .status(requestError.status === 429 ? 429 : 503)
          .json({ error: 'Could not send a code. Please try again shortly.' })
      return res.json({ sent: true })
    }
    const { data, error: verifyError } = await auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })
    if (verifyError || !data.session || data.user?.id !== profileRow.id) {
      return res
        .status(401)
        .json({ error: 'This code is incorrect or has expired.' })
    }
    return res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
  } catch {
    return res
      .status(503)
      .json({ error: 'Sign-in is temporarily unavailable.' })
  }
}
