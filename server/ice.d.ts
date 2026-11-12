export type IceConfiguration = {
  iceServers: RTCIceServer[]
  relay: boolean
}

export function iceConfiguration(params: {
  key?: string | null
  secret?: string | null
  fetcher?: typeof fetch
}): Promise<IceConfiguration>
