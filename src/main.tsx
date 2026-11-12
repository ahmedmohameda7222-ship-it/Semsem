import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Session } from '@supabase/supabase-js'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {
  CalendarCheck,
  Globe,
  Home as HomeIcon,
  MessageCircle,
} from 'lucide-react'
import { Choose, Verify, Welcome } from './Auth'
import { ButtonEditor, Home } from './Attention'
import { Chat } from './Chat'
import { Celebration, DateEditor, Dates } from './Dates'
import {
  Appearance,
  EditProfile,
  Install,
  Notifications,
  ProfilePage,
} from './Profile'
import { Memories } from './Media'
import { ChildEditor, Family, Jar, NoteEditor, World } from './World'
import { configured, db, unwrap } from './data'
import type { Child, Milestone, Note, Profile, Template } from './data'
import { applyTheme } from './themes'
import './reference.css'
import './styles.css'
import './chatPolish.css'

type Workspace = {
  profiles: Profile[]
  buttons: Template[]
  dates: Milestone[]
  children: Child[]
  notes: Note[]
}

const tabs = [
  ['/home', 'Home', HomeIcon],
  ['/chat', 'Chat', MessageCircle],
  ['/dates', 'Our Dates', CalendarCheck],
  ['/world', 'Our World', Globe],
] as const

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [identity, setIdentity] = useState<Profile['stable_key'] | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const location = useLocation()

  useEffect(() => {
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_event, value) => setSession(value))
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      subscription.unsubscribe()
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (!session) applyTheme('cherry')
  }, [session])
  const deepLink =
    location.pathname === '/chat' && location.search
      ? location.pathname + location.search
      : null
  useEffect(() => {
    if (!session && deepLink)
      sessionStorage.setItem('our-space-return', deepLink)
  }, [session, deepLink])

  return (
    <main className="app-shell">
      {!online && (
        <div className="offline" role="status">
          You’re offline. Changes need an internet connection.
        </div>
      )}
      {session === undefined ? (
        <div className="screen">
          <p role="status">Opening Our Space…</p>
        </div>
      ) : session ? (
        <PrivateSpace
          key={session.user.id}
          userId={session.user.id}
          online={online}
        />
      ) : (
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route
            path="/choose-profile"
            element={<Choose choose={setIdentity} />}
          />
          <Route path="/verify" element={<Verify identity={identity} />} />
          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      )}
    </main>
  )
}

function PrivateSpace({ userId, online }: { userId: string; online: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [space, setSpace] = useState<Workspace>()
  const [error, setError] = useState('')
  const [unread, setUnread] = useState(0)
  const [returnTo] = useState(() => {
    const value = sessionStorage.getItem('our-space-return')
    return value?.startsWith('/chat?entry=') ? value : '/home'
  })
  useEffect(() => {
    sessionStorage.removeItem('our-space-return')
  }, [])

  const reload = useCallback(async () => {
    const [profiles, buttons, dates, children, notes, count] =
      await Promise.all([
        db.from('profiles').select('*').order('stable_key'),
        db
          .from('attention_buttons')
          .select('*')
          .order('favorite', { ascending: false })
          .order('created_at'),
        db.from('important_dates').select('*').order('title'),
        db.from('family_children').select('*').order('name'),
        db.from('love_notes').select('*').order('created_at'),
        db
          .from('chat_entries')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_id', userId)
          .is('read_at', null),
      ])
    setSpace({
      profiles: unwrap(profiles) as Profile[],
      buttons: unwrap(buttons) as Template[],
      dates: unwrap(dates) as Milestone[],
      children: unwrap(children) as Child[],
      notes: unwrap(notes) as Note[],
    })
    setUnread(count.count ?? 0)
    setError('')
  }, [userId])

  useEffect(() => {
    if (!online) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(
        () =>
          void reload().catch(() =>
            setError('Could not load Our Space. Try again shortly.'),
          ),
        50,
      )
    }
    refresh()
    const channel = db.channel('our-space-data')
    for (const table of [
      'profiles',
      'attention_buttons',
      'important_dates',
      'family_children',
      'love_notes',
      'chat_entries',
    ]) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        refresh,
      )
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') refresh()
    })
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      void db.removeChannel(channel)
    }
  }, [online, reload])

  const me = space?.profiles.find((profile) => profile.id === userId)
  const partner = space?.profiles.find((profile) => profile.id !== userId)
  useEffect(() => {
    if (me) applyTheme(me.theme)
  }, [me])
  if (!space || !me)
    return (
      <section className="screen">
        <h1 className="page-title">Our Space</h1>
        <p className="page-sub" role="status">
          {space
            ? 'This account is not enrolled in Our Space.'
            : error ||
              (online
                ? 'Opening your space…'
                : 'Connect to the internet to open your private space.')}
        </p>
        {error && (
          <button
            className="outline mt16"
            onClick={() => void reload().catch(() => {})}
          >
            Try again
          </button>
        )}
        {space && !me && (
          <button
            className="outline mt16"
            onClick={() => void db.auth.signOut({ scope: 'local' })}
          >
            Sign out
          </button>
        )}
      </section>
    )

  return (
    <>
      <Routes location={location}>
        <Route
          path="/home"
          element={
            <Home
              me={me}
              partner={partner}
              buttons={space.buttons}
              dates={space.dates}
            />
          }
        />
        <Route
          path="/chat"
          element={<Chat key={location.search} me={me} partner={partner} />}
        />
        <Route path="/dates" element={<Dates me={me} dates={space.dates} />} />
        <Route
          path="/dates/:id"
          element={
            <DateEditor
              key={location.pathname}
              dates={space.dates}
              reload={reload}
            />
          }
        />
        <Route path="/world" element={<World me={me} />} />
        <Route
          path="/world/family"
          element={
            <Family profiles={space.profiles} children={space.children} />
          }
        />
        <Route
          path="/world/family/:id"
          element={
            <ChildEditor
              key={location.pathname}
              children={space.children}
              reload={reload}
            />
          }
        />
        <Route
          path="/world/jar"
          element={
            <Jar
              me={me}
              profiles={space.profiles}
              notes={space.notes}
              reload={reload}
            />
          }
        />
        <Route path="/world/jar/new" element={<NoteEditor reload={reload} />} />
        <Route path="/world/memories" element={<Memories userId={me.id} />} />
        <Route
          path="/profile"
          element={<ProfilePage me={me} reload={reload} />}
        />
        <Route
          path="/profile/edit"
          element={<EditProfile me={me} reload={reload} />}
        />
        <Route
          path="/settings/appearance"
          element={<Appearance me={me} partner={partner} reload={reload} />}
        />
        <Route path="/settings/notifications" element={<Notifications />} />
        <Route path="/settings/install" element={<Install />} />
        <Route
          path="/buttons/:id"
          element={
            <ButtonEditor
              key={location.pathname}
              buttons={space.buttons}
              partner={partner}
              reload={reload}
            />
          }
        />
        <Route path="*" element={<Navigate to={returnTo} replace />} />
      </Routes>
      {tabs.some(([path]) => path === location.pathname) && (
        <nav className="bottom" aria-label="Main navigation">
          {tabs.map(([path, title, Icon]) => {
            const active = path === location.pathname
            return (
              <button
                key={path}
                className={active ? 'on' : ''}
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(path)}
              >
                <span className="nav-circle">
                  <Icon className="icon" />
                  {path === '/chat' && unread > 0 && (
                    <span className="nav-badge">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </span>
                {title}
              </button>
            )
          })}
        </nav>
      )}
      <Celebration me={me} dates={space.dates} />
    </>
  )
}

if (configured && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
