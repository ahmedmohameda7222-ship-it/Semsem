const stun = Object.freeze([{ urls: 'stun:stun.cloudflare.com:3478' }])

/**
 * WebRTC can connect directly over STUN on permissive networks. A broken TURN
 * provider must not prevent an otherwise working P2P call from starting.
 * Never include the administrative TURN key in the response or logs.
 */
export async function iceConfiguration({ key, secret, fetcher = fetch }) {
  const direct = { iceServers: [...stun], relay: false }
  if (!key || !secret) return direct
  try {
    const response = await fetcher(
      'https://rtc.live.cloudflare.com/v1/turn/keys/' +
        encodeURIComponent(key) +
        '/credentials/generate-ice-servers',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + secret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 3600 }),
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!response.ok) return direct
    const data = await response.json()
    const servers = Array.isArray(data.iceServers)
      ? data.iceServers
      : [data.iceServers]
    const relay = servers.some(
      (server) =>
        server &&
        typeof server.username === 'string' &&
        typeof server.credential === 'string' &&
        [server.urls].flat().some(
          (url) => typeof url === 'string' && /^turns?:/.test(url),
        ),
    )
    if (!relay) return direct
    return { iceServers: [...stun, ...servers], relay: true }
  } catch {
    return direct
  }
}
