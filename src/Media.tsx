import { useEffect, useRef, useState } from 'react'
import { Camera, Mic, Pause, Send, Trash2, X } from 'lucide-react'
import { cropPhoto, db, unwrap } from './data'
import { formatElapsed } from './elapsed'
import { RecordingWaveform, VoiceWaveform } from './VoiceWaveform'
import { ErrorMessage, Field, Page, useAction } from './ui'

type Bucket = 'our-space-chat-media' | 'our-space-memories'
type MediaKind = 'photo' | 'audio'
const audioTypes = ['audio/mp4', 'audio/webm', 'audio/ogg']

async function upload(
  bucket: Bucket,
  userId: string,
  id: string,
  blob: Blob,
  contentType: string,
) {
  const path = userId + '/' + id
  const result = await db.storage
    .from(bucket)
    .upload(path, blob, { contentType })
  if (
    result.error &&
    !['409', 'Duplicate'].includes(
      String('statusCode' in result.error ? result.error.statusCode : ''),
    )
  )
    throw result.error
  return path
}

export function PrivateMedia({
  bucket,
  path,
  kind,
  alt,
  duration,
}: {
  bucket: Bucket
  path: string
  kind: MediaKind
  alt: string
  duration?: number | null
}) {
  const [signed, setSigned] = useState<{ path: string; url: string }>()
  const [failed, setFailed] = useState(false)
  const [visible, setVisible] = useState(false)
  const lazyTarget = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const target = lazyTarget.current
    if (!target) return
    if (!('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((item) => item.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '350px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [path])
  useEffect(() => {
    if (!visible) return
    let active = true
    const refresh = async () => {
      const { data, error } = await db.storage
        .from(bucket)
        .createSignedUrl(path, 900)
      if (!active) return
      if (data) setSigned({ path, url: data.signedUrl })
      setFailed(Boolean(error))
    }
    void refresh()
    const timer = setInterval(refresh, 720000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [bucket, path, visible])
  if (!visible)
    return <span ref={lazyTarget} className="hint private-media-placeholder">Attachment ready to load</span>
  if (!signed || signed.path !== path)
    return (
      <p className="hint">
        {failed ? 'Attachment unavailable.' : 'Loading attachment…'}
      </p>
    )
  return kind === 'audio' ? (
    <VoiceWaveform src={signed.url} label={alt} durationHint={duration ?? undefined} />
  ) : (
    <a
      className="private-photo"
      href={signed.url}
      target="_blank"
      rel="noreferrer"
    >
      <img src={signed.url} alt={alt} loading="lazy" />
    </a>
  )
}

type Draft = {
  duration?: number
  blob: Blob
  kind: MediaKind
  contentType: string
  id: string
}
export function ChatAttachments({
  userId,
  onSent,
  onVoiceModeChange,
}: {
  userId: string
  onSent: (id: string) => Promise<void>
  onVoiceModeChange: (active: boolean) => void
}) {
  const [draft, setDraft] = useState<Draft>()
  const [preview, setPreview] = useState('')
  const [recording, setRecording] = useState(false)
  const [liveStream, setLiveStream] = useState<MediaStream>()
  const [recordedSeconds, setRecordedSeconds] = useState(0)
  const [sendingImmediately, setSendingImmediately] = useState(false)
  const [micError, setMicError] = useState('')
  const [starting, setStarting] = useState(false)
  const startedAt = useRef(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const discardOnStop = useRef(false)
  const sendOnStop = useRef(false)
  const mounted = useRef(true)
  const action = useAction()
  const voiceMode = recording || starting || draft?.kind === 'audio'

  useEffect(() => {
    onVoiceModeChange(Boolean(voiceMode))
  }, [onVoiceModeChange, voiceMode])

  useEffect(() => {
    if (!recording) return
    const tick = setInterval(() => {
      setRecordedSeconds(
        Math.floor((performance.now() - startedAt.current) / 1000),
      )
    }, 200)
    return () => clearInterval(tick)
  }, [recording])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(timer.current)
      const current = recorder.current
      if (current && current.state !== 'inactive') {
        discardOnStop.current = true
        current.stop()
      }
      current?.stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (!draft) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(draft.blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [draft])

  async function sendDraft(next: Draft) {
    await action.run(async () => {
      const path = await upload(
        'our-space-chat-media',
        userId,
        next.id,
        next.blob,
        next.contentType,
      )
      unwrap(
        next.kind === 'audio'
          ? await db.rpc('send_media_with_duration', {
              entry: next.id,
              kind: next.kind,
              object_path: path,
              caption: '',
              seconds: Math.max(1, Math.round(next.duration ?? 0)),
            })
          : await db.rpc('send_media', {
              entry: next.id,
              kind: next.kind,
              object_path: path,
            }),
      )
      await onSent(next.id)
      setDraft(undefined)
      setSendingImmediately(false)
    })
  }

  function stopForReview() {
    const current = recorder.current
    if (current?.state === 'recording') current.stop()
  }

  function discard() {
    const current = recorder.current
    sendOnStop.current = false
    discardOnStop.current = true
    setSendingImmediately(false)
    if (current?.state === 'recording') current.stop()
    setDraft(undefined)
    setMicError('')
  }

  function sendNow() {
    if (recording) {
      sendOnStop.current = true
      setSendingImmediately(true)
      stopForReview()
    } else if (draft) {
      void sendDraft(draft)
    }
  }

  async function record() {
    setMicError('')
    setStarting(true)
    try {
      if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia)
        throw new Error('Recording is unavailable in this browser.')
      const mimeType = audioTypes.find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      if (!mimeType)
        throw new Error('This browser does not support voice notes.')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      try {
        const next = new MediaRecorder(stream, { mimeType })
        recorder.current = next
        discardOnStop.current = false
        sendOnStop.current = false
        const chunks: Blob[] = []
        next.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data)
        }
        next.onstop = () => {
          clearTimeout(timer.current)
          recorder.current = null
          stream.getTracks().forEach((track) => track.stop())
          if (!mounted.current) return
          setRecording(false)
          setLiveStream(undefined)
          setSendingImmediately(false)
          const shouldDiscard = discardOnStop.current
          const shouldSend = sendOnStop.current
          discardOnStop.current = false
          sendOnStop.current = false
          if (shouldDiscard) {
            setDraft(undefined)
            setRecordedSeconds(0)
            return
          }
          const duration = (performance.now() - startedAt.current) / 1000
          const blob = new Blob(chunks, { type: mimeType })
          if (!blob.size || blob.size > 8388608) {
            setMicError('Could not save this recording. Try a shorter voice note.')
            return
          }
          const ready: Draft = {
            blob,
            kind: 'audio',
            duration,
            contentType: mimeType,
            id: crypto.randomUUID(),
          }
          setDraft(ready)
          if (shouldSend) void sendDraft(ready)
        }
        next.onerror = () => {
          discardOnStop.current = true
          if (mounted.current) setMicError('Recording was interrupted.')
        }
        next.start()
        startedAt.current = performance.now()
        setRecordedSeconds(0)
        setLiveStream(stream)
        setRecording(true)
        timer.current = setTimeout(() => {
          if (next.state === 'recording') next.stop()
        }, 60000)
      } catch (failure) {
        stream.getTracks().forEach((track) => track.stop())
        throw failure
      }
    } catch (failure) {
      if (mounted.current)
        setMicError(
          failure instanceof DOMException
            ? 'Allow microphone access to record a voice note.'
            : (failure as Error).message,
        )
    } finally {
      if (mounted.current) setStarting(false)
    }
  }

  return (
    <div className={'chat-attachments' + (voiceMode ? ' voice-mode' : '')}>
      {!voiceMode && (
        <div className="row">
          <label className="chat-action file-wrap" aria-label="Attach photo">
            <Camera size={19} />
            <input
              aria-label="Attach photo"
              type="file"
              accept="image/*"
              disabled={action.busy || Boolean(draft)}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file)
                  void action.run(async () =>
                    setDraft({
                      blob: await cropPhoto(file),
                      kind: 'photo',
                      contentType: 'image/jpeg',
                      id: crypto.randomUUID(),
                    }),
                  )
              }}
            />
          </label>
          <button
            type="button"
            className="chat-action"
            aria-label="Record voice note"
            disabled={starting || action.busy || Boolean(draft)}
            onClick={() => void record()}
          >
            <Mic size={19} />
          </button>
        </div>
      )}

      {draft?.kind === 'photo' && (
        <div className="attachment-draft row">
          <img src={preview} alt="Photo preview" />
          <button
            type="button"
            className="outline"
            disabled={action.busy}
            onClick={() => void sendDraft(draft)}
          >
            {action.busy ? 'Sending…' : 'Send'}
          </button>
          <button
            type="button"
            className="chat-action"
            disabled={action.busy}
            aria-label="Discard attachment"
            onClick={() => setDraft(undefined)}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {voiceMode && (
        <div className="voice-composer" aria-label="Voice note composer">
          <button
            type="button"
            className="voice-delete"
            aria-label="Delete voice note"
            disabled={action.busy || sendingImmediately}
            onClick={discard}
          >
            <Trash2 size={21} />
          </button>
          <div className="voice-composer-content">
            {recording || starting ? (
              <div className="voice-live">
                <span className="voice-recording-status" role="status">
                  <span className="recording-dot" aria-hidden="true" />
                  <time>{formatElapsed(recordedSeconds)}</time>
                </span>
                {liveStream && <RecordingWaveform stream={liveStream} />}
              </div>
            ) : draft?.kind === 'audio' && preview ? (
              <div className="voice-draft">
                <VoiceWaveform
                  src={preview}
                  label="Voice note preview"
                  durationHint={draft.duration}
                />
              </div>
            ) : (
              <span role="status" className="hint">Starting microphone…</span>
            )}
          </div>
          {recording && (
            <button
              type="button"
              className="voice-pause"
              aria-label="Pause recording"
              disabled={sendingImmediately}
              onClick={stopForReview}
            >
              <Pause size={20} />
            </button>
          )}
          <button
            type="button"
            className="voice-send"
            aria-label="Send voice note"
            disabled={starting || action.busy || sendingImmediately || (!recording && draft?.kind !== 'audio')}
            onClick={sendNow}
          >
            <Send size={21} />
          </button>
        </div>
      )}
      <ErrorMessage value={micError || action.error} />
    </div>
  )
}

type Memory = {
  id: string
  photo_path: string
  caption: string
  author_id: string
  created_at: string
}
export function Memories({ userId }: { userId: string }) {
  const [items, setItems] = useState<Memory[]>([])
  const [draft, setDraft] = useState<{ blob: Blob; id: string }>()
  const [preview, setPreview] = useState('')
  const [loadError, setLoadError] = useState('')
  const [limit, setLimit] = useState(30)
  const action = useAction()
  useEffect(() => {
    if (!draft) return
    const url = URL.createObjectURL(draft.blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [draft])
  useEffect(() => {
    let active = true
    const refresh = async () => {
      const { data, error } = await db
        .from('memories')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (!active) return
      if (data) setItems(data as Memory[])
      setLoadError(error ? 'Could not load memories.' : '')
    }
    void refresh()
    const channel = db
      .channel('memories:' + crypto.randomUUID())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memories' },
        refresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh()
      })
    return () => {
      active = false
      void db.removeChannel(channel)
    }
  }, [limit])
  return (
    <Page title="Our Memories" back="/world">
      <label className="outline wide file-wrap">
        <Camera size={19} /> Add a photo
        <input
          aria-label="Add a memory photo"
          type="file"
          accept="image/*"
          disabled={action.busy || Boolean(draft)}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file)
              void action.run(async () =>
                setDraft({
                  blob: await cropPhoto(file),
                  id: crypto.randomUUID(),
                }),
              )
          }}
        />
      </label>
      {draft && (
        <form
          className="card mt16"
          onSubmit={(event) => {
            event.preventDefault()
            const caption = String(
              new FormData(event.currentTarget).get('caption') ?? '',
            ).trim()
            void action.run(async () => {
              const photo_path = await upload(
                'our-space-memories',
                userId,
                draft.id,
                draft.blob,
                'image/jpeg',
              )
              const item = unwrap(
                await db
                  .from('memories')
                  .insert({ photo_path, caption })
                  .select()
                  .single(),
              ) as Memory
              setItems((current) => [
                item,
                ...current.filter((row) => row.id !== item.id),
              ])
              setDraft(undefined)
            })
          }}
        >
          <img
            className="memory-preview"
            src={preview}
            alt="Memory photo preview"
          />
          <Field label="Caption">
            <textarea name="caption" maxLength={300} />
          </Field>
          <button className="primary" disabled={action.busy}>
            Save memory
          </button>
          <button
            type="button"
            className="ghost"
            disabled={action.busy}
            onClick={() => {
              void db.storage
                .from('our-space-memories')
                .remove([userId + '/' + draft.id])
              setDraft(undefined)
            }}
          >
            Cancel
          </button>
        </form>
      )}
      <ErrorMessage value={action.error || loadError} />
      {!items.length && !loadError && (
        <p className="hint mt16">No memories yet.</p>
      )}
      <div className="memory-grid mt16">
        {items.map((item) => (
          <article className="card" key={item.id}>
            <PrivateMedia
              bucket="our-space-memories"
              path={item.photo_path}
              kind="photo"
              alt={item.caption || 'Shared memory'}
            />
            {item.caption && <p>{item.caption}</p>}
            <small className="hint">
              {new Date(item.created_at).toLocaleDateString('en-GB')}
            </small>
            {item.author_id === userId && (
              <button
                className="ghost"
                disabled={action.busy}
                onClick={() => {
                  if (!confirm('Remove this memory?')) return
                  void action.run(async () => {
                    unwrap(await db.from('memories').delete().eq('id', item.id))
                    setItems((current) =>
                      current.filter((row) => row.id !== item.id),
                    )
                    await db.storage
                      .from('our-space-memories')
                      .remove([item.photo_path])
                  })
                }}
              >
                Remove
              </button>
            )}
          </article>
        ))}
      </div>
      {items.length === limit && (
        <button className="link-btn" onClick={() => setLimit(limit + 30)}>
          More memories
        </button>
      )}
    </Page>
  )
}
