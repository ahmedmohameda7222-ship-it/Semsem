export function formatElapsed(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return (
    String(Math.floor(safe / 60)).padStart(2, '0') +
    ':' +
    String(safe % 60).padStart(2, '0')
  )
}
