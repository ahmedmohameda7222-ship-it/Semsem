export type TurnStatus =
  | 'ready'
  | 'not_configured'
  | 'auth_error'
  | 'invalid_key'
  | 'rate_limited'
  | 'provider_error'
  | 'invalid_response'
  | 'timeout'
  | 'network_error'

/**
 * Only known server-generated status codes can reach the UI. In particular,
 * never render arbitrary Cloudflare response text or administrative secrets.
 */
export function turnStatusMessage(code: string | null | undefined): string {
  switch (code) {
    case 'ready':
      return ''
    case 'not_configured':
      return 'Cloudflare TURN is not configured for this deployment. Calls across different Wi-Fi networks may fail.'
    case 'auth_error':
      return 'Cloudflare rejected the TURN credentials. Check the TURN Key ID and its matching API Token in Vercel.'
    case 'invalid_key':
      return 'Cloudflare cannot find this TURN Key ID. Verify the key ID in Vercel.'
    case 'rate_limited':
      return 'Cloudflare TURN is rate-limiting requests. Try again shortly.'
    case 'provider_error':
      return 'Cloudflare TURN is currently unavailable. Trying a direct connection.'
    case 'invalid_response':
      return 'Cloudflare did not supply usable TURN relay credentials. Check the TURN key configuration.'
    case 'timeout':
      return 'Cloudflare TURN timed out. Trying a direct connection.'
    case 'network_error':
      return 'The server could not reach Cloudflare TURN. Trying a direct connection.'
    default:
      return 'TURN relay unavailable; trying a direct connection.'
  }
}
