import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Heart, LockKeyhole, X } from 'lucide-react'
import { saveSharedCard } from './sharedCards'
import type { SharedCardKind } from './sharedCards'

export function CustomCardEditor({
  kind, category, onSaved, onClose,
}: {
  kind: SharedCardKind
  category: string
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const privateMode = kind === 'intimate'
  const name = privateMode ? 'private request' : 'daily love note'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const trimmedTitle = title.trim()
    const trimmedMessage = message.trim()
    if (!trimmedTitle || !trimmedMessage || trimmedTitle.length > 70 || trimmedMessage.length > 160) {
      setError('Add a title (up to 70 characters) and message (up to 160 characters).')
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveSharedCard(kind, category, trimmedTitle, trimmedMessage)
      await onSaved()
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this card.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="intimate-modal-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !busy) onClose()
    }}>
      <div role="dialog" aria-modal="true" aria-label={'Add ' + name}
        className="intimate-compose">
        <div className="row spread intimate-compose-top">
          <span className="intimate-private-indicator">
            {privateMode ? <LockKeyhole size={15} /> : <Heart size={15} />}
            Create your own {name}
          </span>
          <button type="button" className="intimate-close"
            aria-label="Close custom card" disabled={busy} onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <h3>Add your own {name}</h3>
        <p className="hint intimate-consent">
          Saved for both of you. You can send it whenever you want.
        </p>
        <form onSubmit={(event) => void save(event)}>
          <label className="field-label" htmlFor={'custom-title-' + kind}>Card title</label>
          <input id={'custom-title-' + kind} aria-label="Card title"
            className="personal-card-input" required maxLength={70} autoFocus
            value={title} onChange={(event) => setTitle(event.target.value)}
            placeholder={privateMode ? 'e.g. A night just for us' : 'e.g. My favorite human'} />
          <label className="field-label mt16" htmlFor={'custom-message-' + kind}>Message to send</label>
          <textarea id={'custom-message-' + kind} aria-label="Message to send"
            rows={3} required maxLength={160} minLength={1}
            value={message} onChange={(event) => setMessage(event.target.value)}
            placeholder="Write your own words…" />
          {privateMode && (
            <p className="hint intimate-lock-notice">
              <LockKeyhole size={13} /> Lock-screen notifications hide this private message.
            </p>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="intimate-compose-actions mt16">
            <button type="button" className="outline" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={busy || !title.trim() || !message.trim()}>
              {busy ? 'Saving…' : 'Save ' + name}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
