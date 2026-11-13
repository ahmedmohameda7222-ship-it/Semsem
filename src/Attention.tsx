import { useEffect, useState } from 'react'
import {
  Heart,
  HeartHandshake,
  HandHeart,
  HeartPulse,
  Smile,
  Sparkles,
  Star,
  Gift,
  Flower2,
  HeartCrack,
  Moon,
  BedDouble,
  Baby,
  Hand,
  Armchair,
  Sun,
  Umbrella,
  Phone,
  Video,
  MessageCircle,
  Mic,
  Headphones,
  Bell,
  Camera,
  Mail,
  Megaphone,
  CalendarHeart,
  Coffee,
  Film,
  Gamepad2,
  Music,
  MapPin,
  Footprints,
  Utensils,
  Cake,
  Soup,
  IceCreamCone,
  BookOpen,
  Plane,
  Plus,
  ChevronRight,
  Ellipsis,
  Check,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, flushPush, unwrap } from './data'
import type { Milestone, Profile, Template } from './data'
import { daysUntil, prettyDate } from './calendar'
import { ErrorMessage, Field, Header, Page, useAction } from './ui'
import { IntimateRequests } from './IntimateRequests'
import { DailyMessages } from './DailyMessages'

const catalog = {
  Love: {
    Heart: 'Love heart',
    HeartHandshake: 'Hug closeness',
    HandHeart: 'Hand hold affection',
    HeartPulse: 'Miss you',
    Smile: 'Cheer up smile',
    Sparkles: 'Attention magic',
    Star: 'Compliment star',
    Gift: 'Surprise present',
    Flower2: 'Flowers bouquet',
    HeartCrack: 'Feeling sad',
  },
  Closeness: {
    kiss: 'Kiss lips',
    Moon: 'Good night cuddle',
    BedDouble: 'Cuddles bed',
    Baby: 'Baby family',
    Hand: 'Hold my hand',
    Armchair: 'Sit together',
    Sun: 'Good morning sunshine',
    Umbrella: 'Comfort support',
  },
  Communication: {
    Phone: 'Call me phone',
    Video: 'FaceTime video call',
    MessageCircle: 'Sweet text',
    Mic: 'Voice note',
    Headphones: 'Listen',
    Bell: 'Gentle reminder',
    Camera: 'Send photo selfie',
    Mail: 'Love letter',
    Megaphone: 'Tell me something',
  },
  Time: {
    CalendarHeart: 'Date night',
    Coffee: 'Coffee together',
    Film: 'Movie night',
    Gamepad2: 'Play a game',
    Music: 'Music song',
    MapPin: 'Go somewhere',
    Footprints: 'Walk together',
    Utensils: 'Dinner together',
    Cake: 'Birthday treat',
    Soup: 'Comfort food',
    IceCreamCone: 'Ice cream',
    BookOpen: 'Read together',
    Plane: 'Travel together',
  },
}
const moodChoices = [
  { id: 'happy', label: 'Happy', emoji: '😊' },
  { id: 'missing', label: 'Missing you', emoji: '🥺' },
  { id: 'sad', label: 'Sad', emoji: '😢' },
  { id: 'tired', label: 'Tired', emoji: '😴' },
  { id: 'stressed', label: 'Stressed', emoji: '😣' },
  { id: 'excited', label: 'Excited', emoji: '✨' },
  { id: 'loved', label: 'Loved', emoji: '🥰' },
] as const

const labels = Object.assign({}, ...Object.values(catalog)) as Record<
  string,
  string
>

const glyphs = {
  Heart,
  HeartHandshake,
  HandHeart,
  HeartPulse,
  Smile,
  Sparkles,
  Star,
  Gift,
  Flower2,
  HeartCrack,
  Moon,
  BedDouble,
  Baby,
  Hand,
  Armchair,
  Sun,
  Umbrella,
  Phone,
  Video,
  MessageCircle,
  Mic,
  Headphones,
  Bell,
  Camera,
  Mail,
  Megaphone,
  CalendarHeart,
  Coffee,
  Film,
  Gamepad2,
  Music,
  MapPin,
  Footprints,
  Utensils,
  Cake,
  Soup,
  IceCreamCone,
  BookOpen,
  Plane,
}

const shortLabels: Record<string, string> = {
  Heart: 'Heart',
  HeartHandshake: 'Hug',
  Sparkles: 'Attention',
  Star: 'Compliment',
  Gift: 'Surprise',
  Flower2: 'Flowers',
  kiss: 'Kiss',
  BedDouble: 'Cuddles',
  Baby: 'Baby',
  Hand: 'Hold hands',
  Umbrella: 'Comfort',
  Video: 'Video call',
  Bell: 'Reminder',
  Megaphone: 'Tell me',
  IceCreamCone: 'Ice cream',
}

export function LoveIcon({ icon, size = '' }: { icon: string; size?: string }) {
  if (icon === 'kiss')
    return (
      <span aria-hidden className={'kiss-icon ' + size}>
        💋
      </span>
    )
  const Icon = Object.hasOwn(glyphs, icon)
    ? glyphs[icon as keyof typeof glyphs]
    : Heart
  return <Icon className={'icon ' + size} aria-hidden />
}

export function Home({
  me,
  partner,
  buttons,
  dates,
}: {
  me: Profile
  partner?: Profile
  buttons: Template[]
  dates: Milestone[]
}) {
  const navigate = useNavigate()
  const [moodOpen, setMoodOpen] = useState(false)
  const [moodMessage, setMoodMessage] = useState('')
  const moodAction = useAction()
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3200)
    return () => clearTimeout(timer)
  }, [notice])
  const [pending, setPending] = useState<{
    button: string
    entry: string
    failed: boolean
  }>()
  const action = useAction()
  const hour = new Date().getHours()
  const next = dates
    .flatMap((date) =>
      date.original_date
        ? [
            {
              ...date,
              original_date: date.original_date,
              days: daysUntil(date.original_date, date.annual),
            },
          ]
        : [],
    )
    .filter((date) => date.days >= 0)
    .sort((a, b) => a.days - b.days)[0]
  async function send(button: string, entry: string) {
    setNotice('')
    setPending({ button, entry, failed: false })
    await action.run(async () => {
      try {
        unwrap(await db.rpc('send_chat', { entry, button }))
        flushPush()
        setPending(undefined)
        setNotice('Sent to ' + (partner?.nickname ?? 'your partner') + ' ❤️')
      } catch (failure) {
        setPending({ button, entry, failed: true })
        throw failure
      }
    })
  }
  return (
    <section className="screen">
      <Header name={me.real_name} path={me.avatar_path} />
      <div className="eyebrow">A little love, every day</div>
      <h1 className="page-title mt8">
        {hour < 12
          ? 'Good morning'
          : hour < 17
            ? 'Good afternoon'
            : 'Good evening'}
        ,<br />
        {me.nickname} <span className="accent">♡</span>
      </h1>
      <div className="hero">
        <h2>I love You Mi Amor</h2>
      </div>
      <div className="mood-panel">
        <div className="row spread">
          <div>
            <strong>How are you feeling?</strong>
            <p className="hint mt8">{me.mood ? ('Current mood: ' + (moodChoices.find((m) => m.id === me.mood)?.label ?? me.mood)) : 'Share your mood with your person.'}</p>
          </div>
          <button type="button" className="outline" aria-label="Set your mood"
            aria-expanded={moodOpen} onClick={() => setMoodOpen(!moodOpen)}>
            Set your mood
          </button>
        </div>
        {moodOpen && (
          <div className="mood-options" aria-label="Choose your mood">
            {moodChoices.map((mood) => (
              <button key={mood.id} type="button" disabled={moodAction.busy}
                aria-pressed={me.mood === mood.id}
                onClick={() => {
                  void moodAction.run(async () => {
                    unwrap(await db.rpc('set_mood', {
                      new_mood: mood.id,
                      entry: crypto.randomUUID(),
                    }))
                    setMoodOpen(false)
                    setMoodMessage('Your mood was shared with ' + (partner?.nickname ?? 'your partner') + ' ❤️')
                    flushPush()
                  })
                }}>
                <span aria-hidden="true">{mood.emoji}</span> {mood.label}
              </button>
            ))}
          </div>
        )}
        {moodMessage && <p className="hint mt8" role="status">{moodMessage}</p>}
        <ErrorMessage value={moodAction.error} />
      </div>
      <div className="sect">
        <h3>Your love buttons</h3>
        <button className="link-btn" onClick={() => navigate('/buttons/new')}>
          <Plus className="icon small" /> New button
        </button>
      </div>
      <div className="request-grid">
        {buttons.map((button) => (
          <div className="request" key={button.id}>
            <button
              className="request-main"
              disabled={action.busy}
              onClick={() =>
                void send(
                  button.id,
                  pending?.button === button.id
                    ? pending.entry
                    : crypto.randomUUID(),
                )
              }
            >
              <span
                className="icon-tile"
                style={{ background: button.tint + '26' }}
              >
                <LoveIcon icon={button.icon} size="big" />
              </span>
              <strong>{button.title}</strong>
              <span className="tap">
                {pending?.button === button.id && pending.failed
                  ? 'Retry send'
                  : 'Tap to send'}{' '}
                <ChevronRight className="icon small" />
              </span>
            </button>
            <button
              className="request-edit"
              aria-label={'Edit ' + button.title}
              onClick={() => navigate('/buttons/' + button.id)}
            >
              <Ellipsis className="icon" />
            </button>
          </div>
        ))}
      </div>
      <DailyMessages me={me} partner={partner} />
      <IntimateRequests me={me} partner={partner} />
      {(pending || notice) && (
        <div className={'send-toast' + (!pending && notice ? ' success' : '')}>
          <span role={pending?.failed ? 'alert' : 'status'}>
            {pending?.failed
              ? 'Could not send the request.'
              : pending
                ? 'Sending…'
                : notice}
          </span>
          {pending?.failed && (
            <button
              className="link-btn"
              onClick={() => void send(pending.button, pending.entry)}
            >
              Retry
            </button>
          )}
        </div>
      )}
      <div className="sect">
        <h3>Our next special day</h3>
        <button className="link-btn" onClick={() => navigate('/dates')}>
          See all
        </button>
      </div>
      {next && (
        <div className="card next-event">
          <div className="count">
            <b>{next.days}</b>
            <span>{next.days === 1 ? 'day left' : 'days left'}</span>
          </div>
          <div className="flex1">
            <strong>{next.title}</strong>
            <p className="hint mt8">
              {prettyDate(next.original_date)}
              {next.annual && ' · Every year'}
            </p>
          </div>
          <Heart className="icon big" />
        </div>
      )}
    </section>
  )
}

export function ButtonEditor({
  buttons,
  partner,
  reload,
}: {
  buttons: Template[]
  partner?: Profile
  reload: () => Promise<void>
}) {
  const { id } = useParams()
  const template = buttons.find((button) => button.id === id)
  const navigate = useNavigate()
  const action = useAction()
  const [icon, setIcon] = useState(template?.icon ?? 'Heart')
  const [tint, setTint] = useState(template?.tint ?? '#BA314F')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<keyof typeof catalog | 'All'>('All')
  const [message, setMessage] = useState(template?.message ?? '')
  const visible = (
    category === 'All'
      ? Object.entries(labels)
      : Object.entries(catalog[category])
  ).filter(([key, label]) =>
    (key + ' ' + label).toLowerCase().includes(search.trim().toLowerCase()),
  )
  return (
    <Page
      title={template ? 'Edit Love Button' : 'Create a Love Button'}
      back="/home"
    >
      <p className="page-sub">
        Give your partner a little nudge, in your own words.
      </p>
      <form
        className="mt22"
        onSubmit={(event) => {
          event.preventDefault()
          const fields = new FormData(event.currentTarget)
          const values = {
            title: String(fields.get('title')).trim(),
            icon,
            tint,
            message: message.trim(),
            favorite: fields.has('favorite'),
          }
          void action.run(async () => {
            if (!values.title || !values.message)
              throw new Error('Add a title and notification message.')
            unwrap(
              template
                ? await db
                    .from('attention_buttons')
                    .update(values)
                    .eq('id', template.id)
                    .select('id')
                    .single()
                : await db.from('attention_buttons').insert(values),
            )
            await reload()
            navigate('/home')
          })
        }}
      >
        <Field label="Button name">
          <input
            name="title"
            required
            maxLength={40}
            defaultValue={template?.title}
            placeholder="e.g. I need a hug"
          />
        </Field>
        <Field label="Find an icon">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search icons"
          />
        </Field>
        <div className="chiprow">
          {(
            ['All', ...Object.keys(catalog)] as (keyof typeof catalog | 'All')[]
          ).map((group) => (
            <button
              className={category === group ? 'on' : ''}
              type="button"
              key={group}
              aria-pressed={category === group}
              onClick={() => setCategory(group)}
            >
              {group}
            </button>
          ))}
        </div>
        <div className="icon-grid">
          {visible.map(([key, label]) => (
            <button
              type="button"
              className={icon === key ? 'icon-option active' : 'icon-option'}
              aria-pressed={icon === key}
              aria-label={label}
              key={key}
              onClick={() => setIcon(key)}
            >
              <LoveIcon icon={key} />
              <span>
                {shortLabels[key] ?? label.split(' ').slice(0, 2).join(' ')}
              </span>
            </button>
          ))}
        </div>
        {!visible.length && <p className="hint">No matching icons.</p>}
        <div className="row mt16">
          <label className="field-label" htmlFor="tint">
            Button color
          </label>
          <input
            id="tint"
            type="color"
            value={tint}
            onChange={(event) => setTint(event.target.value)}
          />
        </div>
        <label className="checkboxline mt16">
          <input
            type="checkbox"
            name="favorite"
            defaultChecked={template?.favorite}
          />{' '}
          Show among favorites
        </label>
        <div className="mt16">
          <Field label="Notification message">
            <textarea
              required
              maxLength={160}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write a little note…"
            />
          </Field>
        </div>
        <div className="card row mb18">
          <LoveIcon icon={icon} />
          <div>
            <strong>Notification preview</strong>
            <p className="hint">
              {message ||
                'Your message for ' + (partner?.nickname ?? 'your partner')}
            </p>
          </div>
        </div>
        <button className="primary wide" disabled={action.busy}>
          <Check className="icon small" /> Save Button
        </button>
        {template && (
          <button
            className="outline wide mt8"
            type="button"
            disabled={action.busy}
            onClick={() => {
              if (
                !confirm(
                  'Delete this love button? Sent requests will stay in chat.',
                )
              )
                return
              void action.run(async () => {
                unwrap(
                  await db
                    .from('attention_buttons')
                    .delete()
                    .eq('id', template.id),
                )
                await reload()
                navigate('/home')
              })
            }}
          >
            Delete Button
          </button>
        )}
        <ErrorMessage value={action.error} />
      </form>
    </Page>
  )
}
