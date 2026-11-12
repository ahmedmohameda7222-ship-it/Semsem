export const themes = {
  cherry: [
    'Cherry Love',
    '#FFF8F7',
    '#BA314F',
    '#F4BDCC',
    '#6A2638',
    '#FFFFFF',
  ],
  scarlet: [
    'Scarlet Romance',
    '#FFF3F3',
    '#D7263D',
    '#FFC4D3',
    '#5B172A',
    '#FFFFFF',
  ],
  velvet: [
    'Burgundy Velvet',
    '#FAF3EC',
    '#84243F',
    '#D9A5B6',
    '#3F202B',
    '#FFFFFF',
  ],
  sunset: [
    'Rosewood Sunset',
    '#FFF7ED',
    '#B93D46',
    '#F0B6A5',
    '#5A3030',
    '#FFFFFF',
  ],
  berry: ['Berry Kiss', '#FBF9FF', '#B73763', '#F7D3E5', '#59365B', '#FFFFFF'],
  night: [
    'Midnight Romance',
    '#1D1822',
    '#E95C7D',
    '#68364F',
    '#FBEDF1',
    '#2C2331',
  ],
} as const
export type Theme = keyof typeof themes

export function applyTheme(id: Theme) {
  const [, bg, primary, soft, ink, surface] = themes[id]
  const root = document.documentElement
  for (const [key, value] of Object.entries({
    bg,
    primary,
    soft,
    ink,
    surface,
  })) {
    root.style.setProperty('--' + key, value)
  }
  root.dataset.theme = id
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', bg)
}
