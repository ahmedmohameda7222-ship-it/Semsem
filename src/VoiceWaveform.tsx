import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { formatElapsed } from './elapsed'
import { waveformPeaks } from './waveform'

const bars = 36
const placeholder = Array.from({ length: bars }, () => 0.12)
const peakCache = new Map<string, number[]>()

/** A tap-to-play audio message. Heavy audio decoding is deferred until playback. */
export function VoiceWaveform({
  src,
  label,
  durationHint,
}: {
  src: string
  label: string
  durationHint?: number
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const loadingRef = useRef<AbortController | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(durationHint ?? 0)
  const [peaks, setPeaks] = useState<number[] | null>(
    () => peakCache.get(src) ?? null,
  )
  const [nativeFallback, setNativeFallback] = useState(false)
  const full = Number.isFinite(duration) && duration > 0 ? duration : 0
  const fraction = full ? Math.min(1, current / full) : 0

  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setDuration(durationHint ?? 0)
    setPeaks(peakCache.get(src) ?? null)
    setNativeFallback(false)
    return () => {
      loadingRef.current?.abort()
      loadingRef.current = null
    }
  }, [src, durationHint])

  function loadPeaks() {
    if (peaks || loadingRef.current || peakCache.has(src)) return
    if (!window.AudioContext) return
    const controller = new AbortController()
    loadingRef.current = controller
    void (async () => {
      // Audio is streamed by the native element. Analyzing its waveform is
      // optional and must never delay playback on a slow connection.
      const response = await fetch(src, {
        signal: controller.signal,
        cache: 'force-cache',
      })
      if (!response.ok) return
      const advertised = Number(response.headers.get('content-length') || 0)
      if (advertised > 8_388_608) return
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength > 8_388_608 || controller.signal.aborted) return
      const context = new AudioContext()
      try {
        const decoded = await context.decodeAudioData(bytes)
        if (controller.signal.aborted) return
        const values = waveformPeaks(decoded.getChannelData(0), bars)
        peakCache.set(src, values)
        while (peakCache.size > 48) {
          const oldest = peakCache.keys().next().value
          if (oldest) peakCache.delete(oldest)
          else break
        }
        setPeaks(values)
      } finally {
        void context.close().catch(() => {})
      }
    })()
      .catch(() => {
        // Unsupported codecs and blocked decoding should not block audio.
      })
      .finally(() => {
        if (loadingRef.current === controller) loadingRef.current = null
      })
  }

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    loadPeaks()
    void audio.play().catch(() => {
      // iOS can require native controls for certain codecs or audio states.
      setNativeFallback(true)
    })
  }

  function seek(position: number) {
    if (!audioRef.current || !full) return
    audioRef.current.currentTime = position
    setCurrent(position)
  }

  return (
    <div className="voice-message">
      <audio
        ref={audioRef}
        className={nativeFallback ? 'voice-native-fallback' : 'voice-hidden-audio'}
        controls={nativeFallback}
        preload="none"
        src={src}
        aria-label={label}
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration
          if (Number.isFinite(seconds)) setDuration(seconds)
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrent(0)
        }}
      />
      {!nativeFallback && (
        <div className="voice-message-inner">
          <button
            type="button"
            className="voice-toggle"
            onClick={toggle}
            aria-label={(playing ? 'Pause' : 'Play') + ' ' + label}
            aria-pressed={playing}
          >
            {playing ? <Pause size={19} /> : <Play size={19} />}
          </button>
          <div className="voice-track">
            <div className="voice-bars" aria-hidden="true">
              {(peaks ?? placeholder).map((level, index) => (
                <span
                  key={index}
                  className={index / bars <= fraction ? 'voice-bar played' : 'voice-bar'}
                  style={{ height: Math.round(5 + level * 24) + 'px' }}
                />
              ))}
            </div>
            <input
              type="range"
              className="voice-scrubber"
              min={0}
              max={full || 1}
              step={0.1}
              value={Math.min(current, full || 1)}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label={'Seek ' + label}
              disabled={!full}
            />
            <div className="voice-times" aria-hidden="true">
              <time>{formatElapsed(current)}</time>
              <time>{full ? formatElapsed(full) : '00:00'}</time>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Real microphone signal, drawn to canvas instead of re-rendering React. */
export function RecordingWaveform({ stream }: { stream: MediaStream }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element || !window.AudioContext) return
    let audio: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let raf = 0
    let last = 0
    try {
      audio = new AudioContext()
      const analyser = audio.createAnalyser()
      analyser.fftSize = 512
      source = audio.createMediaStreamSource(stream)
      source.connect(analyser)
      void audio.resume().catch(() => {})
      const buffer = new Uint8Array(analyser.fftSize)
      const context = element.getContext('2d')
      const color = getComputedStyle(element).getPropertyValue('--primary').trim() || '#ba314f'
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
      const draw = (now: number) => {
        raf = requestAnimationFrame(draw)
        if (!context || now - last < (reduced ? 300 : 75)) return
        last = now
        analyser.getByteTimeDomainData(buffer)
        context.clearRect(0, 0, element.width, element.height)
        context.fillStyle = color
        const count = 32
        const spacing = element.width / count
        for (let bar = 0; bar < count; bar++) {
          const from = Math.floor((bar * buffer.length) / count)
          const to = Math.floor(((bar + 1) * buffer.length) / count)
          let loudness = 0
          for (let i = from; i < to; i++)
            loudness = Math.max(loudness, Math.abs(buffer[i] - 128) / 128)
          const height = Math.max(3, Math.min(element.height - 2, 3 + loudness * element.height * 1.7))
          context.fillRect(bar * spacing, (element.height - height) / 2, Math.max(2, spacing - 2), height)
        }
      }
      raf = requestAnimationFrame(draw)
    } catch {
      // Recording itself must continue when audio visualization is unavailable.
    }
    return () => {
      cancelAnimationFrame(raf)
      source?.disconnect()
      if (audio) void audio.close().catch(() => {})
    }
  }, [stream])
  return (
    <canvas
      ref={canvas}
      className="voice-recording-waveform"
      width={160}
      height={30}
      role="img"
      aria-label="Live microphone waveform"
    />
  )
}
