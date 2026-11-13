import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronRight, Heart, LockKeyhole, Plus, Send, Trash2, X } from 'lucide-react'
import { db, flushPush, unwrap } from './data'
import type { Profile } from './data'
import { intimateCategories, intimateRequests, legacyIntimateCodes } from './intimateRequests'
import type { IntimateCategory, IntimateRequest } from './intimateRequests'
import { CustomCardEditor } from './CustomCardEditor'
import { deleteSharedCard, loadSharedCards } from './sharedCards'
import type { SharedCard } from './sharedCards'

type RequestCard = IntimateRequest & { custom?: boolean }

/** A private invitation only goes out after the sender reviews and confirms. */
export function IntimateRequests({ me, partner }: { me: Profile; partner?: Profile }) {
  const [category, setCategory] = useState<IntimateCategory>('direct')
  const [selected, setSelected] = useState<RequestCard | null>(null)
  const [message, setMessage] = useState('')
  const [pendingEntry, setPendingEntry] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [customCards, setCustomCards] = useState<SharedCard[]>([])
  const [customOpen, setCustomOpen] = useState(false)
  const [customError, setCustomError] = useState('')

  async function refresh() {
    const cards = await loadSharedCards('intimate')
    setCustomCards(cards)
    setCustomError('')
  }
  useEffect(() => {
    let active = true
    void loadSharedCards('intimate')
      .then((cards) => { if (active) setCustomCards(cards) })
      .catch((failure) => {
        if (active) setCustomError(failure instanceof Error ? failure.message : 'Could not load saved requests.')
      })
    return () => { active = false }
  }, [])

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

  function choose(request: RequestCard) {
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
      if (legacyIntimateCodes.has(selected.id)) {
        unwrap(await db.rpc('send_intimate_request', {
          entry, request_code: selected.id, message: content,
        }))
      } else {
        unwrap(await db.rpc('send_private_card', {
          entry, card_title: selected.title, card_message: content,
        }))
      }
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

  async function remove(id: string) {
    if (!window.confirm('Delete your saved request? Previously sent messages will stay in chat.')) return
    try {
      await deleteSharedCard(id)
      await refresh()
    } catch (failure) {
      setCustomError(failure instanceof Error ? failure.message : 'Could not delete the saved request.')
    }
  }

  const requests: RequestCard[] = [
    ...intimateRequests.filter((request) => request.category === category),
    ...customCards.filter((card) => card.category === category).map((card) => ({
      id: card.id, category, title: card.title, message: card.message,
      icon: 'Heart', emoji: '💗', custom: true,
    })),
  ]

  return (
    <section className="intimate-section" aria-label="Intimate Requests">
      <div className="sect intimate-heading">
        <h3>Intimate Requests</h3>
        <span className="intimate-private-indicator"><LockKeyhole size={14} /> Just for us</span>
      </div>
      <div className="intimate-category-tabs" role="group" aria-label="Request categories">
        {intimateCategories.map((item) => (
          <button key={item.id} type="button" aria-label={item.label}
            aria-pressed={category === item.id}
            className={category === item.id ? 'active' : ''}
            onClick={() => setCategory(item.id)}>
            <span aria-hidden="true">{item.emoji}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <p className="hint intimate-category-subtitle">
        {intimateCategories.find((item) => item.id === category)?.subtitle}
      </p>
      <button type="button" className="outline personal-add"
        onClick={() => setCustomOpen(true)} aria-label="Add your own private request">
        <Plus size={17} /> Add your own private request
      </button>
      {customError && <p role="alert" className="error">{customError}</p>}
      <div className="intimate-request-grid">
        {requests.map((request) => (
          <div className="personal-card-shell" key={request.id}>
            <button className="intimate-request-tile" type="button"
              aria-label={request.title} onClick={() => choose(request)}>
              <span className="intimate-request-icon">
                <span className="intimate-request-emoji" aria-hidden="true">{request.emoji}</span>
              </span>
              <strong>{request.title}</strong>
              <span className="intimate-tap">Private request <ChevronRight size={14} /></span>
            </button>
            {request.custom && customCards.some((card) => card.id === request.id && card.author_id === me.id) && (
              <button type="button" className="personal-delete"
                aria-label={'Delete ' + request.title}
                onClick={() => void remove(request.id)}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      {notice && (
        <div className="send-toast success intimate-send-toast" role="status">
          <Heart size={15} /> {notice}
        </div>
      )}
      {customOpen && (
        <CustomCardEditor kind="intimate" category={category}
          onSaved={refresh} onClose={() => setCustomOpen(false)} />
      )}
      {selected && (
        <div className="intimate-modal-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) close()
        }}>
          <div role="dialog" aria-modal="true" aria-label="Private intimate request"
            aria-labelledby="intimate-compose-title" className="intimate-compose">
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
              <label className="field-label" htmlFor="intimate-compose-message">Personal message</label>
              <textarea id="intimate-compose-message" aria-label="Personal message"
                rows={3} minLength={1} maxLength={160} required autoFocus
                value={message} onChange={(event) => {
                  setMessage(event.target.value)
                  if (pendingEntry) setPendingEntry(undefined)
                }} />
              <p className="hint intimate-lock-notice">
                <LockKeyhole size={13} /> Lock-screen notification hides the title and message.
              </p>
              {error && <p role="alert" className="error">{error}</p>}
              <div className="intimate-compose-actions">
                <button type="button" className="outline" disabled={busy} onClick={close}>Cancel</button>
                <button type="submit" className="primary"
                  disabled={busy || !message.trim()} aria-label="Send private request">
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
