const stun = Object.freeze([{ urls: 'stun:stun.cloudflare.com:3478' }])

// Only short-lived TURN credentials reach the authenticated browser.
// Never expose Cloudflare long-lived key IDs, bearer tokens or provider bodies.
export async function iceConfiguration({ key, secret, fetcher = fetch }) {
  const unavailable = (turnStatus) => ({
    iceServers: [...stun],
    relay: false,
    turnStatus,
  })
  const keyId = typeof key === 'string' ? key.trim() : ''
  const apiToken = typeof secret === 'string' ? secret.trim() : ''
  if (!keyId || !apiToken) return unavailable('not_configured')

  try {
    const response = await fetcher(
      'https://rtc.live.cloudflare.com/v1/turn/keys/' +
        encodeURIComponent(keyId) +
        '/credentials/generate-ice-servers',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 3600 }),
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        return unavailable('auth_error')
      if (response.status === 404) return unavailable('invalid_key')
      if (response.status === 429) return unavailable('rate_limited')
      return unavailable('provider_error')
    }
    const data = await response.json()
    const servers = Array.isArray(data?.iceServers) ? data.iceServers : []
    const turnServers = servers
      .filter((server) =>
        server &&
        typeof server.username === 'string' &&
        typeof server.credential === 'string',
      )
      .map((server) => ({
        urls: [server.urls].flat().filter(
          (url) => typeof url === 'string' &&
            /^turns?:/i.test(url) &&
            !/:53(?:\?|$)/.test(url),
        ),
        username: server.username,
        credential: server.credential,
      }))
      .filter((server) => server.urls.length > 0)
    if (!turnServers.length) return unavailable('invalid_response')
    return {
      iceServers: [...stun, ...turnServers],
      relay: true,
      turnStatus: 'ready',
    }
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
      return unavailable('timeout')
    return unavailable('network_error')
  }
}
