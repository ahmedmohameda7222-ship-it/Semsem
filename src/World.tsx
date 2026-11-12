import { useState } from 'react'
import {
  Baby,
  Camera,
  Check,
  ChevronRight,
  Heart,
  Plus,
  TreeDeciduous,
  Wine,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, photos, savePhoto, unwrap } from './data'
import type { Child, Note, Profile } from './data'
import { prettyDate } from './calendar'
import {
  Avatar,
  ErrorMessage,
  Field,
  Header,
  Page,
  PhotoPicker,
  useAction,
} from './ui'

export function World({ me }: { me: Profile }) {
  const navigate = useNavigate()
  return (
    <section className="screen">
      <Header name={me.real_name} path={me.avatar_path} />
      <div className="eyebrow">Our own little world</div>
      <h1 className="page-title mt8">
        Our World <span className="accent">♡</span>
      </h1>
      <p className="page-sub">A place for everything we’re dreaming of.</p>
      <div className="world-cover mt22">
        <div className="eyebrow">Together, always</div>
        <h2>A beautiful story, still unfolding.</h2>
        <p>Memories to keep and a future to dream about.</p>
      </div>
      <div className="sect">
        <h3>Made for us</h3>
      </div>
      {(
        [
          [
            'family',
            'Our Family Tree',
            'Our roots and our future children',
            TreeDeciduous,
          ],
          [
            'jar',
            'Our Love Jar',
            'Little notes for the days we need them',
            Wine,
          ],
          [
            'memories',
            'Our Memories',
            'A future gallery for favorite moments',
            Camera,
          ],
        ] as const
      ).map(([path, name, description, Icon]) => (
        <button
          key={path}
          className="world-link"
          onClick={() => navigate('/world/' + path)}
        >
          <span className="tile">
            <Icon className="icon big" />
          </span>
          <span className="flex1">
            <strong>{name}</strong>
            <p>{description}</p>
          </span>
          <ChevronRight className="icon small" />
        </button>
      ))}
    </section>
  )
}

export function Family({
  profiles,
  children,
}: {
  profiles: Profile[]
  children: Child[]
}) {
  const navigate = useNavigate()
  return (
    <Page title="Our Family Tree" back="/world">
      <p className="page-sub">
        Our roots, our hearts, and the family we’re dreaming of.
      </p>
      <div className="family-parents">
        {profiles.map((profile) => (
          <div className="person-node" key={profile.id}>
            <Avatar
              name={profile.real_name}
              path={profile.avatar_path}
              size="medium"
            />
            <h3>{profile.real_name}</h3>
            <span className="nick">{profile.nickname}</span>
            <span className="role">{profile.role}</span>
            <span className="birth">{prettyDate(profile.dob, true)}</span>
          </div>
        ))}
      </div>
      <div className="branch">
        <span className="heart">♥</span>
      </div>
      {children.length ? (
        <div className="children">
          {children.map((child) => (
            <button
              key={child.id}
              className={
                'child-node ' + (child.status === 'born' ? 'born' : '')
              }
              onClick={() => navigate('/world/family/' + child.id)}
            >
              {child.avatar_path ? (
                <Avatar
                  name={child.name}
                  path={child.avatar_path}
                  size="medium"
                />
              ) : (
                <Baby className="icon big" />
              )}
              <strong>{child.name}</strong>
              <small>
                {child.gender === 'boy' ? 'Boy' : 'Girl'} ·{' '}
                {child.status === 'born' && child.birth_date
                  ? prettyDate(child.birth_date)
                  : 'Not Born Yet'}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <div className="family-empty">
          <Baby className="icon" />
          <strong>Our future little family</strong>
          <span>No children added yet.</span>
        </div>
      )}
      <button
        className="primary wide mt22"
        onClick={() => navigate('/world/family/new')}
      >
        <Plus className="icon" /> Add a Child
      </button>
      <p className="hint mt16 center">
        Future children don’t need a birth date yet. Tap any child to edit
        later.
      </p>
    </Page>
  )
}

export function ChildEditor({
  children,
  reload,
}: {
  children: Child[]
  reload: () => Promise<void>
}) {
  const { id } = useParams()
  const child = children.find((item) => item.id === id)
  const navigate = useNavigate()
  const action = useAction()
  const [status, setStatus] = useState(child?.status ?? 'not_born_yet')
  const [file, setFile] = useState<Blob | null>()
  return (
    <Page title={child ? 'Edit Child' : 'Add a Child'} back="/world/family">
      <form
        className="mt22"
        onSubmit={(event) => {
          event.preventDefault()
          const fields = new FormData(event.currentTarget)
          void action.run(async () => {
            const avatar_path =
              file === undefined
                ? (child?.avatar_path ?? null)
                : await savePhoto('children', file)
            const values = {
              name: String(fields.get('name')).trim(),
              gender: fields.get('gender'),
              status,
              birth_date: fields.get('birth_date') || null,
              avatar_path,
            }
            try {
              unwrap(
                child
                  ? await db
                      .from('family_children')
                      .update(values)
                      .eq('id', child.id)
                      .select('id')
                      .single()
                  : await db.from('family_children').insert(values),
              )
            } catch (failure) {
              if (avatar_path && avatar_path !== child?.avatar_path)
                await photos.remove([avatar_path])
              throw failure
            }
            if (child?.avatar_path && child.avatar_path !== avatar_path)
              await photos.remove([child.avatar_path])
            await reload()
            navigate('/world/family')
          })
        }}
      >
        <Field label="Child’s name">
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={child?.name}
          />
        </Field>
        <Field label="Gender">
          <select name="gender" defaultValue={child?.gender ?? ''} required>
            <option value="" disabled>
              Choose gender
            </option>
            <option value="boy">Boy</option>
            <option value="girl">Girl</option>
          </select>
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as Child['status'])
            }
          >
            <option value="not_born_yet">Not Born Yet</option>
            <option value="born">Born</option>
          </select>
        </Field>
        {status === 'born' && (
          <Field label="Birth date">
            <input
              type="date"
              name="birth_date"
              required
              defaultValue={child?.birth_date ?? ''}
            />
          </Field>
        )}
        <PhotoPicker
          name={child?.name ?? '♡'}
          path={child?.avatar_path ?? null}
          onChange={setFile}
        />
        <button className="primary wide" disabled={action.busy}>
          <Check className="icon small" /> Save Child
        </button>
        {child && (
          <button
            className="outline wide mt8"
            type="button"
            disabled={action.busy}
            onClick={() => {
              if (!confirm('Remove this child from the family tree?')) return
              void action.run(async () => {
                unwrap(
                  await db.from('family_children').delete().eq('id', child.id),
                )
                if (child.avatar_path) await photos.remove([child.avatar_path])
                await reload()
                navigate('/world/family')
              })
            }}
          >
            Remove Child
          </button>
        )}
        <ErrorMessage value={action.error} />
      </form>
    </Page>
  )
}

export function Jar({
  me,
  profiles,
  notes,
  reload,
}: {
  me: Profile
  profiles: Profile[]
  notes: Note[]
  reload: () => Promise<void>
}) {
  const navigate = useNavigate()
  const action = useAction()
  const [opened, setOpened] = useState<string>()
  const note = notes.find((item) => item.id === opened)
  return (
    <Page title="Our Love Jar" back="/world">
      <p className="page-sub">
        Little love notes for the days we need them most.
      </p>
      <div className="jar-icon mt28">
        <Wine className="icon big" />
      </div>
      <div className="jar-note mt22" key={opened}>
        {note ? (
          <>
            <span>“{note.body}”</span>
            <small>
              From{' '}
              {profiles.find((profile) => profile.id === note.author_id)
                ?.nickname ?? 'your partner'}
            </small>
          </>
        ) : notes.length ? (
          'Pick a note, and let a little love find you.'
        ) : (
          'Add the first little note.'
        )}
      </div>
      <button
        className="primary wide mt22"
        disabled={!notes.length}
        onClick={() => {
          const choices =
            notes.length > 1
              ? notes.filter((item) => item.id !== opened)
              : notes
          setOpened(choices[Math.floor(Math.random() * choices.length)].id)
        }}
      >
        <Heart className="icon small" /> Open a Love Note
      </button>
      <button
        className="outline wide mt8"
        onClick={() => navigate('/world/jar/new')}
      >
        <Plus className="icon small" /> Add a Love Note
      </button>
      {note?.author_id === me.id && (
        <button
          className="ghost mt8"
          disabled={action.busy}
          onClick={() => {
            if (!confirm('Delete this note?')) return
            void action.run(async () => {
              unwrap(await db.from('love_notes').delete().eq('id', note.id))
              setOpened(undefined)
              await reload()
            })
          }}
        >
          Delete this note
        </button>
      )}
      <ErrorMessage value={action.error} />
    </Page>
  )
}

export function NoteEditor({ reload }: { reload: () => Promise<void> }) {
  const navigate = useNavigate()
  const action = useAction()
  return (
    <Page title="Add a Love Note" back="/world/jar">
      <p className="page-sub">
        Write something lovely for the other person to find.
      </p>
      <form
        className="mt22"
        onSubmit={(event) => {
          event.preventDefault()
          const body = String(
            new FormData(event.currentTarget).get('note'),
          ).trim()
          void action.run(async () => {
            unwrap(await db.from('love_notes').insert({ body }))
            await reload()
            navigate('/world/jar')
          })
        }}
      >
        <Field label="Your little note">
          <textarea
            name="note"
            maxLength={300}
            rows={6}
            required
            placeholder="You make every ordinary day extraordinary…"
          />
        </Field>
        <button className="primary wide" disabled={action.busy}>
          <Heart className="icon small" /> Save Note
        </button>
        <ErrorMessage value={action.error} />
      </form>
    </Page>
  )
}

export function Memories() {
  return (
    <Page title="Our Memories" back="/world">
      <div className="empty-state mt28">
        <Camera className="icon big" />
        <strong>Our gallery is coming soon.</strong>
      </div>
    </Page>
  )
}
