import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  connectionRecoveryPlan,
  selectedAudioRoute,
  configureCallAudioSession,
  microphoneNeedsRecovery,
} from '../src/callRecovery'

test('transient disconnects have a grace period and do not immediately end an ongoing call', () => {
  assert.deepEqual(connectionRecoveryPlan('disconnected', 0), { waitMs: 3000, terminate: false })
  assert.deepEqual(connectionRecoveryPlan('connected', 1), { waitMs: 0, terminate: false })
})

test('failed ICE attempts renegotiation instead of immediately hanging up', () => {
  assert.deepEqual(connectionRecoveryPlan('failed', 0), { waitMs: 0, terminate: false })
  assert.deepEqual(connectionRecoveryPlan('failed', 2), { waitMs: 9000, terminate: false })
  assert.deepEqual(connectionRecoveryPlan('failed', 3), { waitMs: 0, terminate: true })
})

test('route indicator reports the actual selected candidate, not merely TURN credentials', () => {
  const direct = [
    { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' },
    { id: 'pair', type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'local' },
    { id: 'local', type: 'local-candidate', candidateType: 'host' },
  ]
  const relay = direct.map((row) => row.id === 'local' ? { ...row, candidateType: 'relay' } : row)
  assert.equal(selectedAudioRoute(direct), 'Direct peer-to-peer route')
  assert.equal(selectedAudioRoute(relay), 'TURN relay route')
  const remoteRelay = [
    ...direct.map((row) => row.id === 'pair'
      ? { ...row, remoteCandidateId: 'other' } : row),
    { id: 'other', type: 'remote-candidate', candidateType: 'relay' },
  ]
  assert.equal(selectedAudioRoute(remoteRelay), 'TURN relay route')
  assert.equal(selectedAudioRoute([]), 'Audio route connected')
})

test('microphone reacquisition is attempted only for ended or platform-muted tracks', () => {
  assert.equal(microphoneNeedsRecovery({ readyState: 'live', muted: false }), false)
  assert.equal(microphoneNeedsRecovery({ readyState: 'live', muted: true }), true)
  assert.equal(microphoneNeedsRecovery({ readyState: 'ended', muted: false }), true)
})

test('audio session configuration requests play-and-record when supported', () => {
  const session = { type: 'auto' }
  configureCallAudioSession({ audioSession: session })
  assert.equal(session.type, 'play-and-record')
  assert.doesNotThrow(() => configureCallAudioSession({}))
})
