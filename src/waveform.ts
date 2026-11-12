// Deterministic RMS envelope from real decoded audio samples.
// Work is bounded per bar so a long recording cannot block the UI.
export function waveformPeaks(samples: Float32Array, columns = 36): number[] {
  if (!Number.isFinite(columns) || columns <= 0) return []
  const size = Math.min(72, Math.max(1, Math.floor(columns)))
  if (!samples.length) return Array(size).fill(0.12)
  return Array.from({ length: size }, (_, index) => {
    const start = Math.floor((index * samples.length) / size)
    const end = Math.min(samples.length, Math.floor(((index + 1) * samples.length) / size))
    const step = Math.max(1, Math.ceil((end - start) / 96))
    let sum = 0
    let count = 0
    for (let i = start; i < end; i += step) {
      const sample = samples[i]
      if (Number.isFinite(sample)) {
        sum += sample * sample
        count++
      }
    }
    const rootMeanSquare = count ? Math.sqrt(sum / count) : 0
    return Math.max(0.12, Math.min(1, rootMeanSquare * 3))
  })
}
