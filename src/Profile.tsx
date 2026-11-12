import { useEffect, useState } from 'react'
import {
  Bell,
  Check,
  ChevronRight,
  Heart,
  LogOut,
  Palette,
  Pencil,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db, photos, push, savePhoto, unwrap } from './data'
import type { Profile } from './data'
import { prettyDate } from './calendar'
import { applyTheme, themes } from './themes'
import type { Theme } from './themes'
import {
  Avatar,
  ErrorMessage,
  Field,
  Page,
  PhotoPicker,
  Setting,
  useAction,
} from './ui'

export async function updateProfile(id: string, values: Partial<Profile>) {
  unwrap(
    await db.from('profiles').update(values).eq('id', id).select('id').single(),
  )
}

async function currentSubscription() {
  return (
    await navigator.serviceWorker?.getRegistration()
  )?.pushManager?.getSubscription()
}

export function ProfilePage({
  me,
  reload,
}: {
  me: Profile
  reload: () => Promise<void>
}) {
  const navigate = useNavigate()
  const action = useAction()
  return (
    <Page title="My Profile" back="/home">
      <div className="profile-hero">
        <Avatar name={me.real_name} path={me.avatar_path} size="large" />
        <h2>{me.nickname}</h2>
        <p className="muted small">
          {me.real_name} · {me.role}
        </p>
        <button className="ghost" onClick={() => navigate('/profile/edit')}>
          <Pencil className="icon small" /> Edit Profile
        </button>
      </div>
      <div className="sect">
        <h3>Settings</h3>
      </div>
      <Setting
        title="Color Palette"
        caption={themes[me.theme][0]}
        icon={<Palette />}
        action={() => navigate('/settings/appearance')}
      />
      <Setting
        title="Notifications"
        caption="Chat and love requests"
        icon={<Bell />}
        action={() => navigate('/settings/notifications')}
      />
      <label className="checkboxline mt16">
        <input
          type="checkbox"
          checked={me.reduce_motion}
          disabled={action.busy}
          onChange={(event) => {
            const checked = event.target.checked
            void action.run(async () => {
              await updateProfile(me.id, { reduce_motion: checked })
              await reload()
            })
          }}
        />{' '}
        Reduce animations
      </label>
      <button
        className="outline wide mt22"
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            const sub = await currentSubscription()
            if (sub) {
              await push('remove', { endpoint: sub.endpoint })
              await sub.unsubscribe()
            }
            const { error } = await db.auth.signOut({ scope: 'local' })
            if (error) throw error
          })
        }
      >
        <LogOut className="icon small" /> Sign out
      </button>
      <ErrorMessage value={action.error} />
    </Page>
  )
}

export function Appearance({
  me,
  partner,
  reload,
}: {
  me: Profile
  partner?: Profile
  reload: () => Promise<void>
}) {
  const action = useAction()
  const [preview, setPreview] = useState<Theme | null>(null)
  const selected = preview ?? me.theme
  return (
    <Page title="Color Palette" back="/profile">
      <p className="page-sub">
        Make Our Space feel just like you. Your palette is saved to your profile
        {partner ? ' independently of ' + partner.nickname + '’s' : ''}.
      </p>
      <div className="palette-grid">
        {(Object.keys(themes) as Theme[]).map((id) => {
          const [name, bg, primary, soft, ink] = themes[id]
          return (
            <button
              key={id}
              className={'palette ' + (selected === id ? 'active' : '')}
              aria-pressed={selected === id}
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  setPreview(id)
                  applyTheme(id)
                  try {
                    await updateProfile(me.id, { theme: id })
                    await reload()
                  } catch (failure) {
                    applyTheme(me.theme)
                    throw failure
                  } finally {
                    setPreview(null)
                  }
                })
              }
            >
              <div className="palette-colors">
                {[primary, soft, bg, ink].map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </div>
              <strong>{name}</strong>
              <span className="selected">
                {selected === id ? '✓ Selected' : 'Tap to preview'}
              </span>
            </button>
          )
        })}
      </div>
      <ErrorMessage value={action.error} />
      <div className="sect">
        <h3>Live Preview</h3>
      </div>
      <div className="live-mini">
        <h3>Hey, {me.nickname} ♡</h3>
        <p>What does your heart need today?</p>
        <span className="primary">
          <Heart className="icon small" /> Send some love
        </span>
      </div>
    </Page>
  )
}

export function EditProfile({
  me,
  reload,
}: {
  me: Profile
  reload: () => Promise<void>
}) {
  const navigate = useNavigate()
  const action = useAction()
  const [file, setFile] = useState<Blob | null>()
  return (
    <Page title="Edit Profile" back="/profile">
      <p className="page-sub">Make this little space feel like you.</p>
      <PhotoPicker
        name={me.real_name}
        path={me.avatar_path}
        onChange={setFile}
      />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const nickname = String(
            new FormData(event.currentTarget).get('nickname'),
          ).trim()
          void action.run(async () => {
            const avatar_path =
              file === undefined ? me.avatar_path : await savePhoto(me.id, file)
            try {
              await updateProfile(me.id, { nickname, avatar_path })
            } catch (failure) {
              if (avatar_path && avatar_path !== me.avatar_path)
                await photos.remove([avatar_path])
              throw failure
            }
            if (me.avatar_path && me.avatar_path !== avatar_path)
              await photos.remove([me.avatar_path])
            await reload()
            navigate('/profile')
          })
        }}
      >
        <Field label="Nickname">
          <input
            name="nickname"
            defaultValue={me.nickname}
            required
            maxLength={32}
          />
        </Field>
        <Field label="Real name">
          <input value={me.real_name} readOnly />
        </Field>
        <Field label="Role">
          <input value={me.role} readOnly />
        </Field>
        <Field label="Date of birth">
          <input value={prettyDate(me.dob)} readOnly />
        </Field>
        <button className="primary wide" disabled={action.busy}>
          <Check className="icon small" /> Save Changes
        </button>
        <ErrorMessage value={action.error} />
      </form>
    </Page>
  )
}

export function Install() {
  return (
    <Page title="Install Our Space" back="/profile">
      <div className="card mt22">
        <strong>Add Our Space to your iPhone</strong>
        <ol className="page-sub">
          <li>Open this site in Safari.</li>
          <li>Tap Share, then Add to Home Screen.</li>
          <li>Tap Add and open Our Space from its Home Screen icon.</li>
          <li>Sign in and enable notifications from Settings.</li>
        </ol>
      </div>
    </Page>
  )
}

export function Notifications() {
  const navigate = useNavigate()
  const action = useAction()
  const [enabled, setEnabled] = useState(false)
  const [testResult, setTestResult] = useState('')
  const supported =
    'Notification' in window &&
    'PushManager' in window &&
    'serviceWorker' in navigator
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  useEffect(() => {
    void currentSubscription()
      .then((sub) =>
        setEnabled(Boolean(sub && Notification.permission === 'granted')),
      )
      .catch(() => {})
  }, [])
  return (
    <Page title="Notifications" back="/profile">
      <p className="page-sub">Never miss a little love note.</p>
      {location.hostname !== 'sasa-semsem.vercel.app' &&
        location.hostname !== '127.0.0.1' &&
        location.hostname !== 'localhost' && (
          <div className="card mt16" role="alert">
            This installation uses an older web address. iPhone push subscriptions
            are tied to that specific address. Open
            {' '}<a href="https://sasa-semsem.vercel.app">sasa-semsem.vercel.app</a>{' '}
            in Safari, add it to your Home Screen, and enable notifications
            inside the new installation.
          </div>
        )}
      <div className="card mt22">
        <div className="row">
          <Bell className="icon big" />
          <div>
            <strong>Push Notifications</strong>
            <p className="hint mt8">
              {enabled
                ? 'Enabled on this device.'
                : 'Allow notifications to receive messages when Our Space is closed.'}
            </p>
          </div>
        </div>
        <hr className="thin" />
        {ios && !standalone ? (
          <button
            className="outline wide"
            onClick={() => navigate('/settings/install')}
          >
            Install Our Space <ChevronRight className="icon small" />
          </button>
        ) : (
          <button
            className="outline wide"
            disabled={!supported || action.busy}
            onClick={() =>
              void action.run(async () => {
                if (enabled) {
                  const subscription = await currentSubscription()
                  if (!subscription) {
                    setEnabled(false)
                    return
                  }
                  await push('remove', { endpoint: subscription.endpoint })
                  await subscription.unsubscribe()
                  setEnabled(false)
                  return
                }
                const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
                if (!publicKey)
                  throw new Error('Notifications are temporarily unavailable.')
                if ((await Notification.requestPermission()) !== 'granted')
                  throw new Error(
                    'Allow notifications in your device settings to enable them.',
                  )
                const registration =
                  await navigator.serviceWorker.getRegistration()
                if (!registration?.active)
                  throw new Error('Refresh Our Space and try again.')
                const decodedKey = publicKey
                  .replace(/-/g, '+')
                  .replace(/_/g, '/')
                const applicationServerKey = Uint8Array.from(
                  atob(decodedKey),
                  (character) => character.charCodeAt(0),
                )
                const subscription =
                  await registration.pushManager.getSubscription()
                const sub =
                  subscription ??
                  (await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey,
                  }))
                try {
                  await push('register', sub.toJSON())
                } catch (failure) {
                  if (!subscription) await sub.unsubscribe()
                  throw failure
                }
                setEnabled(true)
              })
            }
          >
            {enabled ? 'Disable Notifications' : 'Enable Notifications'}
          </button>
        )}
        {!supported && (!ios || standalone) && (
          <p className="hint mt8">This browser does not support Web Push.</p>
        )}
        <div className="notification-diagnostics">
          <button className="outline wide" type="button"
            aria-label="Send test notification"
            disabled={!enabled || action.busy}
            onClick={() => void action.run(async () => {
              setTestResult('')
              const result = await push('test') as { accepted?: number, devices?: number } | null
              setTestResult(result?.accepted
                ? 'Push service accepted the test for ' + result.accepted + ' device(s). Check your iPhone Notification Center.'
                : 'No push service accepted the test. Disable notifications, re-enable them, then try again.')
            })}>
            <Bell size={17} /> Send test notification
          </button>
          <p className="hint mt8">Delivery to the push service does not guarantee your iPhone displayed the alert. Check iPhone Settings → Notifications → Our Space, Focus modes, and Show Previews.</p>
          {testResult && <p className="hint" role="status">{testResult}</p>}
        </div>
        <ErrorMessage value={action.error} />
      </div>
    </Page>
  )
}
