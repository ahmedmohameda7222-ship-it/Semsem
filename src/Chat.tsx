import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, Search, Send, SmilePlus, Star, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { db, flushPush, unwrap } from './data'
import type { Entry, Profile, Reaction } from './data'
import { LoveIcon } from './Attention'
import { Avatar, ErrorMessage, useAction } from './ui'
import { ChatLibrary } from './ChatLibrary'
import type { LibraryMode } from './ChatLibrary'
import { reactionOptions } from './chatOptions'
import { ChatAttachments, PrivateMedia } from './Media'
import { VoiceCallButton } from './VoiceCall'

const pageSize = 30
let typingChannelCleanup = Promise.resolve()
const time = (date: string) =>
  new Date(date).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

export function Chat({ me, partner }: { me: Profile; partner?: Profile }) {
  const navigate = useNavigate()
  const location = useLocation()
  const target = new URLSearchParams(location.search).get('entry')
  const [entries, setEntries] = useState<Entry[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [text, setText] = useState('')
  const [voiceActive, setVoiceActive] = useState(false)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState<{
    id: string
    body: string
    failed: boolean
  }>()
  const [reactionFor, setReactionFor] = useState<string>()
  const [library, setLibrary] = useState<LibraryMode>()
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [favoriteRevision, setFavoriteRevision] = useState(0)
  const [highlight, setHighlight] = useState<string>()
  const [replyingTo, setReplyingTo] = useState<string>()
  const [replyText, setReplyText] = useState('')
  const [replyError, setReplyError] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const replyIds = useRef(new Map<string, string>())

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      const active = document.activeElement
      const inputFocused =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      const keyboard =
        inputFocused && window.innerHeight - viewport.height > 100
      document.documentElement.classList.toggle('chat-keyboard', keyboard)
      if (keyboard)
        document.documentElement.style.setProperty(
          '--chat-viewport',
          viewport.height + 'px',
        )
    }
    viewport.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      viewport.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
      document.documentElement.classList.remove('chat-keyboard')
      document.documentElement.style.removeProperty('--chat-viewport')
    }
  }, [])

  useEffect(() => {
    if (!target) return
    setHighlight(target)
    const timer = setTimeout(() => setHighlight(undefined), 5000)
    return () => clearTimeout(timer)
  }, [target])
  useEffect(() => {
    if (!entries.length) return
    let active = true
    const refresh = async () => {
      if (document.hidden) return
      const { data } = await db
        .from('chat_favorites')
        .select('entry_id')
        .in(
          'entry_id',
          entries.map((entry) => entry.id),
        )
      if (active && data) setFavorites(new Set(data.map((row) => row.entry_id)))
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 8000)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [entries, favoriteRevision])

  const thread = useRef<HTMLDivElement>(null)
  const scroll = useRef<{ height: number; top: number } | null>(null)
  const stick = useRef(true)
  const focused = useRef<string | null>(null)
  const presence = useRef<ReturnType<typeof db.channel> | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const action = useAction()

  useEffect(() => {
    let active = true
    let subscribed = false
    const live = new Map<string, Entry>()
    const validTarget =
      target && /^[0-9a-f-]{36}$/i.test(target) ? target : null
    async function load() {
      try {
        let query = db
          .from('chat_entries')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
        if (validTarget) {
          const focus = unwrap(
            await db
              .from('chat_entries')
              .select('created_at')
              .eq('id', validTarget)
              .maybeSingle(),
          )
          if (focus)
            query = query.or(
              'created_at.lt.' +
                focus.created_at +
                ',and(created_at.eq.' +
                focus.created_at +
                ',id.lte.' +
                validTarget +
                ')',
            )
        }
        const rows = unwrap(await query.limit(pageSize)) as Entry[]
        if (active) {
          setEntries((current) =>
            [
              ...new Map(
                [...current, ...rows, ...live.values()].map((row) => [
                  row.id,
                  row,
                ]),
              ).values(),
            ].sort(compare),
          )
          setMore(rows.length === pageSize)
        }
      } catch {
        if (active)
          setLoadError('Could not load the conversation. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }
    async function refreshReactions(ids: string[]) {
      if (!ids.length) return
      const { data } = await db
        .from('message_reactions')
        .select('*')
        .in('entry_id', ids)
      if (active && data)
        setReactions((current) => [
          ...current.filter((row) => !ids.includes(row.entry_id)),
          ...(data as Reaction[]),
        ])
    }
    const channel = db
      .channel('chat-entries:' + crypto.randomUUID())
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_entries' },
        ({ new: row }) => {
          const entry = row as Entry
          live.set(entry.id, entry)
          setEntries((current) =>
            [...current.filter((item) => item.id !== entry.id), entry].sort(
              compare,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_entries' },
        ({ new: row }) => {
          const entry = row as Entry
          live.set(entry.id, entry)
          setEntries((current) =>
            current.map((item) => (item.id === entry.id ? entry : item)),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        ({ new: row, old }) => {
          const id = (
            'entry_id' in row
              ? row.entry_id
              : (old as Partial<Reaction>).entry_id
          ) as string | undefined
          if (id) void refreshReactions([id])
        },
      )
      .subscribe((status) => {
        subscribed = status === 'SUBSCRIBED'
        if (subscribed) void load()
      })
    void typingChannelCleanup.then(() => {
      if (!active) return
      const presenceKey = crypto.randomUUID()
      const typingChannel = db
        .channel('our-space:typing', {
          config: { private: true, presence: { key: presenceKey } },
        })
        .on('presence', { event: 'sync' }, () => {
          if (active) {
            setTyping(
              Object.keys(typingChannel.presenceState()).some(
                (key) => key !== presenceKey,
              ),
            )
          }
        })
        .subscribe()
      presence.current = typingChannel
    })
    const reloadVisible = () => {
      if (!document.hidden) void load()
    }
    const fallback = setInterval(() => {
      if (!subscribed) reloadVisible()
    }, 5000)
    document.addEventListener('visibilitychange', reloadVisible)
    void load()
    return () => {
      active = false
      clearTimeout(typingTimer.current)
      clearInterval(fallback)
      document.removeEventListener('visibilitychange', reloadVisible)
      const typingChannel = presence.current
      presence.current = null
      if (typingChannel) {
        typingChannelCleanup = db.removeChannel(typingChannel).then(
          () => {},
          () => {},
        )
      }
      void db.removeChannel(channel)
    }
  }, [target, attempt])

  useEffect(() => {
    if (!entries.length) return
    const ids = entries.map((entry) => entry.id)
    let active = true
    void db
      .from('message_reactions')
      .select('*')
      .in('entry_id', ids)
      .then(({ data }) => {
        if (active && data) setReactions(data as Reaction[])
      })
    return () => {
      active = false
    }
  }, [entries])

  useEffect(() => {
    const mark = () => {
      if (document.hidden) return
      const unseen = entries
        .filter((entry) => entry.recipient_id === me.id && !entry.read_at)
        .map((entry) => entry.id)
      if (unseen.length) {
        void db.rpc('read_chat', { entries: unseen }).then(() => {}, () => {})
      }
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    window.addEventListener('focus', mark)
    const retry = setInterval(mark, 7000)
    return () => {
      document.removeEventListener('visibilitychange', mark)
      window.removeEventListener('focus', mark)
      clearInterval(retry)
    }
  }, [entries, me.id])

  useLayoutEffect(() => {
    const container = thread.current
    if (!container) return
    if (
      target &&
      focused.current !== target &&
      entries.some((entry) => entry.id === target)
    ) {
      document
        .getElementById('entry-' + target)
        ?.scrollIntoView({ block: 'center' })
      focused.current = target
      stick.current = false
    } else if (scroll.current) {
      container.scrollTop =
        scroll.current.top + container.scrollHeight - scroll.current.height
      scroll.current = null
    } else if (stick.current) {
      container.scrollTop = container.scrollHeight
    }
  }, [entries, draft, target])

  function loadOlder() {
    const first = entries[0]
    if (!first) return
    void action.run(async () => {
      const rows = unwrap(
        await db
          .from('chat_entries')
          .select('*')
          .or(
            'created_at.lt.' +
              first.created_at +
              ',and(created_at.eq.' +
              first.created_at +
              ',id.lt.' +
              first.id +
              ')',
          )
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(pageSize),
      ) as Entry[]
      if (thread.current)
        scroll.current = {
          height: thread.current.scrollHeight,
          top: thread.current.scrollTop,
        }
      setEntries((current) =>
        [
          ...new Map(
            [...rows, ...current].map((row) => [row.id, row]),
          ).values(),
        ].sort(compare),
      )
      setMore(rows.length === pageSize)
    })
  }

  async function replyToRequest(entry: Entry) {
    const content = replyText.trim()
    if (!content || content.length > 500 || replyBusy) return
    const retryId = replyIds.current.get(entry.id) ?? crypto.randomUUID()
    replyIds.current.set(entry.id, retryId)
    setReplyBusy(true)
    setReplyError('')
    try {
      unwrap(await db.rpc('respond', {
        entry: entry.id,
        reply: content,
        reply_id: retryId,
      }))
      setEntries((current) => current.map((item) =>
        item.id === entry.id ? {
          ...item, read_at: item.read_at ?? new Date().toISOString(),
          responded_at: new Date().toISOString(), reply_text: content,
        } : item,
      ))
      setReplyingTo(undefined)
      setReplyText('')
      replyIds.current.delete(entry.id)
      flushPush()
    } catch {
      setReplyError('Could not send your reply. Try again.')
    } finally {
      setReplyBusy(false)
    }
  }

  async function send(id: string, body: string) {
    stick.current = true
    setDraft({ id, body, failed: false })
    await action.run(async () => {
      try {
        unwrap(await db.rpc('send_chat', { entry: id, content: body }))
        const saved = unwrap(
          await db.from('chat_entries').select('*').eq('id', id).single(),
        ) as Entry
        setEntries((current) =>
          [...current.filter((item) => item.id !== id), saved].sort(compare),
        )
        setDraft(undefined)
        setText('')
        void presence.current?.untrack()
        flushPush()
      } catch (failure) {
        setDraft({ id, body, failed: true })
        throw failure
      }
    })
  }

  return (
    <section className="screen chat-screen">
      <div className="chat-head">
        <button
          className="chat-action"
          aria-label="Back to Home"
          onClick={() => navigate('/home')}
        >
          <ChevronLeft size={20} />
        </button>
        <button
          className="chat-action"
          aria-label="Open profile"
          onClick={() => navigate('/profile')}
        >
          <Avatar
            name={partner?.real_name ?? 'Partner'}
            path={partner?.avatar_path}
            size="medium"
          />
        </button>
        <div className="flex1">
          <h3>
            {partner?.nickname ?? 'Your partner'}{' '}
            <span className="accent">♡</span>
          </h3>
          <p>Our private conversation</p>
        </div>
        <button
          className="chat-action"
          aria-label="Search chat"
          aria-expanded={library === 'search'}
          onClick={() =>
            setLibrary(library === 'search' ? undefined : 'search')
          }
        >
          <Search size={19} />
        </button>
        <button
          className="chat-action"
          aria-label="Favorites"
          aria-expanded={library === 'favorites'}
          onClick={() =>
            setLibrary(library === 'favorites' ? undefined : 'favorites')
          }
        >
          <Star size={19} />
        </button>
        {partner && <VoiceCallButton />}
      </div>
      {library && (
        <ChatLibrary
          key={library}
          mode={library}
          me={me.id}
          partner={partner?.nickname ?? 'Your partner'}
          revision={favoriteRevision}
          close={() => setLibrary(undefined)}
          jump={(id) => {
            setLibrary(undefined)
            if (target === id) {
              document
                .getElementById('entry-' + id)
                ?.scrollIntoView({ block: 'center' })
              setHighlight(id)
              setTimeout(
                () =>
                  setHighlight((current) =>
                    current === id ? undefined : current,
                  ),
                5000,
              )
            } else navigate('/chat?entry=' + encodeURIComponent(id))
          }}
        />
      )}
      <div
        className="chat-thread"
        ref={thread}
        onScroll={(event) => {
          const element = event.currentTarget
          stick.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 70
        }}
      >
        <div className="chat-day">Just us two</div>
        {target && (
          <button className="link-btn" onClick={() => navigate('/chat')}>
            Jump to latest
          </button>
        )}
        {loading && <p className="hint">Loading conversation…</p>}
        {loadError && (
          <button
            className="ghost"
            onClick={() => {
              setLoadError('')
              setLoading(true)
              setAttempt((value) => value + 1)
            }}
          >
            {loadError}
          </button>
        )}
        {more && (
          <button className="ghost" disabled={action.busy} onClick={loadOlder}>
            Load older messages
          </button>
        )}
        {entries.map((entry) => {
          const mine = entry.sender_id === me.id
          const ownReaction = reactions.find(
            (item) => item.entry_id === entry.id && item.user_id === me.id,
          )
          const saved = favorites.has(entry.id)
          const controls = (
            <div className="chat-entry-tools">
              {reactions
                .filter((item) => item.entry_id === entry.id)
                .map((item) => (
                  <span className="reaction-badge" key={item.user_id}>
                    {item.reaction}
                  </span>
                ))}
              <button
                className="chat-action"
                aria-label="React to message"
                aria-expanded={reactionFor === entry.id}
                onClick={() => setReactionFor(entry.id)}
              >
                <SmilePlus size={17} />
              </button>
              <button
                className="chat-action"
                aria-label={
                  saved ? 'Remove from favorites' : 'Save to favorites'
                }
                aria-pressed={saved}
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    unwrap(
                      saved
                        ? await db
                            .from('chat_favorites')
                            .delete()
                            .eq('entry_id', entry.id)
                        : await db
                            .from('chat_favorites')
                            .insert({ entry_id: entry.id }),
                    )
                    setFavorites((current) => {
                      const next = new Set(current)
                      if (saved) next.delete(entry.id)
                      else next.add(entry.id)
                      return next
                    })
                    setFavoriteRevision((value) => value + 1)
                  })
                }
              >
                <Star size={16} fill={saved ? 'currentColor' : 'none'} />
              </button>
            </div>
          )
          const picker = reactionFor === entry.id && (
            <div
              className="reaction-overlay"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setReactionFor(undefined)
              }}
            >
              <button
                className="reaction-backdrop"
                aria-label="Close reactions"
                onClick={() => setReactionFor(undefined)}
              />
              <div
                className="reaction-picker"
                role="dialog"
                aria-modal="true"
                aria-label="Choose a reaction"
              >
                <div className="row spread">
                  <strong>React to message</strong>
                  <button
                    autoFocus
                    className="chat-action"
                    aria-label="Close reaction picker"
                    onClick={() => setReactionFor(undefined)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="reaction-grid">
                  {reactionOptions.map((reaction) => (
                    <button
                      key={reaction}
                      aria-pressed={ownReaction?.reaction === reaction}
                      disabled={action.busy}
                      onClick={() => {
                        setReactionFor(undefined)
                        void action.run(async () => {
                          const match = { entry_id: entry.id, user_id: me.id }
                          unwrap(
                            ownReaction?.reaction === reaction
                              ? await db
                                  .from('message_reactions')
                                  .delete()
                                  .match(match)
                              : ownReaction
                                ? await db
                                    .from('message_reactions')
                                    .update({ reaction })
                                    .match(match)
                                : await db
                                    .from('message_reactions')
                                    .insert({ ...match, reaction }),
                          )
                          setReactions((current) => [
                            ...current.filter(
                              (item) =>
                                item.entry_id !== entry.id ||
                                item.user_id !== me.id,
                            ),
                            ...(ownReaction?.reaction === reaction
                              ? []
                              : [{ ...match, reaction }]),
                          ])
                        })
                      }}
                    >
                      {reaction}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
          return (
            <article
              id={'entry-' + entry.id}
              key={entry.id}
              className={
                (entry.title ? 'chat-request' : 'msgrow') +
                (mine ? ' mine' : '') +
                (highlight === entry.id ? ' focused-entry' : '')
              }
            >
              {entry.title ? (
                <>
                  <div className="chat-request-header">
                    <div className="tile">
                      <LoveIcon icon={entry.icon ?? 'Heart'} size="big" />
                    </div>
                    <div className="flex1">
                      <div className="mini">
                        {mine
                          ? 'You sent a request'
                          : (partner?.nickname ?? 'Your partner') +
                            ' sent a request'}
                      </div>
                      <h4>{entry.title}</h4>
                    </div>
                    {mine && entry.read_at && (
                      <span className="request-status">✓✓ Seen</span>
                    )}
                  </div>
                  <p>{entry.body}</p>
                  {entry.reply_text && (
                    <p className="request-reply-saved">
                      <span aria-hidden="true">↪</span> Replied: {entry.reply_text}
                    </p>
                  )}
                  {!mine && !entry.responded_at && (
                    <div className="request-reply">
                      {replyingTo === entry.id ? (
                        <form onSubmit={(event) => {
                          event.preventDefault()
                          void replyToRequest(entry)
                        }}>
                          <textarea aria-label="Write a reply"
                            placeholder="Write a sweet reply…" rows={2}
                            maxLength={500} value={replyText}
                            onChange={(event) => setReplyText(event.target.value)} />
                          <div className="row">
                            <button className="outline" type="button"
                              onClick={() => { setReplyingTo(undefined); setReplyError('') }}>
                              Cancel
                            </button>
                            <button className="primary" type="submit"
                              disabled={!replyText.trim() || replyBusy}
                              aria-label="Send request reply">
                              <Send size={16} /> {replyBusy ? 'Sending…' : 'Send reply'}
                            </button>
                          </div>
                          {replyError && <p role="alert">{replyError}</p>}
                        </form>
                      ) : (
                        <button type="button" className="outline request-reply-open"
                          aria-label="Reply to request"
                          onClick={() => { setReplyingTo(entry.id); setReplyText(''); setReplyError('') }}>
                          Reply to request
                        </button>
                      )}
                    </div>
                  )}
                  <div className="chat-entry-footer">
                    <div className="mini">{time(entry.created_at)}</div>
                    {controls}
                  </div>
                </>
              ) : (
                <div className="bubble">
                  {entry.media_kind && entry.media_path && (
                    <PrivateMedia
                      bucket="our-space-chat-media"
                      path={entry.media_path}
                      kind={entry.media_kind}
                      alt={entry.body}
                      duration={entry.duration_seconds}
                    />
                  )}
                  {entry.in_reply_to && (
                    <div className="reply-context">
                      ↪ Reply to {entries.find((item) => item.id === entry.in_reply_to)?.title ?? 'Attention Request'}
                    </div>
                  )}
                  {(!entry.media_kind ||
                    !['Photo', 'Voice message'].includes(entry.body)) &&
                    entry.body}
                  <div className="chat-entry-footer">
                    <div className="time">
                      {time(entry.created_at)}
                      {mine && (
                        <span className={'chat-delivery ' + (entry.read_at ? 'is-seen' : '')}
                          aria-label={entry.read_at ? 'Seen' : 'Sent'}>
                          {entry.read_at ? ' · ✓✓ Seen' : ' · ✓ Sent'}
                        </span>
                      )}
                    </div>
                    {controls}
                  </div>
                </div>
              )}
              {picker}
            </article>
          )
        })}
        {draft && !entries.some((entry) => entry.id === draft.id) && (
          <div className="msgrow mine">
            <div className="bubble">
              {draft.body}
              <div className="time">
                {draft.failed ? 'Could not send' : 'Sending…'}
              </div>
              {draft.failed && (
                <button
                  className="retry"
                  disabled={action.busy}
                  onClick={() => void send(draft.id, draft.body)}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {typing && (
        <p className="hint" role="status">
          {partner?.nickname ?? 'Your partner'} is typing…
        </p>
      )}
      <ErrorMessage value={action.error} />
      <form
        className={'compose' + (voiceActive ? ' voice-active' : '')}
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim() && !action.busy)
            void send(
              draft?.body === text.trim() ? draft.id : crypto.randomUUID(),
              text.trim(),
            )
        }}
      >
        <ChatAttachments
          userId={me.id}
          onVoiceModeChange={setVoiceActive}
          onSent={async (id) => {
            flushPush()
            const entry = unwrap(
              await db.from('chat_entries').select('*').eq('id', id).single(),
            ) as Entry
            stick.current = true
            setEntries((current) =>
              [...current.filter((item) => item.id !== id), entry].sort(
                compare,
              ),
            )
          }}
        />
        {!voiceActive && (
        <input
          aria-label="Message"
          placeholder="Message…"
          maxLength={2000}
          value={text}
          disabled={Boolean(draft && !draft.failed)}
          onChange={(event) => {
            setText(event.target.value)
            const channel = presence.current
            if (!channel || channel.state !== 'joined') return
            clearTimeout(typingTimer.current)
            if (event.target.value.trim()) {
              void channel.track({ typing: true })
              typingTimer.current = setTimeout(
                () => void channel.untrack(),
                2500,
              )
            } else void channel.untrack()
          }}
        />
        )}
        {!voiceActive && (
        <button
          className="send"
          aria-label="Send message"
          disabled={!text.trim() || action.busy}
        >
          <Send className="icon" />
        </button>
        )}
      </form>
    </section>
  )
}

function compare(a: Entry, b: Entry) {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
}
