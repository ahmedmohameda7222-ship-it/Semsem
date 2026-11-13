import { db, unwrap } from './data'

export type SharedCardKind = 'daily' | 'intimate'
export type SharedCard = {
  id: string
  author_id: string
  kind: SharedCardKind
  category: string
  title: string
  message: string
}

export async function loadSharedCards(kind: SharedCardKind): Promise<SharedCard[]> {
  const data = unwrap(await db.from('shared_cards')
    .select('id,author_id,kind,category,title,message')
    .eq('kind', kind)
    .order('created_at', { ascending: false }))
  return (data ?? []) as SharedCard[]
}

export async function saveSharedCard(kind: SharedCardKind, category: string, title: string, message: string) {
  unwrap(await db.from('shared_cards').insert({ kind, category, title, message }))
}

export async function deleteSharedCard(id: string) {
  unwrap(await db.from('shared_cards').delete().eq('id', id))
}
