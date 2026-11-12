import { timingSafeEqual } from 'node:crypto'
import { deliverPush } from '../server/push.js'

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const expected = Buffer.from('Bearer ' + (secret ?? ''))
  const provided = Buffer.from(req.headers.authorization ?? '')
  if (
    !secret ||
    req.method !== 'GET' ||
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return res.status(401).end()
  }
  try {
    await deliverPush()
    return res.status(204).end()
  } catch {
    return res.status(503).end()
  }
}
