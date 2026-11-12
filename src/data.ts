import { createClient } from '@supabase/supabase-js'
import type { Theme } from './themes'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const configured = Boolean(url && key)
export const db = createClient(
  url || 'http://127.0.0.1:54321',
  key || 'unconfigured',
)

export type Profile = {
  id: string
  stable_key: 'sasa' | 'semsem'
  real_name: string
  nickname: string
  role: string
  dob: string
  avatar_path: string | null
  theme: Theme
  reduce_motion: boolean
}
export type Template = {
  id: string
  title: string
  icon: string
  tint: string
  message: string
  favorite: boolean
}
export type Entry = {
  id: string
  sender_id: string
  recipient_id: string
  title: string | null
  icon: string | null
  tint: string | null
  body: string
  created_at: string
  read_at: string | null
  responded_at: string | null
}
export type Reaction = { entry_id: string; user_id: string; reaction: string }
export type Milestone = {
  id: string
  slug: string | null
  title: string
  original_date: string | null
  annual: boolean
  reserved: boolean
  celebration: 'none' | 'anniversary' | 'kisses'
  note: string
  photo_path: string | null
}
export type Child = {
  id: string
  name: string
  gender: 'boy' | 'girl'
  status: 'born' | 'not_born_yet'
  birth_date: string | null
  avatar_path: string | null
}
export type Note = { id: string; author_id: string; body: string }

export function unwrap<T>(result: {
  data: T
  error: { message: string } | null
}): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

export async function push(action: string, fields: object = {}) {
  const {
    data: { session },
    error,
  } = await db.auth.getSession()
  if (error) throw error
  if (!session) throw new Error('Please sign in again.')
  const response = await fetch('/api/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({ action, ...fields }),
  })
  if (!response.ok)
    throw new Error('Notifications are temporarily unavailable.')
}

export function flushPush() {
  void push('flush').catch(() => {})
}

export const photos = db.storage.from('our-space-photos')

export async function cropPhoto(file: File) {
  if (!file.type.startsWith('image/') || file.size > 20_000_000)
    throw new Error('Choose an image under 20 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const size = Math.min(image.naturalWidth, image.naturalHeight)
    canvas
      .getContext('2d')
      ?.drawImage(
        image,
        (image.naturalWidth - size) / 2,
        (image.naturalHeight - size) / 2,
        size,
        size,
        0,
        0,
        512,
        512,
      )
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88),
    )
    if (!blob) throw new Error('Could not crop this photo.')
    return blob
  } catch {
    throw new Error('Could not open this photo. Try JPEG, PNG, or WebP.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function savePhoto(folder: string, file: Blob | null) {
  if (!file) return null
  const path = folder + '/' + crypto.randomUUID() + '.jpg'
  unwrap(await photos.upload(path, file, { contentType: 'image/jpeg' }))
  return path
}
