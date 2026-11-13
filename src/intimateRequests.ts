export const intimateCategories = [
  { id: 'direct', label: 'Direct & Intimate', subtitle: 'Say what you want, with care.', emoji: '❤️‍🔥' },
  { id: 'flirty', label: 'Flirty & Teasing', subtitle: 'A little spark for your person.', emoji: '💋' },
  { id: 'romantic', label: 'Romantic & Private', subtitle: 'Quiet moments, just for you two.', emoji: '🌹' },
] as const

export type IntimateCategory = (typeof intimateCategories)[number]['id']
export type IntimateRequest = {
  id: string
  category: IntimateCategory
  title: string
  message: string
  icon: string
  emoji: string
}

/** Curated, optional requests. Codes are validated again by the Supabase RPC. */
export const intimateRequests: readonly IntimateRequest[] = [
  { id:'sex_tonight',category:'direct',title:'I want to have sex with you ❤️‍🔥',message:'I would love some private time with you, if you feel like it too ❤️',icon:'HeartPulse',emoji:'❤️‍🔥' },
  { id:'make_love',category:'direct',title:'I want to make love to you ❤️',message:'I miss being close to you, mi amor ❤️',icon:'Heart',emoji:'❤️' },
  { id:'in_the_mood',category:'direct',title:"I'm in the mood for you 😏",message:'Can I steal some special alone time with you? 😘',icon:'kiss',emoji:'😏' },
  { id:'want_tonight',category:'direct',title:'I want you tonight 🌙',message:'I have been thinking about you all day, baby ❤️',icon:'Moon',emoji:'🌙' },
  { id:'intimate_night',category:'direct',title:'Can we have an intimate night? 💋',message:'Just us two, whenever we both feel like it 💋',icon:'BedDouble',emoji:'💋' },
  { id:'passionate_kiss',category:'flirty',title:'I need a passionate kiss 💋',message:'Saving all my kisses for you 😘',icon:'kiss',emoji:'💋' },
  { id:'thinking_of_you',category:'flirty',title:"I can't stop thinking about you 😘",message:'You have been on my mind all day 🥰',icon:'HeartPulse',emoji:'😘' },
  { id:'come_closer',category:'flirty',title:'Come closer, baby ❤️‍🔥',message:'I want to be close to you, mi amor ❤️',icon:'HeartHandshake',emoji:'❤️‍🔥' },
  { id:'your_touch',category:'flirty',title:'I want your touch 🫶',message:'I miss your hands in mine 🫶',icon:'HandHeart',emoji:'🫶' },
  { id:'surprise_tonight',category:'flirty',title:'Surprise me tonight 😉',message:'I would love a little romantic surprise from you 😉',icon:'Gift',emoji:'😉' },
  { id:'cuddle',category:'romantic',title:'I want to cuddle with you 🥺',message:'Can we cuddle and forget about everything else? 🥺',icon:'BedDouble',emoji:'🥺' },
  { id:'sleep_in_arms',category:'romantic',title:'I want to fall asleep in your arms 🥰',message:'Your arms feel like home to me ❤️',icon:'Moon',emoji:'🥰' },
  { id:'alone_time',category:'romantic',title:"Let's have some alone time 🔒",message:'Just you and me, no distractions ❤️',icon:'HeartHandshake',emoji:'🔒' },
  { id:'shower_together',category:'romantic',title:'Can we take a shower together? 🚿',message:'I would love a cozy moment together, if you want to 💕',icon:'Heart',emoji:'🚿' },
  { id:'just_us',category:'romantic',title:'Tonight, just you and me ❤️',message:'Let us make some beautiful memories together ❤️',icon:'CalendarHeart',emoji:'❤️' },
  { id:'slow_kisses',category:'direct',title:'I want to kiss you slowly 💋',message:'I want a long kiss and a moment that belongs only to us 💋',icon:'kiss',emoji:'💋' },
  { id:'private_evening',category:'direct',title:'Can we spend tonight alone? ❤️‍🔥',message:'I would love a private evening with you, just the two of us ❤️',icon:'Moon',emoji:'❤️‍🔥' },
  { id:'close_to_me',category:'direct',title:'I want you close to me ❤️',message:'I miss having you right next to me tonight ❤️',icon:'HeartHandshake',emoji:'❤️' },
  { id:'special_night',category:'direct',title:'Let’s make tonight special 😘',message:'I would love to share a romantic night together 😘',icon:'HeartPulse',emoji:'😘' },
  { id:'kisses_all_over',category:'flirty',title:'I have so many kisses for you 😚',message:'I have been saving kisses for you all day 💋',icon:'kiss',emoji:'😚' },
  { id:'flirt_with_me',category:'flirty',title:'Flirt with me tonight 😉',message:'I want to feel those butterflies with you again 😉',icon:'Sparkles',emoji:'😉' },
  { id:'under_blanket',category:'flirty',title:'Come cuddle under my blanket 🥰',message:'I saved a warm little spot right beside me 🥰',icon:'BedDouble',emoji:'🥰' },
  { id:'steal_my_heart',category:'flirty',title:'Steal a private moment with me 😏',message:'I would love a little stolen moment together 😏',icon:'Heart',emoji:'😏' },
  { id:'slow_dance',category:'romantic',title:'Slow dance with me 🌹',message:'I dream of holding you close while our favorite song plays 🌹',icon:'Music',emoji:'🌹' },
  { id:'sunrise_together',category:'romantic',title:'Wake up in your arms ☀️',message:'I would love a slow morning right next to you ☀️',icon:'Sun',emoji:'☀️' },
  { id:'hold_me',category:'romantic',title:'Hold me a little longer 🫶',message:'Being in your arms makes everything feel softer 🫶',icon:'HandHeart',emoji:'🫶' },
  { id:'heart_to_heart',category:'romantic',title:'A night of us and our hearts ❤️',message:'I would love to spend a quiet evening loving you ❤️',icon:'Heart',emoji:'❤️' },
]

export const legacyIntimateCodes = new Set(intimateRequests.slice(0, 15).map((request) => request.id))

export function findIntimateRequest(id: string): IntimateRequest | undefined {
  return intimateRequests.find((request) => request.id === id)
}
