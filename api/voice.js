import { createHash } from 'node:crypto'
import { backend, post } from '../server/supabase.js'
import { allowedEndpoint, sendWebPush } from '../server/push.js'
import { iceConfiguration } from '../server/ice.js'


export default async function handler(req, res) {
  try {
    if (!post(req, res)) return
    const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) return res.status(401).end()
    const db = backend()
    const {
      data: { user },
    } = await db.auth.getUser(token)
    if (!user) return res.status(401).end()
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id,nickname')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile) return res.status(403).end()
    const { action, call } = req.body ?? {}
    if (action === 'ice') {
      const key = process.env.CLOUDFLARE_TURN_KEY_ID
      const secret = process.env.CLOUDFLARE_TURN_API_TOKEN
      if (key && secret) {
        const bucket = createHash('sha256').update(user.id).digest('hex')
        const { data: allowed, error } = await db.rpc('consume_otp', {
          bucket_key: 'voice:ice:' + bucket,
          max_hits: 30,
          window_seconds: 600,
        })
        if (error) throw error
        if (!allowed) return res.status(429).end()
      }
      return res.json(await iceConfiguration({ key, secret }))
    }
    if (
      action !== 'notify' ||
      typeof call !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(call)
    )
      return res.status(400).end()
    const { data: invite, error } = await db
      .from('voice_calls')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', call)
      .eq('caller_id', user.id)
      .eq('status', 'ringing')
      .gt('expires_at', new Date().toISOString())
      .is('notified_at', null)
      .select('recipient_id,expires_at')
      .maybeSingle()
    if (error) throw error
    if (!invite) return res.status(204).end()
    const { data: subscriptions, error: subError } = await db
      .from('push_subscriptions')
      .select('endpoint,keys')
      .eq('user_id', invite.recipient_id)
    if (subError) throw subError
    const ttl = Math.max(
      0,
      Math.ceil((Date.parse(invite.expires_at) - Date.now()) / 1000),
    )
    const targets = ttl
      ? subscriptions.filter((sub) => allowedEndpoint(sub.endpoint))
      : []
    const results = await Promise.all(
      targets.map(async (sub) => {
        try {
          await sendWebPush(
            sub,
            {
              call,
              title: profile.nickname + ' ❤️',
              body: 'Incoming voice call',
            },
            call,
            ttl,
            'high',
          )
          return true
        } catch (error) {
          if ([404, 410].includes(error.statusCode)) {
            await db
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint)
              .eq('user_id', invite.recipient_id)
          }
          return false
        }
      }),
    )
    return res.json({
      attempted: targets.length,
      accepted: results.filter(Boolean).length,
    })
  } catch {
    return res.status(503).end()
  }
}
