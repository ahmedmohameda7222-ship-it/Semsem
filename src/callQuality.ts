export type AudioQualitySample = {
  jitterSeconds?: number
  roundTripSeconds?: number
  fractionLost?: number
  packetsLost?: number
  packetsReceived?: number
}

type AudioStatRow = {
  type?: string
  kind?: string
  mediaType?: string
  jitter?: number
  roundTripTime?: number
  fractionLost?: number
  packetsLost?: number
  packetsReceived?: number
  nominated?: boolean
  state?: string
  currentRoundTripTime?: number
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Ignore video and unavailable iOS stats instead of treating them as bad audio. */
export function extractAudioQuality(rows: Iterable<AudioStatRow>): AudioQualitySample {
  const sample: AudioQualitySample = {}
  let fallbackRtt: number | undefined
  for (const row of rows) {
    const audio = row.kind === 'audio' || row.mediaType === 'audio'
    if (row.type === 'inbound-rtp' && audio) {
      if (finite(row.jitter))
        sample.jitterSeconds = Math.max(sample.jitterSeconds ?? 0, row.jitter)
      if (finite(row.packetsLost)) sample.packetsLost = row.packetsLost
      if (finite(row.packetsReceived)) sample.packetsReceived = row.packetsReceived
    } else if (row.type === 'remote-inbound-rtp' && audio) {
      if (finite(row.roundTripTime))
        sample.roundTripSeconds = row.roundTripTime
      if (finite(row.fractionLost))
        sample.fractionLost = row.fractionLost
    } else if (row.type === 'candidate-pair' && row.nominated &&
               row.state === 'succeeded' && finite(row.currentRoundTripTime)) {
      fallbackRtt = row.currentRoundTripTime
    }
  }
  sample.roundTripSeconds ??= fallbackRtt
  return sample
}

/** A warning requires sustained degradation and is rate-limited across causes. */
export class NetworkQualityWatch {
  private previous?: { lost: number; received: number }
  private badSamples = 0
  private lastAlert = -Infinity

  sample(sample: AudioQualitySample, now: number): boolean {
    let packetLoss = false
    if (finite(sample.packetsLost) && finite(sample.packetsReceived)) {
      const current = {
        lost: Math.max(0, sample.packetsLost),
        received: Math.max(0, sample.packetsReceived),
      }
      if (this.previous) {
        const deltaLost = current.lost - this.previous.lost
        const deltaReceived = current.received - this.previous.received
        const total = deltaLost + deltaReceived
        packetLoss = deltaLost > 0 && deltaReceived >= 0 &&
          total >= 20 && deltaLost / total >= 0.08
      }
      this.previous = current
    }
    const bad =
      (finite(sample.jitterSeconds) && sample.jitterSeconds > 0.11) ||
      (finite(sample.roundTripSeconds) && sample.roundTripSeconds > 0.85) ||
      (finite(sample.fractionLost) && sample.fractionLost >= 0.10) ||
      packetLoss
    this.badSamples = bad ? Math.min(2, this.badSamples + 1) : 0
    if (this.badSamples >= 2 && now - this.lastAlert >= 30000) {
      this.lastAlert = now
      this.badSamples = 0
      return true
    }
    return false
  }

  disconnected(now: number): boolean {
    this.badSamples = 0
    if (now - this.lastAlert < 30000) return false
    this.lastAlert = now
    return true
  }
}

/** Live and saved call lengths, without displaying a fictitious duration. */
export function formatCallDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const minutes = Math.floor(safe / 60)
  const secs = String(safe % 60).padStart(2, '0')
  if (minutes >= 60)
    return Math.floor(minutes / 60) + ':' +
      String(minutes % 60).padStart(2, '0') + ':' + secs
  return String(minutes).padStart(2, '0') + ':' + secs
}

export function formatTalkTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  return hours ? hours + 'h ' + minutes + 'm' : (safe < 60 ? '0 min' : minutes + 'm')
}
