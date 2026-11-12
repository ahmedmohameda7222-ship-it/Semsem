import { randomUUID } from 'node:crypto'
import webpush from 'web-push'
import { pushPayload } from './pushPayload.js'
import { backend } from './supabase.js'

export function allowedEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      (url.hostname.endsWith('.push.apple.com') ||
        ['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(
          url.hostname,
        ))
    )
  } catch {
    return false
  }
}

export async function deliverPush() {
  const db = backend()
  const lease = randomUUID()
  const { data, error } = await db.rpc('claim_push', { lease_id: lease })
  if (error) throw error
  await Promise.all(
    data.map(async (job) => {
      const match = { event_id: job.event_id, endpoint: job.endpoint, lease }
      let update
      try {
        if (!allowedEndpoint(job.endpoint))
          throw new Error('Unsupported push endpoint')
        await webpush.sendNotification(
          { endpoint: job.endpoint, keys: job.keys },
          JSON.stringify(pushPayload(job)),
          {
            TTL: 3600,
            topic: job.event_id.replaceAll('-', ''),
            timeout: 7000,
            vapidDetails: {
              subject: process.env.VAPID_SUBJECT,
              publicKey: process.env.VAPID_PUBLIC_KEY,
              privateKey: process.env.VAPID_PRIVATE_KEY,
            },
          },
        )
        update = { delivered_at: new Date().toISOString() }
      } catch (failure) {
        if ([404, 410].includes(failure.statusCode)) {
          const { error: removeError } = await db
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', job.endpoint)
          if (removeError) throw removeError
          return
        }
        update = {
          next_attempt: new Date(
            Date.now() + Math.min(2 ** job.attempts * 30000, 3600000),
          ).toISOString(),
        }
      }
      const { error: updateError } = await db
        .from('notification_deliveries')
        .update(update)
        .match(match)
      if (updateError) throw updateError
    }),
  )
}
