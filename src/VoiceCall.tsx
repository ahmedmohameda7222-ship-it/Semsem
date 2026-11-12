import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff } from 'lucide-react'
import { db } from './data'

type Signal = {
  id: string
  from: string
  to: string
  kind: 'offer' | 'answer' | 'end'
  sdp?: RTCSessionDescriptionInit
}
type Call = {
  id: string
  state: 'incoming' | 'calling' | 'connecting' | 'connected'
  offer?: RTCSessionDescriptionInit
}

let roomCleanup = Promise.resolve()

function iceReady(connection: RTCPeerConnection) {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      connection.removeEventListener('icegatheringstatechange', changed)
      resolve()
    }
    const changed = () => {
      if (connection.iceGatheringState === 'complete') finish()
    }
    const timer = setTimeout(finish, 3000)
    connection.addEventListener('icegatheringstatechange', changed)
  })
}

export function VoiceCall({
  me,
  partner,
  nickname,
}: {
  me: string
  partner: string
  nickname: string
}) {
  const [ready, setReady] = useState(false)
  const [call, setCall] = useState<Call>()
  const [error, setError] = useState('')
  const active = useRef<Call | undefined>(undefined)
  const connection = useRef<RTCPeerConnection | null>(null)
  const local = useRef<MediaStream | null>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const channel = useRef<ReturnType<typeof db.channel> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const handlers = useRef<(signal: Signal) => Promise<void>>(async () => {})
  const shutdown = useRef<() => void>(() => {})

  function show(next?: Call) {
    active.current = next
    setCall(next)
  }

  function release() {
    clearTimeout(timer.current)
    if (connection.current) {
      connection.current.onconnectionstatechange = null
      connection.current.close()
      connection.current = null
    }
    local.current?.getTracks().forEach((track) => track.stop())
    local.current = null
    if (audio.current) audio.current.srcObject = null
    show(undefined)
  }

  async function signal(
    id: string,
    kind: Signal['kind'],
    sdp?: RTCSessionDescriptionInit,
  ) {
    const status = await channel.current?.send({
      type: 'broadcast',
      event: 'voice',
      payload: { id, from: me, to: partner, kind, sdp },
    })
    if (status !== 'ok') throw new Error('The call could not be sent.')
  }

  function finish(message = '', notify = true) {
    const current = active.current
    if (notify && current) void signal(current.id, 'end').catch(() => {})
    release()
    setError(message)
  }

  function timeout(id: string, message: string) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (active.current?.id === id) finish(message)
    }, 35000)
  }

  async function setup(id: string, offer?: RTCSessionDescriptionInit) {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
      throw new Error('Voice calls are unavailable in this browser.')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (active.current?.id !== id) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    local.current = stream
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    })
    connection.current = peer
    stream.getTracks().forEach((track) => peer.addTrack(track, stream))
    peer.ontrack = ({ streams, track }) => {
      if (!audio.current || active.current?.id !== id) return
      audio.current.srcObject = streams[0] ?? new MediaStream([track])
      void audio.current
        .play()
        .catch(() => setError('Tap the audio player to listen.'))
    }
    peer.onconnectionstatechange = () => {
      if (active.current?.id !== id) return
      if (peer.connectionState === 'connected') {
        clearTimeout(timer.current)
        show({ id, state: 'connected' })
      } else if (peer.connectionState === 'failed')
        finish('The voice connection failed.')
      else if (peer.connectionState === 'disconnected')
        timeout(id, 'The voice connection was lost.')
    }
    if (offer) await peer.setRemoteDescription(offer)
    await peer.setLocalDescription(
      offer ? await peer.createAnswer() : await peer.createOffer(),
    )
    await iceReady(peer)
    if (active.current?.id !== id || !peer.localDescription) return
    await signal(id, offer ? 'answer' : 'offer', peer.localDescription.toJSON())
  }

  function start(offer?: Call) {
    const id = offer?.id ?? crypto.randomUUID()
    setError('')
    show({ id, state: offer ? 'connecting' : 'calling' })
    timeout(id, 'The call was not answered or could not connect.')
    void setup(id, offer?.offer).catch(() => {
      if (active.current?.id === id)
        finish(
          'Could not start the call. Check microphone access and try again.',
        )
    })
  }

  handlers.current = async (incoming) => {
    if (
      !incoming ||
      incoming.from !== partner ||
      incoming.to !== me ||
      typeof incoming.id !== 'string'
    )
      return
    const current = active.current
    if (incoming.kind === 'offer' && incoming.sdp?.type === 'offer') {
      if (current) return
      setError('')
      show({ id: incoming.id, state: 'incoming', offer: incoming.sdp })
      timeout(incoming.id, 'Missed voice call.')
    } else if (current?.id === incoming.id) {
      if (incoming.kind === 'end') finish('', false)
      else if (
        incoming.kind === 'answer' &&
        incoming.sdp?.type === 'answer' &&
        current.state === 'calling' &&
        connection.current
      ) {
        try {
          show({ id: current.id, state: 'connecting' })
          await connection.current.setRemoteDescription(incoming.sdp)
        } catch {
          finish('The call could not connect.')
        }
      }
    }
  }
  shutdown.current = () => finish()

  useEffect(() => {
    let alive = true
    void roomCleanup.then(() => {
      if (!alive) return
      const room = db
        .channel('our-space:voice', {
          config: { private: true, broadcast: { ack: true } },
        })
        .on(
          'broadcast',
          { event: 'voice' },
          ({ payload }) => void handlers.current(payload as Signal),
        )
        .subscribe((status) => {
          if (alive) setReady(status === 'SUBSCRIBED')
        })
      channel.current = room
    })
    return () => {
      alive = false
      shutdown.current()
      const room = channel.current
      channel.current = null
      if (room)
        roomCleanup = db.removeChannel(room).then(
          () => {},
          () => {},
        )
    }
  }, [me, partner])

  return (
    <>
      <button
        className="chat-action"
        aria-label="Start voice call"
        disabled={!ready || Boolean(call)}
        onClick={() => start()}
      >
        <Phone size={18} />
      </button>
      <audio
        ref={audio}
        className={call && error ? 'call-audio' : 'call-audio-hidden'}
        controls={Boolean(call && error)}
        autoPlay
        aria-label="Call audio"
      />
      {(call || error) && (
        <div className="call-panel" role="status">
          <strong>
            {call?.state === 'incoming'
              ? nickname + ' is calling'
              : call?.state === 'calling'
                ? 'Calling ' + nickname + '…'
                : call?.state === 'connecting'
                  ? 'Connecting…'
                  : call?.state === 'connected'
                    ? 'Voice call with ' + nickname
                    : error}
          </strong>
          {call && error && <small>{error}</small>}
          {call?.state === 'incoming' && (
            <button className="outline" onClick={() => start(call)}>
              Answer
            </button>
          )}
          <button
            className="chat-action"
            aria-label={call ? 'End voice call' : 'Dismiss call message'}
            onClick={() => finish()}
          >
            <PhoneOff size={18} />
          </button>
        </div>
      )}
    </>
  )
}
