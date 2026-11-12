import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArrowDown,
  CalendarCheck,
  Check,
  Heart,
  Pencil,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { celebrationOn, daysUntil, prettyDate, timeSince } from './calendar'
import { db, photos, savePhoto, unwrap } from './data'
import type { Milestone, Profile } from './data'
import {
  ErrorMessage,
  Field,
  Header,
  Page,
  PhotoPicker,
  Setting,
  useAction,
} from './ui'

export function Dates({ me, dates }: { me: Profile; dates: Milestone[] }) {
  const navigate = useNavigate()
  const dated = dates
    .filter((date): date is Milestone & { original_date: string } =>
      Boolean(date.original_date),
    )
    .sort((a, b) => b.original_date.localeCompare(a.original_date))
  const pending = dates.filter((date) => !date.original_date)
  return (
    <section className="screen">
      <Header name={me.real_name} path={me.avatar_path} />
      <div className="eyebrow">Every moment matters</div>
      <h1 className="page-title mt8">
        Our Dates <span className="accent">♡</span>
      </h1>
      <p className="page-sub">A timeline of the days that made us, us.</p>
      <button
        className="outline wide mt22"
        onClick={() => navigate('/dates/new')}
      >
        <Plus className="icon" /> Add a special date
      </button>
      <div className="sect">
        <h3>Our story so far</h3>
        <span className="badge">Newest → oldest</span>
      </div>
      <div className="timeline">
        {dated.map((date) => {
          const remaining = daysUntil(date.original_date, date.annual)
          const elapsed = timeSince(date.original_date)
          return (
            <div className="tl-row" key={date.id}>
              <div className="tl-track">
                <div className="tl-dot">
                  {date.celebration === 'kisses' ? (
                    '💋'
                  ) : date.celebration === 'anniversary' ? (
                    <Heart className="icon small" />
                  ) : (
                    <CalendarCheck className="icon small" />
                  )}
                </div>
                <div className="tl-stem" />
              </div>
              <div className="tl-body">
                <div className="date-card">
                  <div className="row spread">
                    <h3>{date.title}</h3>
                    {(!date.slug || date.reserved) && (
                      <button
                        className="link-btn"
                        aria-label={'Edit ' + date.title}
                        onClick={() => navigate('/dates/' + date.id)}
                      >
                        <Pencil className="icon small" />
                      </button>
                    )}
                  </div>
                  <div className="date">{prettyDate(date.original_date)}</div>
                  <div className="date-meta">
                    {elapsed && <span>{elapsed} ago</span>}
                    {remaining >= 0 && (date.annual || remaining > 0) && (
                      <span>
                        {remaining === 0
                          ? 'Today'
                          : remaining + ' days to next'}
                      </span>
                    )}
                  </div>
                  {date.celebration === 'kisses' && (
                    <div className="hint mt8">
                      💋 Floating kisses every February 26
                    </div>
                  )}
                  {date.celebration === 'anniversary' && (
                    <div className="hint mt8">
                      <Sparkles className="icon small" /> 2-minute celebration
                      every December 5
                    </div>
                  )}
                  {date.note && <p className="hint mt8">{date.note}</p>}
                  {date.photo_path && <DatePhoto path={date.photo_path} />}
                </div>
              </div>
            </div>
          )
        })}
        <div className="row hint">
          <ArrowDown className="icon small" /> The beginning of our story
        </div>
      </div>
      <div className="sect">
        <h3>Our future milestones</h3>
      </div>
      {pending.map((date) => (
        <Setting
          key={date.id}
          title={date.title}
          caption="Date not set yet · Tap to add"
          icon={<CalendarCheck />}
          action={() => navigate('/dates/' + date.id)}
        />
      ))}
    </section>
  )
}

function DatePhoto({ path }: { path: string }) {
  const [signed, setSigned] = useState('')
  useEffect(() => {
    let active = true
    void photos.createSignedUrl(path, 900).then(({ data }) => {
      if (active && data) setSigned(data.signedUrl)
    })
    return () => {
      active = false
    }
  }, [path])
  return (
    signed && <img className="date-photo mt8" src={signed} alt="Special date" />
  )
}

export function DateEditor({
  dates,
  reload,
}: {
  dates: Milestone[]
  reload: () => Promise<void>
}) {
  const { id } = useParams()
  const date = dates.find((item) => item.id === id)
  const navigate = useNavigate()
  const action = useAction()
  const [file, setFile] = useState<Blob | null>()
  return (
    <Page
      title={date ? 'Edit Special Date' : 'Add a Special Date'}
      back="/dates"
    >
      <p className="page-sub">Keep another chapter of our story.</p>
      <form
        className="mt22"
        onSubmit={(event) => {
          event.preventDefault()
          const fields = new FormData(event.currentTarget)
          void action.run(async () => {
            const photo_path =
              file === undefined
                ? (date?.photo_path ?? null)
                : await savePhoto('dates', file)
            const values = {
              title: String(fields.get('title')).trim(),
              original_date: fields.get('date') || null,
              annual: fields.has('annual'),
              note: String(fields.get('note')).trim(),
              photo_path,
            }
            try {
              unwrap(
                date
                  ? await db
                      .from('important_dates')
                      .update(values)
                      .eq('id', date.id)
                      .select('id')
                      .single()
                  : await db.from('important_dates').insert(values),
              )
            } catch (failure) {
              if (photo_path && photo_path !== date?.photo_path)
                await photos.remove([photo_path])
              throw failure
            }
            if (date?.photo_path && date.photo_path !== photo_path)
              await photos.remove([date.photo_path])
            await reload()
            navigate('/dates')
          })
        }}
      >
        <Field label="Event name">
          <input
            name="title"
            defaultValue={date?.title}
            placeholder="e.g. Our next adventure"
            maxLength={70}
            required
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            name="date"
            defaultValue={date?.original_date ?? ''}
          />
        </Field>
        <label className="checkboxline">
          <input
            type="checkbox"
            name="annual"
            defaultChecked={date?.annual ?? true}
          />{' '}
          Countdown to this date every year
        </label>
        <div className="mt16">
          <Field label="Our little note (optional)">
            <textarea
              name="note"
              maxLength={500}
              defaultValue={date?.note}
              placeholder="What made this day special?"
            />
          </Field>
        </div>
        <PhotoPicker
          name="♡"
          path={date?.photo_path ?? null}
          onChange={setFile}
        />
        <button className="primary wide" disabled={action.busy}>
          <Check className="icon small" /> Save Special Date
        </button>
        {date && !date.slug && (
          <button
            className="outline wide mt8"
            type="button"
            disabled={action.busy}
            onClick={() => {
              if (!confirm('Delete this special date?')) return
              void action.run(async () => {
                unwrap(
                  await db.from('important_dates').delete().eq('id', date.id),
                )
                if (date.photo_path) await photos.remove([date.photo_path])
                await reload()
                navigate('/dates')
              })
            }}
          >
            Delete Date
          </button>
        )}
        <ErrorMessage value={action.error} />
      </form>
    </Page>
  )
}

export function Celebration({
  me,
  dates,
}: {
  me: Profile
  dates: Milestone[]
}) {
  const [occasion, setOccasion] =
    useState<ReturnType<typeof celebrationOn>>(null)
  const reduced =
    me.reduce_motion || matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    let opened: number | undefined
    let previous: ReturnType<typeof celebrationOn> = null
    function tick() {
      if (document.hidden) {
        previous = null
        opened = undefined
        setOccasion(null)
        return
      }
      const today = celebrationOn(new Date())
      if (today !== previous) opened = performance.now()
      previous = today
      setOccasion(
        today === 'anniversary' && performance.now() - (opened ?? 0) >= 120000
          ? null
          : today,
      )
    }
    tick()
    document.addEventListener('visibilitychange', tick)
    const timer = setInterval(tick, 250)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  if (!occasion) return null
  const original = dates.find(
    (date) => date.celebration === 'anniversary',
  )?.original_date
  const years = original
    ? new Date().getFullYear() - Number(original.slice(0, 4))
    : 0
  const bits =
    occasion === 'kisses' ? ['💋', '♥', '💋'] : ['♥', '✦', '✨', '❤', '✧']
  return (
    <aside className="celebrate" aria-label="Celebration">
      <div className="celebrate-word">
        <strong>
          {occasion === 'anniversary'
            ? 'Happy Anniversary!'
            : 'Our First Kiss 💋'}
        </strong>
        <span>
          {occasion === 'anniversary'
            ? years
              ? years +
                ' beautiful ' +
                (years === 1 ? 'year' : 'years') +
                ' together.'
              : 'Another beautiful year together.'
            : 'The sweetest first kiss, remembered every year.'}
        </span>
      </div>
      {!reduced &&
        Array.from({ length: 24 }, (_, i) => (
          <span
            aria-hidden="true"
            className="floatbit"
            key={i}
            style={
              {
                '--left': ((i * 37) % 91) + '%',
                '--size': 13 + ((i * 7) % 25) + 'px',
                '--dur': 5 + (i % 5) + 's',
                '--delay': -(i % 7) + 's',
              } as CSSProperties
            }
          >
            {bits[i % bits.length]}
          </span>
        ))}
    </aside>
  )
}
