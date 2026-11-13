export type RecoveryConnectionState = 'connected' | 'disconnected' | 'failed' | 'connecting'

/** A short WebRTC disconnect is not a reason to hang up or flash Connecting. */
export function connectionRecoveryPlan(
  state: RecoveryConnectionState, previousAttempts: number,
): { waitMs: number; terminate: boolean } {
  if (state === 'connected' || state === 'connecting')
    return { waitMs: 0, terminate: false }
  if (previousAttempts >= 3)
    return { waitMs: 0, terminate: true }
  if (state === 'disconnected') return { waitMs: 3000, terminate: false }
  return { waitMs: previousAttempts === 0 ? 0 : 9000, terminate: false }
}

type RouteRow = {
  id?: string
  type?: string
  nominated?: boolean
  state?: string
  selectedCandidatePairId?: string
  localCandidateId?: string
  candidateType?: string
}

/** Selected ICE path, not just the existence of TURN credentials. */
export function selectedAudioRoute(rows: Iterable<RouteRow>): string {
  const stats = Array.from(rows)
  const byId = new Map(stats.map((row) => [row.id, row]))
  const transport = stats.find((row) =>
    row.type === 'transport' && row.selectedCandidatePairId)
  const pair = (transport
    ? byId.get(transport.selectedCandidatePairId)
    : undefined) ?? stats.find((row) =>
    row.type === 'candidate-pair' &&
    row.state === 'succeeded' && row.nominated)
  if (!pair?.localCandidateId) return 'Audio route connected'
  const candidate = byId.get(pair.localCandidateId)
  if (candidate?.candidateType === 'relay') return 'TURN relay route'
  if (['host','srflx','prflx'].includes(candidate?.candidateType ?? ''))
    return 'Direct peer-to-peer route'
  return 'Audio route connected'
}

type NavigatorWithAudio = { audioSession?: { type: string } }

/** The OS may still suspend a PWA in background; this is not an override. */
export function configureCallAudioSession(navigatorLike: NavigatorWithAudio): boolean {
  try {
    if (!navigatorLike.audioSession) return false
    navigatorLike.audioSession.type = 'play-and-record'
    return true
  } catch {
    return false
  }
}

export function microphoneNeedsRecovery(track: {
  readyState: string
  muted: boolean
} | null | undefined): boolean {
  return !track || track.readyState !== 'live' || track.muted
}
