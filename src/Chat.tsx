import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Ellipsis, Send, SmilePlus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { db, flushPush, unwrap } from './data'
import type { Entry, Profile, Reaction } from './data'
import { LoveIcon } from './Attention'
import { Avatar, ErrorMessage, useAction } from './ui'

const pageSize = 30
let typingChannelCleanup = Promise.resolve()
const reactionOptions = ['❤️', '🥰', '😂', '✨']
const replies = [
  ['On my way ♡', 'On my way, love ♡'],
  ['I love you', 'I love you too ❤️'],
  ['Calling now', 'Calling you now!'],
  ['Responded', null],
] as const
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
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState<{
    id: string
    body: string
    failed: boolean
  }>()
  const [reactionFor, setReactionFor] = useState<string>()
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
      if (unseen.length) void db.rpc('read_chat', { entries: unseen })
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
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
        <Avatar
          name={partner?.real_name ?? 'Partner'}
          path={partner?.avatar_path}
          size="medium"
        />
        <div className="flex1">
          <h3>
            {partner?.nickname ?? 'Your partner'}{' '}
            <span className="accent">♡</span>
          </h3>
          <p>Our private conversation</p>
        </div>
        <button
          className="icon-btn"
          aria-label="Open profile"
          onClick={() => navigate('/profile')}
        >
          <Ellipsis className="icon" />
        </button>
      </div>
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
          return (
            <article
              id={'entry-' + entry.id}
              key={entry.id}
              className={
                (entry.title ? 'chat-request' : 'msgrow') +
                (mine ? ' mine' : '') +
                (target === entry.id ? ' focused-entry' : '')
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
                    <span className="request-status">
                      {entry.responded_at
                        ? 'Responded'
                        : entry.read_at
                          ? 'Seen'
                          : 'Pending'}
                    </span>
                  </div>
                  <p>{entry.body}</p>
                  <div className="mini">{time(entry.created_at)}</div>
                  {!mine && !entry.responded_at && (
                    <div className="request-actions mt8">
                      {replies.map(([label, reply]) => (
                        <button
                          disabled={action.busy}
                          key={label}
                          onClick={() =>
                            void action.run(async () => {
                              unwrap(
                                await db.rpc('respond', {
                                  entry: entry.id,
                                  reply,
                                  reply_id: crypto.randomUUID(),
                                }),
                              )
                              if (reply) flushPush()
                              const saved = unwrap(
                                await db
                                  .from('chat_entries')
                                  .select('*')
                                  .eq('id', entry.id)
                                  .single(),
                              ) as Entry
                              setEntries((current) =>
                                current.map((item) =>
                                  item.id === saved.id ? saved : item,
                                ),
                              )
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="bubble">
                  {entry.body}
                  <div className="time">
                    {time(entry.created_at)}
                    {mine && (entry.read_at ? ' · Read' : ' · Sent')}
                  </div>
                </div>
              )}
              <div className="reactions">
                <button
                  className="reaction-button"
                  aria-label="React to message"
                  aria-expanded={reactionFor === entry.id}
                  onClick={() =>
                    setReactionFor(
                      reactionFor === entry.id ? undefined : entry.id,
                    )
                  }
                >
                  <SmilePlus className="icon small" />
                </button>
                {reactions
                  .filter((item) => item.entry_id === entry.id)
                  .map((item) => (
                    <span key={item.user_id}>{item.reaction}</span>
                  ))}
                {reactionFor === entry.id &&
                  reactionOptions.map((reaction) => (
                    <button
                      key={reaction}
                      className="reaction-button"
                      onClick={() =>
                        void action.run(async () => {
                          if (ownReaction?.reaction === reaction)
                            unwrap(
                              await db
                                .from('message_reactions')
                                .delete()
                                .match({ entry_id: entry.id, user_id: me.id }),
                            )
                          else if (ownReaction)
                            unwrap(
                              await db
                                .from('message_reactions')
                                .update({ reaction })
                                .match({ entry_id: entry.id, user_id: me.id }),
                            )
                          else
                            unwrap(
                              await db.from('message_reactions').insert({
                                entry_id: entry.id,
                                user_id: me.id,
                                reaction,
                              }),
                            )
                          setReactions((current) => [
                            ...current.filter(
                              (item) =>
                                item.entry_id !== entry.id ||
                                item.user_id !== me.id,
                            ),
                            ...(ownReaction?.reaction === reaction
                              ? []
                              : [
                                  {
                                    entry_id: entry.id,
                                    user_id: me.id,
                                    reaction,
                                  },
                                ]),
                          ])
                          setReactionFor(undefined)
                        })
                      }
                    >
                      {reaction}
                    </button>
                  ))}
              </div>
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
        className="compose"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim() && !action.busy)
            void send(
              draft?.body === text.trim() ? draft.id : crypto.randomUUID(),
              text.trim(),
            )
        }}
      >
        <input
          aria-label="Message"
          placeholder={'Message ' + (partner?.nickname ?? 'your partner') + '…'}
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
        <button
          className="send"
          aria-label="Send message"
          disabled={!text.trim() || action.busy}
        >
          <Send className="icon" />
        </button>
      </form>
    </section>
  )
}

function compare(a: Entry, b: Entry) {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
}
