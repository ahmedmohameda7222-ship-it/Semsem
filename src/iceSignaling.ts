export type SignalCandidate = {
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
  usernameFragment?: string | null
}

/** Send only browser-defined ICE fields, never arbitrary objects to signaling. */
export function normalizeCandidate(
  value: Record<string, unknown>,
): SignalCandidate | null {
  const candidate = value.candidate
  if (typeof candidate !== 'string' ||
      !candidate.startsWith('candidate:') || candidate.length > 2048)
    return null
  const sdpMid = value.sdpMid
  const sdpMLineIndex = value.sdpMLineIndex
  const usernameFragment = value.usernameFragment
  if (sdpMid != null && (typeof sdpMid !== 'string' || sdpMid.length > 24))
    return null
  if (sdpMLineIndex != null &&
      (typeof sdpMLineIndex !== 'number' || !Number.isInteger(sdpMLineIndex) ||
        sdpMLineIndex < 0 || sdpMLineIndex > 8))
    return null
  if (usernameFragment != null &&
      (typeof usernameFragment !== 'string' || usernameFragment.length > 64))
    return null
  return {
    candidate,
    sdpMid: (sdpMid as string | null) ?? null,
    sdpMLineIndex: (sdpMLineIndex as number | null) ?? null,
    ...(usernameFragment == null ? {} : { usernameFragment: usernameFragment as string }),
  }
}

/** New snapshot entries only; supports both realtime and polling without repeats. */
export function unseenCandidates(
  entries: SignalCandidate[],
  seen: Set<string>,
): SignalCandidate[] {
  const fresh: SignalCandidate[] = []
  for (const entry of entries) {
    const next = normalizeCandidate(entry as unknown as Record<string, unknown>)
    if (!next) continue
    const key = [next.candidate, next.sdpMid, next.sdpMLineIndex, next.usernameFragment].join('|')
    if (!seen.has(key)) {
      seen.add(key)
      fresh.push(next)
    }
  }
  return fresh
}
