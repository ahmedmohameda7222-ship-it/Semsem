import { useEffect, useState } from 'react'
import { Star, X } from 'lucide-react'
import { db, unwrap } from './data'
import type { Entry } from './data'
import { ErrorMessage } from './ui'

export type LibraryMode = 'search' | 'favorites'
const limit = 25
type Favorite = { entry: Entry }

export function ChatLibrary({
  mode,
  me,
  partner,
  revision,
  close,
  jump,
}: {
  mode: LibraryMode
  me: string
  partner: string
  revision: number
  close: () => void
  jump: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Entry[]>([])
  const [cursor, setCursor] = useState<Entry>()
  const [page, setPage] = useState(0)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    setReady(false)
    if (!query.trim() && mode === 'search') return
    setBusy(true)
    setError('')
    const refresh = async () => {
      try {
        const results =
          mode === 'search'
            ? (unwrap(
                await db.rpc('search_chat', {
                  query_text: query.trim(),
                  before_at: cursor?.created_at,
                  before_id: cursor?.id,
                }),
              ) as Entry[])
            : (
                unwrap(
                  await db
                    .from('chat_favorites')
                    .select('entry:chat_entries(*)')
                    .order('created_at', { ascending: false })
                    .order('entry_id', { ascending: false })
                    .range(page * limit, (page + 1) * limit - 1),
                ) as unknown as Favorite[]
              ).map((item) => item.entry)
        if (active) {
          setRows((current) =>
            page
              ? [
                  ...new Map(
                    [...current, ...results].map((entry) => [entry.id, entry]),
                  ).values(),
                ]
              : results,
          )
          setMore(results.length === limit)
          setReady(true)
        }
      } catch {
        if (active) setError('Could not load messages. Try again.')
      } finally {
        if (active) setBusy(false)
      }
    }
    const timer = setTimeout(refresh, mode === 'search' && page === 0 ? 220 : 0)
    const poll =
      mode === 'favorites' && page === 0
        ? setInterval(() => {
            if (!document.hidden) void refresh()
          }, 8000)
        : undefined
    return () => {
      active = false
      clearTimeout(timer)
      clearInterval(poll)
    }
  }, [mode, query, cursor, page, revision])

  return (
    <section
      className="chat-library"
      aria-label={mode === 'search' ? 'Search messages' : 'Favorites'}
    >
      <div className="row spread">
        <h4>{mode === 'search' ? 'Search messages' : 'Favorites'}</h4>
        <button
          className="chat-action"
          aria-label="Close message panel"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      {mode === 'search' && (
        <input
          className="chat-search"
          type="search"
          aria-label="Search chat history"
          placeholder="Search messages and requests"
          value={query}
          maxLength={120}
          onChange={(event) => {
            setQuery(event.target.value)
            setRows([])
            setCursor(undefined)
            setPage(0)
            setMore(false)
          }}
        />
      )}
      <div className="chat-library-results">
        {busy && (!rows.length || query.trim()) && (
          <p className="hint" role="status">
            Loading…
          </p>
        )}
        {ready && !rows.length && (
          <p className="hint">
            {mode === 'search'
              ? 'No messages match your search.'
              : 'No saved messages yet.'}
          </p>
        )}
        <ErrorMessage value={error} />
        {rows.map((entry) => (
          <button
            className="chat-result"
            key={entry.id}
            onClick={() => jump(entry.id)}
          >
            {mode === 'favorites' && <Star size={15} fill="currentColor" />}
            <span>
              <strong>{entry.title || entry.body}</strong>
              {entry.title && (
                <span className="chat-snippet">{entry.body}</span>
              )}
              <small>
                {entry.sender_id === me ? 'You' : partner} ·{' '}
                {entry.title
                  ? 'Request'
                  : entry.media_kind === 'audio'
                    ? 'Voice note'
                    : entry.media_kind === 'photo'
                      ? 'Photo'
                      : 'Message'}{' '}
                · {new Date(entry.created_at).toLocaleDateString('en-GB')}
              </small>
            </span>
          </button>
        ))}
        {more && (
          <button
            className="link-btn"
            disabled={busy}
            onClick={() => {
              setCursor(rows.at(-1))
              setPage(page + 1)
            }}
          >
            More results
          </button>
        )}
      </div>
    </section>
  )
}
