import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronRight, Heart, LockKeyhole, Send, X } from 'lucide-react'
import { db, flushPush, unwrap } from './data'
import type { Profile } from './data'
import { intimateCategories, intimateRequests } from './intimateRequests'
import type { IntimateCategory, IntimateRequest } from './intimateRequests'

/** Only explicit submission sends a request. Merely exploring never notifies. */
export function IntimateRequests({ partner }: { partner?: Profile }) {
  const [category, setCategory] = useState<IntimateCategory>('direct')
  const [selected, setSelected] = useState<IntimateRequest | null>(null)
  const [message, setMessage] = useState('')
  const [pendingEntry, setPendingEntry] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!selected) return
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setSelected(null)
    }
    document.addEventListener('keydown', dismissOnEscape)
    return () => document.removeEventListener('keydown', dismissOnEscape)
  }, [selected, busy])

  function choose(request: IntimateRequest) {
    setSelected(request)
    setMessage(request.message)
    setPendingEntry(undefined)
    setError('')
    setNotice('')
  }

  function close() {
    if (busy) return
    setSelected(null)
    setMessage('')
    setPendingEntry(undefined)
    setError('')
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || busy) return
    const content = message.trim()
    if (!content || content.length > 160) {
      setError('Write a private message up to 160 characters.')
      return
    }
    const entry = pendingEntry ?? crypto.randomUUID()
    setPendingEntry(entry)
    setError('')
    setBusy(true)
    try {
      unwrap(await db.rpc('send_intimate_request', {
        entry,
        request_code: selected.id,
        message: content,
      }))
      flushPush()
      setSelected(null)
      setPendingEntry(undefined)
      setMessage('')
      setNotice('Sent privately to ' + (partner?.nickname ?? 'your person') + ' ❤️')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not send. Tap Retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="intimate-section" aria-label="Intimate Requests">
      <div className="sect intimate-heading">
        <h3>Intimate Requests</h3>
        <span className="intimate-private-indicator"><LockKeyhole size={14} /> Just for us</span>
      </div>
      <p className="hint intimate-intro">
        Little sparks, private moments. Share a feeling — never an obligation.
      </p>
      <div className="intimate-category-tabs" role="group" aria-label="Request categories">
        {intimateCategories.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={category === item.id}
            className={category === item.id ? 'active' : ''}
            onClick={() => setCategory(item.id)}
          >
            <span aria-hidden="true">{item.emoji}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <p className="hint intimate-category-subtitle">
        {intimateCategories.find((item) => item.id === category)?.subtitle}
      </p>
      <div className="intimate-request-grid">
        {intimateRequests.filter((request) => request.category === category).map((request) => (
          <button
            className="intimate-request-tile"
            type="button"
            key={request.id}
            aria-label={request.title}
            onClick={() => choose(request)}
          >
            <span className="intimate-request-icon">
              <span className="intimate-request-emoji" aria-hidden="true">{request.emoji}</span>
            </span>
            <strong>{request.title}</strong>
            <span className="intimate-tap">
              Private request <ChevronRight size={14} />
            </span>
          </button>
        ))}
      </div>

      {notice && (
        <div className="send-toast success intimate-send-toast" role="status">
          <Heart size={15} /> {notice}
        </div>
      )}

      {selected && (
        <div className="intimate-modal-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) close()
        }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Private intimate request"
            className="intimate-compose"
          >
            <div className="row spread intimate-compose-top">
              <span className="intimate-private-indicator">
                <LockKeyhole size={15} /> Private request
              </span>
              <button type="button" className="intimate-close"
                aria-label="Close private request" disabled={busy} onClick={close}>
                <X size={19} />
              </button>
            </div>
            <div className="intimate-compose-emoji" aria-hidden="true">{selected.emoji}</div>
            <h3 id="intimate-compose-title">{selected.title}</h3>
            <p className="hint intimate-consent">
              A sweet invitation, only if you both feel like it. Your person can always say no or reply later.
            </p>
            <form onSubmit={(event) => void send(event)}>
              <label className="field-label" htmlFor="intimate-compose-message">
                Personal message
              </label>
              <textarea
                id="intimate-compose-message"
                aria-label="Personal message"
                rows={3}
                minLength={1}
                maxLength={160}
                required
                autoFocus
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value)
                  // Editing after a failed send creates a new, distinct request.
                  if (pendingEntry) setPendingEntry(undefined)
                }}
              />
              <p className="hint intimate-lock-notice">
                <LockKeyhole size={13} /> Lock-screen notification hides the title and message.
              </p>
              {error && <p role="alert" className="error">{error}</p>}
              <div className="intimate-compose-actions">
                <button type="button" className="outline" disabled={busy} onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="primary"
                  disabled={busy || !message.trim()}
                  aria-label="Send private request">
                  <Send size={17} /> {busy ? 'Sending…' : (error ? 'Retry' : 'Send privately')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
