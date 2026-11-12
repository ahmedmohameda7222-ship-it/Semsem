import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waveformPeaks } from '../src/waveform'

test('waveform calculates actual audio loudness rather than decorative random bars', () => {
  const samples = new Float32Array(2400)
  samples.fill(0.8, 0, 1200)
  const peaks = waveformPeaks(samples, 12)
  assert.equal(peaks.length, 12)
  assert.ok(peaks.slice(0, 6).every((level) => level > 0.9))
  assert.ok(peaks.slice(6).every((level) => level === 0.12))
})

test('waveform bounds quiet, loud, empty and invalid sample values safely', () => {
  assert.deepEqual(waveformPeaks(new Float32Array(0), 3), [0.12, 0.12, 0.12])
  assert.deepEqual(waveformPeaks(new Float32Array([NaN, Infinity, -Infinity]), 2), [0.12, 0.12])
  assert.equal(waveformPeaks(new Float32Array(10), 500).length, 72)
  assert.deepEqual(waveformPeaks(new Float32Array(10), 0), [])
})
