type ExistingPush = {
  endpoint: string
  toJSON: () => {
    endpoint?: string | null
    keys?: { p256dh?: string; auth?: string } | null
  }
}

type Dependencies = {
  permission: () => string
  existing: () => Promise<ExistingPush | null>
  register: (fields: {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }) => Promise<void>
}

/**
 * The push provider may revoke a server-side subscription while iOS still
 * reports that notifications are enabled. Reconcile that existing subscription
 * on foreground/reconnect, without requesting permission or creating a new one.
 */
export async function restorePushSubscription({
  permission,
  existing,
  register,
}: Dependencies): Promise<boolean> {
  if (permission() !== 'granted') return false
  const subscription = await existing()
  if (!subscription) return false
  const json = subscription.toJSON()
  const endpoint = json.endpoint ?? subscription.endpoint
  const keys = json.keys
  if (!endpoint || !keys?.p256dh || !keys.auth) return false
  await register({
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  })
  return true
}
