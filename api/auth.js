import { createHash } from 'node:crypto'
import { backend, post } from '../server/supabase.js'

export default async function handler(req, res) {
  try {
    if (!post(req, res)) return
    const { profile, action, code, password } = req.body ?? {}
    const otpEnabled = process.env.OUR_SPACE_AUTH_MODE === 'otp'
    const actions = otpEnabled ? ['request', 'verify'] : ['password']
    if (!['sasa', 'semsem'].includes(profile) || !actions.includes(action)) {
      return res.status(400).json({ error: 'Choose a profile to continue.' })
    }
    if (
      action === 'verify' &&
      (typeof code !== 'string' || !/^\d{6}$/.test(code))
    ) {
      return res.status(400).json({ error: 'Enter the six-digit code.' })
    }
    if (
      action === 'password' &&
      (typeof password !== 'string' ||
        password.length === 0 ||
        password.length > 4096)
    ) {
      return res.status(400).json({ error: 'Enter your account password.' })
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
        max_hits: action === 'password' ? 12 : action === 'verify' ? 20 : 6,
        window_seconds: 900,
      },
      {
        bucket_key: action + ':profile:' + profile,
        max_hits: action === 'password' ? 18 : action === 'verify' ? 30 : 5,
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
    if (
      accountError ||
      !account?.user?.email ||
      !account.user.email_confirmed_at
    )
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
    const { data, error: verifyError } =
      action === 'password'
        ? await auth.signInWithPassword({ email, password })
        : await auth.verifyOtp({ email, token: code, type: 'email' })
    if (verifyError?.status === 429) {
      return res.status(429).json({ error: 'Please wait before trying again.' })
    }
    if (verifyError && (!verifyError.status || verifyError.status >= 500)) {
      throw new Error('Authentication provider unavailable')
    }
    if (verifyError || !data.session || data.user?.id !== profileRow.id) {
      return res
        .status(401)
        .json({
          error:
            action === 'password'
              ? 'The password is incorrect for this profile.'
              : 'This code is incorrect or has expired.',
        })
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
