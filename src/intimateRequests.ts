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
]

export function findIntimateRequest(id: string): IntimateRequest | undefined {
  return intimateRequests.find((request) => request.id === id)
}
