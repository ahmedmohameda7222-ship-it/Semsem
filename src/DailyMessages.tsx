import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronRight, Heart, Plus, Send, Trash2, X } from 'lucide-react'
import { db, flushPush, unwrap } from './data'
import type { Profile } from './data'
import { dailyMessages } from './dailyMessages'
import type { DailyMessage } from './dailyMessages'
import { CustomCardEditor } from './CustomCardEditor'
import { deleteSharedCard, loadSharedCards } from './sharedCards'
import type { SharedCard } from './sharedCards'

/** Everyday affection is a normal chat message, never a request to respond. */
export function DailyMessages({ me, partner }: { me: Profile; partner?: Profile }) {
  const [customCards, setCustomCards] = useState<SharedCard[]>([])
  const [selected, setSelected] = useState<DailyMessage | null>(null)
  const [message, setMessage] = useState('')
  const [pendingEntry, setPendingEntry] = useState<string>()
  const [customOpen, setCustomOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [customError, setCustomError] = useState('')
  const [notice, setNotice] = useState('')

  async function refresh() {
    setCustomCards(await loadSharedCards('daily'))
    setCustomError('')
  }
  useEffect(() => {
    let active = true
    void loadSharedCards('daily')
      .then((cards) => { if (active) setCustomCards(cards) })
      .catch((failure) => {
        if (active) setCustomError(failure instanceof Error ? failure.message : 'Could not load saved notes.')
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setSelected(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, busy])

  function choose(note: DailyMessage) {
    setSelected(note)
    setMessage(note.message)
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
      setError('Write a message up to 160 characters.')
      return
    }
    const entry = pendingEntry ?? crypto.randomUUID()
    setPendingEntry(entry)
    setBusy(true)
    setError('')
    try {
      unwrap(await db.rpc('send_chat', { entry, content }))
      flushPush()
      setSelected(null)
      setMessage('')
      setPendingEntry(undefined)
      setNotice('Love note sent to ' + (partner?.nickname ?? 'your person') + ' ❤️')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not send. Tap Retry.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete your saved daily note? Previously sent messages will stay in chat.')) return
    try {
      await deleteSharedCard(id)
      await refresh()
    } catch (failure) {
      setCustomError(failure instanceof Error ? failure.message : 'Could not delete the daily note.')
    }
  }

  const notes: DailyMessage[] = [
    ...dailyMessages,
    ...customCards.map((card) => ({
      id: card.id, title: card.title, message: card.message, emoji: '💌',
    })),
  ]

  return (
    <section className="intimate-section daily-section" aria-label="Daily Love Notes">
      <div className="sect intimate-heading">
        <h3>Daily Love Notes</h3>
        <span className="intimate-private-indicator"><Heart size={14} /> Little reminders of love</span>
      </div>
      <button type="button" className="outline personal-add"
        aria-label="Add your own daily note" onClick={() => setCustomOpen(true)}>
        <Plus size={17} /> Add your own daily note
      </button>
      {customError && <p className="error" role="alert">{customError}</p>}
      <div className="intimate-request-grid">
        {notes.map((note) => (
          <div key={note.id} className="personal-card-shell">
            <button className="intimate-request-tile daily-note-tile" type="button"
              aria-label={note.title} onClick={() => choose(note)}>
              <span className="intimate-request-icon">
                <span className="intimate-request-emoji" aria-hidden="true">{note.emoji}</span>
              </span>
              <strong>{note.title}</strong>
              <span className="intimate-tap">Send a love note <ChevronRight size={14} /></span>
            </button>
            {customCards.some((card) => card.id === note.id && card.author_id === me.id) && (
              <button type="button" className="personal-delete"
                aria-label={'Delete ' + note.title} onClick={() => void remove(note.id)}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      {notice && <div className="send-toast success intimate-send-toast" role="status"><Heart size={15} /> {notice}</div>}
      {customOpen && (
        <CustomCardEditor kind="daily" category="daily"
          onSaved={refresh} onClose={() => setCustomOpen(false)} />
      )}
      {selected && (
        <div className="intimate-modal-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) close()
        }}>
          <div role="dialog" aria-modal="true" aria-label="Daily love note"
            className="intimate-compose">
            <div className="row spread intimate-compose-top">
              <span className="intimate-private-indicator"><Heart size={15} /> Just because I love you</span>
              <button type="button" className="intimate-close"
                aria-label="Close daily note" disabled={busy} onClick={close}>
                <X size={19} />
              </button>
            </div>
            <div className="intimate-compose-emoji" aria-hidden="true">{selected.emoji}</div>
            <h3>{selected.title}</h3>
            <p className="hint intimate-consent">A little everyday message, with no reply needed.</p>
            <form onSubmit={(event) => void send(event)}>
              <label className="field-label" htmlFor="daily-compose-message">Your message</label>
              <textarea id="daily-compose-message" aria-label="Your message" autoFocus
                rows={3} minLength={1} maxLength={160} required value={message}
                onChange={(event) => {
                  setMessage(event.target.value)
                  if (pendingEntry) setPendingEntry(undefined)
                }} />
              {error && <p className="error" role="alert">{error}</p>}
              <div className="intimate-compose-actions mt16">
                <button type="button" className="outline" disabled={busy} onClick={close}>Cancel</button>
                <button type="submit" className="primary" aria-label="Send daily love note"
                  disabled={busy || !message.trim()}>
                  <Send size={17} /> {busy ? 'Sending…' : (error ? 'Retry' : 'Send love note')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
