import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  NetworkQualityWatch,
  extractAudioQuality,
  formatCallDuration,
  formatTalkTime,
} from '../src/callQuality'

test('connected call duration supports seconds, minutes, and hours', () => {
  assert.equal(formatCallDuration(0), '00:00')
  assert.equal(formatCallDuration(65), '01:05')
  assert.equal(formatCallDuration(3723), '1:02:03')
  assert.equal(formatTalkTime(0), '0 min')
  assert.equal(formatTalkTime(3900), '1h 5m')
  assert.equal(formatTalkTime(140), '2m')
})

test('two consecutive poor audio samples trigger one warning, with cooldown', () => {
  const watch = new NetworkQualityWatch()
  assert.equal(watch.sample({ jitterSeconds: 0.14 }, 1000), false)
  assert.equal(watch.sample({ jitterSeconds: 0.16 }, 4000), true)
  assert.equal(watch.sample({ jitterSeconds: 0.17 }, 7000), false)
  assert.equal(watch.sample({ jitterSeconds: 0.15 }, 36000), true)
})

test('packet loss is computed from fresh differences, not historical totals', () => {
  const watch = new NetworkQualityWatch()
  assert.equal(watch.sample({ packetsLost: 120, packetsReceived: 2000 }, 1000), false)
  assert.equal(watch.sample({ packetsLost: 130, packetsReceived: 2040 }, 4000), false)
  assert.equal(watch.sample({ packetsLost: 142, packetsReceived: 2080 }, 7000), true)
})

test('short samples and missing optional iOS metrics must not create false alerts', () => {
  const watch = new NetworkQualityWatch()
  assert.equal(watch.sample({}, 1000), false)
  assert.equal(watch.sample({ packetsLost: 0, packetsReceived: 1 }, 4000), false)
  assert.equal(watch.sample({ packetsLost: 1, packetsReceived: 2 }, 7000), false)
  assert.equal(watch.sample({ jitterSeconds: 0.01, roundTripSeconds: 0.09 }, 10000), false)
})

test('disconnection alerts only once per cooldown, regardless of quality samples', () => {
  const watch = new NetworkQualityWatch()
  assert.equal(watch.disconnected(1000), true)
  assert.equal(watch.disconnected(4000), false)
  assert.equal(watch.sample({ jitterSeconds: 0.3 }, 5000), false)
  assert.equal(watch.sample({ jitterSeconds: 0.4 }, 8000), false)
  assert.equal(watch.disconnected(35000), true)
})

test('selects only audio RTT/jitter/loss from browser WebRTC stats', () => {
  const rows = [
    { type: 'inbound-rtp', kind: 'video', jitter: 0.7, packetsLost: 45, packetsReceived: 90 },
    { type: 'inbound-rtp', kind: 'audio', jitter: 0.12, packetsLost: 3, packetsReceived: 123 },
    { type: 'remote-inbound-rtp', kind: 'audio', roundTripTime: 0.91, fractionLost: 0.02 },
  ]
  assert.deepEqual(extractAudioQuality(rows), {
    jitterSeconds: 0.12,
    packetsLost: 3,
    packetsReceived: 123,
    roundTripSeconds: 0.91,
    fractionLost: 0.02,
  })
})
