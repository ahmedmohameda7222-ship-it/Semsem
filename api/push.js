import { randomUUID } from 'node:crypto'
import { backend, post } from '../server/supabase.js'
import { allowedEndpoint, deliverPush, sendWebPush } from '../server/push.js'

export default async function handler(req, res) {
  try {
    if (!post(req, res)) return
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1]
    if (!bearer) return res.status(401).end()
    const db = backend()
    const {
      data: { user },
    } = await db.auth.getUser(bearer)
    if (!user) return res.status(401).end()
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile) return res.status(403).end()
    const { action, endpoint, keys } = req.body ?? {}
    if (action === 'flush') {
      await deliverPush()
      return res.status(204).end()
    }
    if (action === 'test') {
      const { data: limited, error: limitError } = await db.rpc('consume_otp', {
        bucket_key: 'push:test:' + user.id,
        max_hits: 3,
        window_seconds: 600,
      })
      if (limitError) throw limitError
      if (!limited) return res.status(429).json({ message: 'Try again in a few minutes.' })
      const { data: subscriptions, error: listError } = await db
        .from('push_subscriptions')
        .select('endpoint,keys')
        .eq('user_id', user.id)
      if (listError) throw listError
      if (!subscriptions?.length)
        return res.status(409).json({ message: 'No device registered. Disable and enable notifications.' })
      let accepted = 0
      for (const sub of subscriptions) {
        if (!allowedEndpoint(sub.endpoint)) continue
        try {
          const id = randomUUID()
          await sendWebPush(sub, {
            entry: id,
            title: 'Our Space · Test notification',
            body: 'A test notification for this device ♡',
            test: true,
          }, id, 180)
          accepted++
        } catch (failure) {
          if ([404, 410].includes(failure?.statusCode)) {
            await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).eq('user_id', user.id)
          }
        }
      }
      return res.status(200).json({ accepted, devices: subscriptions.length })
    }
    if (!allowedEndpoint(endpoint)) return res.status(400).end()
    if (action === 'remove') {
      const { error } = await db
        .from('push_subscriptions')
        .delete()
        .match({ endpoint, user_id: user.id })
      if (error) throw error
    } else if (
      action === 'register' &&
      typeof keys?.p256dh === 'string' &&
      typeof keys?.auth === 'string' &&
      /^[A-Za-z0-9_-]{87}$/.test(keys.p256dh) &&
      /^[A-Za-z0-9_-]{22}$/.test(keys.auth)
    ) {
      const { error: schedulerError } = await db.rpc('setup_push_scheduler', {
        origin: process.env.VAPID_SUBJECT,
        token: process.env.CRON_SECRET,
      })
      if (schedulerError) throw schedulerError
      const { error } = await db
        .from('push_subscriptions')
        .upsert(
          { endpoint, user_id: user.id, keys },
          { onConflict: 'endpoint', ignoreDuplicates: true },
        )
      if (error) throw error
      const { data } = await db
        .from('push_subscriptions')
        .select('user_id')
        .eq('endpoint', endpoint)
        .single()
      if (data?.user_id !== user.id) return res.status(409).end()
    } else {
      return res.status(400).end()
    }
    return res.status(204).end()
  } catch {
    return res.status(503).end()
  }
}
