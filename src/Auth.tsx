import { useRef, useState } from 'react'
import { Bell, ChevronRight, Heart, Lock } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { db, unwrap } from './data'
import { Avatar, Back, ErrorMessage, Field, useAction } from './ui'

const identities = {
  semsem: ['Semsem', 'Sama'],
  sasa: ['Sasa', 'Ahmed'],
} as const
type Identity = keyof typeof identities

const otpEnabled = import.meta.env.VITE_OUR_SPACE_AUTH_MODE === 'otp'

async function authRequest(
  profile: Identity,
  action: string,
  credential: { code?: string; password?: string } = {},
) {
  const response = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, action, ...credential }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(body.error ?? 'Sign-in is temporarily unavailable.')
  return body
}

export function Welcome() {
  const navigate = useNavigate()
  return (
    <section className="screen auth">
      <div className="welcome">
        <div className="welcome-art">
          <div className="welcome-orb">
            <Heart className="icon" />
          </div>
          <span className="mini-heart one">♡</span>
          <span className="mini-heart two">♥</span>
        </div>
        <div className="eyebrow mb12">A space for two</div>
        <h1>
          Our Space<span className="accent">.</span>
        </h1>
        <div className="tagline">Just you, me, and our little world.</div>

        <button
          className="primary wide"
          onClick={() => navigate('/choose-profile')}
        >
          Enter Our World <ChevronRight />
        </button>
        <div className="auth-foot">Made just for Us ♡</div>
      </div>
    </section>
  )
}

export function Choose({ choose }: { choose: (key: Identity) => void }) {
  const navigate = useNavigate()
  const action = useAction()
  return (
    <section className="screen auth profile-select">
      <Back to="/welcome" />
      <div className="eyebrow mt22">Your little world</div>
      <h1 className="page-title mt8">Who's here, love?</h1>
      <p className="page-sub">Choose your profile to enter our space.</p>
      <div className="profile-cards">
        {(
          Object.entries(identities) as [Identity, readonly [string, string]][]
        ).map(([key, [nickname, name]]) => (
          <button
            key={key}
            className="select-profile"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                if (otpEnabled) await authRequest(key, 'request')
                choose(key)
                navigate('/verify')
              })
            }
          >
            <Avatar name={name} size="large" />
            <h3>{nickname}</h3>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <div className="secure-box">
        <Lock className="icon" />
        <div>
          <b>Private, just for two</b>
          <p>
            {otpEnabled
              ? 'Each profile uses its own secure email sign-in. The code goes to its registered address.'
              : 'Each profile uses its own account password.'}
          </p>
        </div>
      </div>
      <ErrorMessage value={action.error} />
    </section>
  )
}

export function Verify({ identity }: { identity: Identity | null }) {
  if (!identity) return <Navigate replace to="/choose-profile" />
  return otpEnabled ? (
    <VerifyOtp identity={identity} />
  ) : (
    <PasswordSignIn identity={identity} />
  )
}

function PasswordSignIn({ identity }: { identity: Identity }) {
  const [nickname, name] = identities[identity]
  const input = useRef<HTMLInputElement>(null)
  const action = useAction()

  return (
    <section className="screen auth">
      <Back to="/choose-profile">Choose another profile</Back>
      <div className="mt28 row">
        <Avatar name={name} size="medium" />
        <div>
          <div className="eyebrow">Welcome back</div>
          <h1>{nickname}</h1>
        </div>
      </div>
      <div className="otp-card mt28">
        <Lock className="icon big" />
        <h2 className="mt16">Sign in to Our Space</h2>
        <p className="page-sub">
          Enter the password for your {nickname} account.
        </p>
      </div>
      <form
        className="mt28"
        onSubmit={(event) => {
          event.preventDefault()
          const field = input.current
          if (!field || !field.value || action.busy) return
          void action.run(async () => {
            try {
              const tokens = await authRequest(identity, 'password', {
                password: field.value,
              })
              unwrap(await db.auth.setSession(tokens))
            } finally {
              field.value = ''
            }
          })
        }}
      >
        <Field label="Password">
          <input
            ref={input}
            type="password"
            autoComplete="current-password"
            required
            maxLength={4096}
            readOnly={action.busy}
          />
        </Field>
        <button className="primary wide mt22" disabled={action.busy}>
          {action.busy ? 'Signing in…' : 'Sign in'} <ChevronRight />
        </button>
      </form>
      <ErrorMessage value={action.error} />
    </section>
  )
}

function VerifyOtp({ identity }: { identity: Identity }) {
  const [code, setCode] = useState('')
  const [resent, setResent] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const action = useAction()
  const [nickname, name] = identities[identity]
  return (
    <section className="screen auth">
      <Back to="/choose-profile">Choose another profile</Back>
      <div className="mt28 row">
        <Avatar name={name} size="medium" />
        <div>
          <div className="eyebrow">Welcome back</div>
          <h1>{nickname}</h1>
        </div>
      </div>
      <div className="otp-card mt28">
        <Bell className="icon big" />
        <h2 className="mt16">Check your email</h2>
        <p className="page-sub">
          Enter the six-digit code sent to your verified email address.
        </p>
      </div>
      <form
        className="mt28"
        onSubmit={(event) => {
          event.preventDefault()
          void action.run(async () => {
            const tokens = await authRequest(identity, 'verify', { code })
            unwrap(await db.auth.setSession(tokens))
          })
        }}
      >
        <label className="field-label" htmlFor="code">
          Enter six-digit verification code
        </label>
        <div
          aria-hidden
          className="otp-boxes"
          onClick={() => input.current?.focus()}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div className={i === code.length ? 'active' : ''} key={i}>
              {code[i]}
            </div>
          ))}
        </div>
        <input
          id="code"
          ref={input}
          autoFocus
          className="otp-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
          }
        />
        <button
          disabled={action.busy || code.length !== 6}
          className="primary wide mt22"
        >
          Verify &amp; enter <ChevronRight />
        </button>
      </form>
      <button
        className="ghost mt16"
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            await authRequest(identity, 'request')
            setResent(true)
          })
        }
      >
        Resend code
      </button>
      {resent && (
        <p role="status" className="hint">
          A new code was sent.
        </p>
      )}
      <ErrorMessage value={action.error} />
    </section>
  )
}
