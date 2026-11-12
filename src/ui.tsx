import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Heart, Camera } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cropPhoto, photos } from './data'

export function Avatar({
  name,
  path,
  size = '',
}: {
  name: string
  path?: string | null
  size?: string
}) {
  const [signed, setSigned] = useState<{ path: string; url: string }>()
  useEffect(() => {
    if (!path) return
    let active = true
    const refresh = () =>
      void photos.createSignedUrl(path, 900).then(({ data }) => {
        if (active && data) setSigned({ path, url: data.signedUrl })
      })
    refresh()
    const timer = setInterval(refresh, 720000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [path])
  return (
    <span className={'avatar ' + size}>
      {signed && signed.path === path ? (
        <img src={signed.url} alt="" />
      ) : (
        name[0]
      )}
    </span>
  )
}

export function Header({ name, path }: { name: string; path: string | null }) {
  const navigate = useNavigate()
  return (
    <header className="top">
      <div className="brand">
        <span className="brand-heart">
          <Heart className="icon" />
        </span>
        Our Space
      </div>
      <button
        className="avatar-button"
        aria-label="Open your profile"
        onClick={() => navigate('/profile')}
      >
        <Avatar name={name} path={path} />
      </button>
    </header>
  )
}

export function Back({
  to,
  children = 'Back',
}: {
  to: string
  children?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <button className="back" onClick={() => navigate(to)}>
      <ChevronLeft className="icon small" />
      {children}
    </button>
  )
}

export function Page({
  title,
  back,
  children,
}: {
  title: string
  back: string
  children: ReactNode
}) {
  return (
    <section className="screen no-bottom">
      <Back to={back} />
      <h1 className="page-title">{title}</h1>
      {children}
    </section>
  )
}

export function Setting({
  icon,
  title,
  caption,
  action,
}: {
  icon: ReactNode
  title: string
  caption?: string
  action: () => void
}) {
  return (
    <button className="setting-row" onClick={action}>
      <span className="setting-icon">{icon}</span>
      <span className="flex1">
        <strong>{title}</strong>
        {caption && <small>{caption}</small>}
      </span>
      <ChevronRight className="icon small" />
    </button>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

export function PhotoPicker({
  name,
  path,
  onChange,
}: {
  name: string
  path: string | null
  onChange: (file: Blob | null) => void
}) {
  const [preview, setPreview] = useState<string>()
  const [removed, setRemoved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  return (
    <div className="profile-hero mt16">
      {preview ? (
        <span className="avatar large">
          <img alt="Cropped photo preview" src={preview} />
        </span>
      ) : (
        <Avatar name={name} path={removed ? null : path} size="large" />
      )}
      <label className="outline file-wrap">
        <Camera className="icon small" />
        {busy ? 'Preparing photo…' : 'Choose photo'}
        <input
          aria-label="Choose photo"
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            setBusy(true)
            setError('')
            try {
              const cropped = await cropPhoto(file)
              setPreview(URL.createObjectURL(cropped))
              onChange(cropped)
            } catch (failure) {
              setError((failure as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        />
      </label>
      {(preview || (path && !removed)) && (
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setRemoved(true)
            setPreview(undefined)
            onChange(null)
          }}
        >
          Remove photo
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  )
}

export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

export function ErrorMessage({ value }: { value: string }) {
  return (
    value && (
      <p role="alert" className="error">
        {value}
      </p>
    )
  )
}
