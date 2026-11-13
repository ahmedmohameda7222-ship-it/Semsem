import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, Mic, MicOff, Phone, PhoneOff, Volume2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { db, unwrap } from './data'
import type { Profile } from './data'
import { formatElapsed } from './elapsed'
import { Avatar } from './ui'
import { turnStatusMessage } from './callNetwork'
import { normalizeCandidate, unseenCandidates } from './iceSignaling'
import type { SignalCandidate } from './iceSignaling'

type Invite = {
  id: string
  caller_id: string
  recipient_id: string
  status: 'ringing' | 'answered' | 'declined' | 'cancelled' | 'missed' | 'ended'
  offer: string | null
  answer: string | null
  caller_candidates?: SignalCandidate[]
  recipient_candidates?: SignalCandidate[]
  expires_at: string
}
type Call = {
  id: string
  state: 'incoming' | 'calling' | 'connecting' | 'connected'
  offer?: string
  remoteCandidates?: SignalCandidate[]
  expires?: number
}
const context = createContext<{ start: () => void; disabled: boolean } | null>(
  null,
)

async function requestVoice(action: 'ice' | 'notify', call?: string) {
  const {
    data: { session },
  } = await db.auth.getSession()
  if (!session) throw new Error('Sign in again to make a call.')
  const response = await fetch('/api/voice', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, call }),
  })
  if (!response.ok)
    throw new Error('The call service is temporarily unavailable.')
  if (action === 'ice')
    return (await response.json()) as { iceServers: RTCIceServer[]; relay: boolean; turnStatus?: string }
  return { iceServers: [], relay: false }
}

export function VoiceCallButton() {
  const calls = useContext(context)
  return (
    <button
      className="chat-action"
      aria-label="Start voice call"
      disabled={!calls || calls.disabled}
      onClick={() => calls?.start()}
    >
      <Phone size={18} />
    </button>
  )
}

export function VoiceCallProvider({
  me,
  partner,
  children,
}: {
  me: Profile
  partner?: Profile
  children: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const link = new URLSearchParams(location.search).get('call')
  const [call, setCall] = useState<Call>()
  const [message, setMessage] = useState('')
  const [minimized, setMinimized] = useState(false)
  const [muted, setMuted] = useState(false)
  const [started, setStarted] = useState<number>()
  const [seconds, setSeconds] = useState(0)
  const [playbackBlocked, setPlaybackBlocked] = useState(false)
  const [relayAvailable, setRelayAvailable] = useState<boolean | null>(null)
  const [turnStatus, setTurnStatus] = useState<string | null>(null)
  const [networkStatus, setNetworkStatus] = useState('')
  const [audioRoute, setAudioRoute] = useState('')

  const active = useRef<Call | undefined>(undefined)
  const peer = useRef<RTCPeerConnection | null>(null)
  const microphone = useRef<MediaStream | null>(null)
  const playback = useRef<HTMLAudioElement>(null)
  const startedAt = useRef<number | undefined>(undefined)
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const appliedAnswer = useRef<string | undefined>(undefined)
  const locallyEnded = useRef(new Set<string>())
  const audioContext = useRef<AudioContext | null>(null)
  const handler = useRef<(invite: Invite) => void>(() => {})
  const endOnUnmount = useRef<() => void>(() => {})
  // Local candidates are buffered until the call invitation/answer is committed.
  const pendingLocalIce = useRef<SignalCandidate[]>([])
  const localIceReady = useRef(false)
  const localIceFlushing = useRef(false)
  const localIceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingRemoteIce = useRef<SignalCandidate[]>([])
  const seenRemoteIce = useRef(new Set<string>())
  const remoteIceFlushing = useRef(false)


  function show(next?: Call) {
    active.current = next
    setCall(next)
  }

  function release() {
    clearTimeout(timeout.current)
    clearTimeout(localIceTimer.current)
    pendingLocalIce.current = []
    localIceReady.current = false
    localIceFlushing.current = false
    pendingRemoteIce.current = []
    seenRemoteIce.current.clear()
    remoteIceFlushing.current = false
    if (peer.current) {
      peer.current.onconnectionstatechange = null
      peer.current.ontrack = null
      peer.current.close()
      peer.current = null
    }
    microphone.current?.getTracks().forEach((track) => track.stop())
    microphone.current = null
    if (playback.current) playback.current.srcObject = null
    startedAt.current = undefined
    appliedAnswer.current = undefined
    setStarted(undefined)
    setSeconds(0)
    setMuted(false)
    setPlaybackBlocked(false)
    setRelayAvailable(null)
    setTurnStatus(null)
    setNetworkStatus('')
    setAudioRoute('')
    show(undefined)
  }

  // Use durable authorized database signaling, with Realtime updates and
  // periodic reads as fallbacks. Do not block ringing on candidate discovery.
  function scheduleLocalIce(id: string, delay = 160) {
    if (active.current?.id !== id || !localIceReady.current ||
        localIceTimer.current || !pendingLocalIce.current.length) return
    localIceTimer.current = setTimeout(() => {
      localIceTimer.current = undefined
      void flushLocalIce(id)
    }, delay)
  }

  async function flushLocalIce(id: string) {
    if (localIceFlushing.current || !localIceReady.current ||
        active.current?.id !== id) return
    localIceFlushing.current = true
    let retry = false
    try {
      while (active.current?.id === id && localIceReady.current &&
             pendingLocalIce.current.length) {
        const batch = pendingLocalIce.current.slice(0, 10)
        const { error } = await db.rpc('push_voice_candidates', {
          call_id: id, candidate_list: batch,
        })
        if (error) { retry = true; break }
        pendingLocalIce.current.splice(0, batch.length)
      }
    } finally {
      localIceFlushing.current = false
      scheduleLocalIce(id, retry ? 1200 : 160)
    }
  }

  async function flushRemoteIce(id: string) {
    const connection = peer.current
    if (!connection || !connection.remoteDescription ||
        remoteIceFlushing.current || active.current?.id !== id) return
    remoteIceFlushing.current = true
    try {
      while (pendingRemoteIce.current.length && active.current?.id === id &&
             peer.current === connection) {
        const candidate = pendingRemoteIce.current.shift()!
        try {
          await connection.addIceCandidate(candidate)
        } catch {
          // ICE may reject a stale candidate after a network switch; continue.
        }
      }
    } finally {
      remoteIceFlushing.current = false
    }
  }

  function queueRemoteIce(id: string, candidates: SignalCandidate[] = []) {
    if (active.current?.id !== id || !Array.isArray(candidates)) return
    pendingRemoteIce.current.push(
      ...unseenCandidates(candidates, seenRemoteIce.current),
    )
    void flushRemoteIce(id)
  }

  async function transition(
    id: string,
    operation: 'answer' | 'decline' | 'end' | 'expire' | 'touch',
    answer_sdp?: string,
  ) {
    return unwrap(
      await db.rpc('change_voice', { call_id: id, operation, answer_sdp }),
    ) as Invite
  }

  function end(reason = '', operation: 'decline' | 'end' | 'expire' = 'end') {
    const current = active.current
    if (current) {
      locallyEnded.current.add(current.id)
      void transition(current.id, operation).catch(() => {})
    }
    release()
    setMessage(reason)
    if (link) navigate('/chat', { replace: true })
  }

  function arm(
    id: string,
    milliseconds: number,
    reason: string,
    operation: 'end' | 'expire' = 'end',
  ) {
    clearTimeout(timeout.current)
    timeout.current = setTimeout(
      () => {
        if (active.current?.id === id) end(reason, operation)
      },
      Math.max(0, milliseconds),
    )
  }

  async function connect(current: Call, offer?: string) {
    const id = current.id
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
      throw new Error('Voice calling is unavailable in this browser.')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (active.current?.id !== id) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    microphone.current = stream
    const { iceServers, relay, turnStatus: providerStatus } = await requestVoice('ice')
    if (active.current?.id !== id) return
    setRelayAvailable(relay)
    setTurnStatus(providerStatus ?? null)
    setNetworkStatus(relay ? 'Secure relay ready' : 'Direct network connection only')
    const connection = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'all' })
    peer.current = connection
    connection.onicecandidate = (event) => {
      if (!event.candidate || active.current?.id !== id) return
      const encoded = normalizeCandidate(
        event.candidate.toJSON() as Record<string, unknown>,
      )
      if (!encoded) return
      pendingLocalIce.current.push(encoded)
      scheduleLocalIce(id)
    }
    stream.getTracks().forEach((track) => connection.addTrack(track, stream))
    connection.ontrack = ({ streams, track }) => {
      if (!playback.current || active.current?.id !== id) return
      playback.current.srcObject = streams[0] ?? new MediaStream([track])
      void playback.current.play().catch(() => setPlaybackBlocked(true))
    }
    connection.oniceconnectionstatechange = () => {
      if (active.current?.id !== id) return
      setNetworkStatus('Network: ' + connection.iceConnectionState)
      if (connection.iceConnectionState === 'failed' &&
          connection.connectionState !== 'closed') {
        end('Could not connect audio across these networks. Check your connection and try again.')
      }
    }
    connection.onconnectionstatechange = () => {
      if (active.current?.id !== id) return
      if (connection.connectionState === 'connected') {
        clearTimeout(timeout.current)
        startedAt.current ??= Date.now()
        setStarted(startedAt.current)
        show({ id, state: 'connected' })
      } else if (connection.connectionState === 'failed') {
        end('The connection failed. Try calling again.')
      } else if (connection.connectionState === 'disconnected') {
        show({ id, state: 'connecting' })
        arm(id, 18000, 'The connection was lost.')
      }
    }
    if (offer) {
      await connection.setRemoteDescription({ type: 'offer', sdp: offer })
      queueRemoteIce(id, current.remoteCandidates ?? [])
    }
    // Trickle ICE: the SDP is sent immediately. Candidates continue arriving
    // asynchronously, including TURN relay candidates on restrictive networks.
    const localDescription = offer
      ? await connection.createAnswer()
      : await connection.createOffer()
    await connection.setLocalDescription(localDescription)
    const sdp = localDescription.sdp
    if (!sdp || active.current?.id !== id) return
    if (offer) {
      const invite = await transition(id, 'answer', sdp)
      if (active.current?.id !== id) return
      if (invite.status !== 'answered') {
        handler.current(invite)
        return
      }
      localIceReady.current = true
      scheduleLocalIce(id, 0)
      if (startedAt.current === undefined)
        arm(id, 35000, 'The connection could not be established. Try changing Wi-Fi or using mobile data.')
    } else {
      const invite = unwrap(
        await db.rpc('start_voice', { call_id: id, offer_sdp: sdp }),
      ) as Invite
      if (active.current?.id !== id) {
        void transition(id, 'end').catch(() => {})
        return
      }
      if (invite.status !== 'ringing') {
        handler.current(invite)
        return
      }
      localIceReady.current = true
      scheduleLocalIce(id, 0)
      arm(
        id,
        Date.parse(invite.expires_at) - Date.now() + 300,
        'Missed voice call.',
        'expire',
      )
      void requestVoice('notify', id).catch(() => {})
    }
  }

  function begin(incoming?: Call) {
    if (!partner || (!incoming && active.current)) return
    const current: Call = incoming
      ? { ...incoming, state: 'connecting' }
      : { id: crypto.randomUUID(), state: 'calling' }
    setMinimized(false)
    setMessage('')
    show(current)
    arm(
      current.id,
      incoming?.expires ? Math.max(35000, incoming.expires - Date.now() + 300) : 55000,
      'The call could not connect.',
      incoming ? 'expire' : 'end',
    )
    void connect(current, incoming?.offer).catch((error) => {
      if (active.current?.id === current.id) {
        const reason =
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Allow microphone access to make voice calls.'
            : error instanceof Error
              ? error.message
              : 'The call could not connect.'
        end(reason, incoming ? 'decline' : 'end')
      }
    })
  }

  handler.current = (invite) => {
    if (
      !partner ||
      ![invite.caller_id, invite.recipient_id].includes(me.id) ||
      ![invite.caller_id, invite.recipient_id].includes(partner.id) ||
      locallyEnded.current.has(invite.id)
    )
      return
    const current = active.current
    const expired = Date.parse(invite.expires_at) <= Date.now()
    if (
      invite.status === 'ringing' &&
      !expired &&
      invite.recipient_id === me.id &&
      invite.offer &&
      !current
    ) {
      const expires = Date.parse(invite.expires_at)
      setMessage('')
      setMinimized(false)
      show({
        id: invite.id, state: 'incoming', offer: invite.offer, expires,
        remoteCandidates: invite.caller_candidates ?? [],
      })
      arm(invite.id, expires - Date.now() + 300, 'Missed voice call.', 'expire')
    } else if (
      current?.id === invite.id &&
      invite.status === 'answered' &&
      current.state === 'calling' &&
      peer.current &&
      invite.answer &&
      appliedAnswer.current !== invite.id
    ) {
      appliedAnswer.current = invite.id
      show({ id: invite.id, state: 'connecting' })
      arm(invite.id, 30000, 'The connection could not be established.')
      void peer.current
        .setRemoteDescription({ type: 'answer', sdp: invite.answer })
        .then(() => flushRemoteIce(invite.id))
        .catch(() => {
          if (active.current?.id === invite.id)
            end('The connection could not be established.')
        })
    } else if (
      current?.id === invite.id &&
      current.state === 'incoming' &&
      invite.status === 'answered'
    ) {
      release()
      setMessage('This call was answered on another device.')
    } else if (expired || !['ringing', 'answered'].includes(invite.status)) {
      if (current?.id === invite.id) release()
      if (current?.id === invite.id || (!current && invite.id === link)) {
        setMinimized(false)
        setMessage(
          invite.status === 'declined'
            ? 'Call declined.'
            : invite.status === 'ended'
              ? 'Call ended.'
              : 'Missed voice call.',
        )
      }
    }
    // Realtime sends full row snapshots. Apply each remote candidate exactly
    // once, even if the fallback poll receives the same snapshot repeatedly.
    if (active.current?.id === invite.id) {
      queueRemoteIce(
        invite.id,
        invite.caller_id === me.id
          ? invite.recipient_candidates ?? []
          : invite.caller_candidates ?? [],
      )
    }
  }

  endOnUnmount.current = () => {
    const current = active.current
    if (current)
      void transition(
        current.id,
        current.state === 'incoming' ? 'decline' : 'end',
      ).catch(() => {})
    release()
  }

  useEffect(() => {
    if (!partner) return
    let alive = true
    async function refresh() {
      const id = active.current?.id
      const query = db.from('voice_calls').select('*')
      const result = id
        ? await query.eq('id', id).maybeSingle()
        : await query
            .eq('recipient_id', me.id)
            .eq('status', 'ringing')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
      if (alive && result.data) handler.current(result.data as Invite)
    }
    const room = db
      .channel('voice-calls:' + crypto.randomUUID())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_calls' },
        (payload) => {
          if (alive) handler.current(payload.new as Invite)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh()
      })
    void refresh()
    const poll = setInterval(() => {
      if (!document.hidden || active.current) void refresh()
    }, 1500)
    window.addEventListener('focus', refresh)
    return () => {
      alive = false
      clearInterval(poll)
      window.removeEventListener('focus', refresh)
      void db.removeChannel(room)
      endOnUnmount.current()
    }
  }, [me.id, partner?.id])

  useEffect(() => {
    if (!link || !/^[0-9a-f-]{36}$/i.test(link)) return
    let alive = true
    void db
      .from('voice_calls')
      .select('*')
      .eq('id', link)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (!data && !error && !active.current)
          setMessage('This call is no longer available.')
        if (data) {
          handler.current(data as Invite)
          if (!active.current && data.status === 'answered')
            setMessage('This call was answered on another device.')
          if (active.current?.id === link) setMinimized(false)
        }
      })
    return () => {
      alive = false
    }
  }, [link])

  useEffect(() => {
    const worker = navigator.serviceWorker
    if (!worker) return
    function opened(event: MessageEvent) {
      const { type, call } = event.data ?? {}
      if (
        type === 'our-space-call' &&
        typeof call === 'string' &&
        /^[0-9a-f-]{36}$/i.test(call)
      )
        navigate('/chat?call=' + encodeURIComponent(call))
    }
    worker.addEventListener('message', opened)
    return () => worker.removeEventListener('message', opened)
  }, [navigate])

  useEffect(() => {
    if (started === undefined) return
    const update = () => setSeconds(Math.floor((Date.now() - started) / 1000))
    update()
    const timer = setInterval(update, 250)
    const heartbeat = setInterval(() => {
      const id = active.current?.id
      if (id)
        void transition(id, 'touch')
          .then((invite) => handler.current(invite))
          .catch(() => {})
    }, 15000)
    return () => {
      clearInterval(timer)
      clearInterval(heartbeat)
    }
  }, [started])

  useEffect(() => {
    const enable = () => {
      if (!window.AudioContext) return
      audioContext.current ??= new AudioContext()
      if (audioContext.current.state !== 'running')
        void audioContext.current.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', enable)
    return () => {
      window.removeEventListener('pointerdown', enable)
      void audioContext.current?.close().catch(() => {})
      audioContext.current = null
    }
  }, [])

  // Browser-generated, original tones (no external audio asset).
  // Caller hears ringback while the invitation is being delivered;
  // recipient hears a distinct ringtone while the app is foregrounded.
  useEffect(() => {
    const outgoing = call?.state === 'calling'
    if (!outgoing && call?.state !== 'incoming') return
    const playing = new Set<OscillatorNode>()
    const ring = () => {
      const audio = audioContext.current
      if (document.hidden || !audio || audio.state !== 'running') return
      const notes = outgoing
        ? [[0, 440], [0, 480]]
        : [[0, 523], [0.23, 659]]
      for (const [offset, frequency] of notes) {
        const start = audio.currentTime + offset
        const length = outgoing ? 0.65 : 0.18
        const oscillator = audio.createOscillator()
        const volume = audio.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency
        volume.gain.setValueAtTime(0, start)
        volume.gain.linearRampToValueAtTime(outgoing ? 0.05 : 0.1, start + 0.04)
        volume.gain.exponentialRampToValueAtTime(0.001, start + length)
        oscillator.connect(volume).connect(audio.destination)
        playing.add(oscillator)
        oscillator.onended = () => {
          playing.delete(oscillator)
          oscillator.disconnect()
          volume.disconnect()
        }
        oscillator.start(start)
        oscillator.stop(start + length + 0.01)
      }
    }
    ring()
    const repeat = setInterval(ring, outgoing ? 2800 : 2000)
    return () => {
      clearInterval(repeat)
      playing.forEach((oscillator) => {
        try {
          oscillator.stop()
        } catch {
          /* already ended */
        }
      })
    }
  }, [call?.state])

  const nickname = partner?.nickname ?? 'Your partner'
  const label =
    call?.state === 'incoming'
      ? 'Incoming Voice Call'
      : call?.state === 'calling'
        ? 'Calling ' + nickname + '…'
        : call?.state === 'connecting'
          ? 'Connecting…'
          : 'Connected'
  const connected = call?.state === 'connected'
  const canSwitchOutput = Boolean(playback.current && 'setSinkId' in playback.current)
  async function chooseSpeaker() {
    const audio = playback.current as (HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>
    }) | null
    if (!audio?.setSinkId) {
      setAudioRoute('iPhone Safari controls the speaker route. External speaker switching is unavailable in this PWA.')
      return
    }
    try {
      const devices = navigator.mediaDevices as MediaDevices & {
        selectAudioOutput?: () => Promise<MediaDeviceInfo>
      }
      const selected = devices.selectAudioOutput
        ? await devices.selectAudioOutput()
        : null
      await audio.setSinkId(selected?.deviceId || 'default')
      await audio.play().catch(() => {})
      setAudioRoute(selected?.label || 'Audio output selected')
    } catch {
      setAudioRoute('Could not change speaker. Check your phone audio output settings.')
    }
  }
  function startOutgoing() {
    // Prime Web Audio within the user's tap; iOS forbids unprompted sound.
    if (window.AudioContext) {
      audioContext.current ??= new AudioContext()
      void audioContext.current.resume().catch(() => {})
    }
    begin()
  }
  return (
    <context.Provider
      value={{ start: startOutgoing, disabled: !partner || Boolean(call) }}
    >
      {children}
      <audio
        className="call-audio-hidden"
        ref={playback}
        autoPlay
        aria-label="Call audio"
      />
      {call && minimized && (
        <button className="ongoing-call" onClick={() => setMinimized(false)}>
          <Phone size={16} /> {nickname} · {formatElapsed(seconds)} · In Call
        </button>
      )}
      {((call && !minimized) || message) && (
        <section
          className={'call-screen' + (me.reduce_motion ? ' no-motion' : '')}
          aria-label={call ? label : 'Call status'}
        >
          {connected && (
            <button
              className="ghost call-back"
              onClick={() => {
                setMinimized(true)
                navigate('/chat')
              }}
            >
              <ChevronDown size={18} /> Back to Chat
            </button>
          )}
          <div
            className={
              'call-person ' +
              (call?.state === 'calling' || call?.state === 'incoming'
                ? 'call-ringing'
                : '')
            }
          >
            <div className="call-avatar-wrap">
              {(call?.state === 'calling' || call?.state === 'incoming') && (
                <div className="call-wave-rings" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              )}
              <Avatar
                name={partner?.real_name ?? nickname}
                path={partner?.avatar_path}
                size="large"
              />
            </div>
            <h1>{nickname}</h1>
            <p role="status">{call ? label : message}</p>
            {call?.state === 'incoming' && <p>{nickname} is calling…</p>}
            {connected && <time>{formatElapsed(seconds)}</time>}
            {call?.state === 'connecting' && (
              <p className="hint call-network-status" role="status">
                {networkStatus || 'Checking secure audio route…'}

              </p>
            )}
            {call?.state === 'connecting' && relayAvailable === false && (
              <p className="hint call-turn-diagnostic" role="status">
                {turnStatusMessage(turnStatus)}
              </p>
            )}
            {audioRoute && <p className="hint" role="status">{audioRoute}</p>}
            {playbackBlocked && (
              <button
                className="outline"
                onClick={() =>
                  void playback.current
                    ?.play()
                    .then(() => setPlaybackBlocked(false))
                    .catch(() => {})
                }
              >
                Tap to hear call audio
              </button>
            )}
          </div>
          <div className="call-actions">
            {call?.state === 'incoming' && (
              <button className="primary" onClick={() => begin(call)}>
                <Phone size={18} /> Answer
              </button>
            )}
            {connected && (
              <button
                className="outline"
                aria-pressed={muted}
                onClick={() => {
                  microphone.current?.getAudioTracks().forEach((track) => {
                    track.enabled = muted
                  })
                  setMuted(!muted)
                }}
              >
                {muted ? <MicOff size={18} /> : <Mic size={18} />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
            )}
            {connected && (
              <button className="outline" type="button"
                aria-label="Choose speaker" aria-disabled={!canSwitchOutput}
                onClick={() => void chooseSpeaker()}>
                <Volume2 size={18} /> Speaker
              </button>
            )}
            {connected && (
              <button className="outline" onClick={() => setMinimized(true)}>
                Minimize
              </button>
            )}
            <button
              className={call ? 'call-end' : 'outline'}
              onClick={() =>
                end('', call?.state === 'incoming' ? 'decline' : 'end')
              }
            >
              {call && <PhoneOff size={18} />}
              {!call
                ? 'Dismiss'
                : call.state === 'incoming'
                  ? 'Decline'
                  : call.state === 'calling'
                    ? 'Cancel Call'
                    : 'End Call'}
            </button>
          </div>
        </section>
      )}
    </context.Provider>
  )
}
