export type IceConfiguration = {
  iceServers: RTCIceServer[]
  relay: boolean
  turnStatus: 'ready' | 'not_configured' | 'auth_error' | 'invalid_key' | 'rate_limited' | 'provider_error' | 'invalid_response' | 'timeout' | 'network_error'
}

export function iceConfiguration(params: {
  key?: string | null
  secret?: string | null
  fetcher?: typeof fetch
}): Promise<IceConfiguration>
