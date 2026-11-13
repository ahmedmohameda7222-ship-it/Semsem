import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeCandidate, unseenCandidates } from '../src/iceSignaling'

test('WebRTC ICE candidate serializes only known fields', () => {
  const result = normalizeCandidate({
    candidate: 'candidate:example 1 udp 123 192.0.2.1 3478 typ relay',
    sdpMid: '0',
    sdpMLineIndex: 0,
    usernameFragment: 'abc',
    hiddenToken: 'never-send-this',
  })
  assert.deepEqual(result, {
    candidate: 'candidate:example 1 udp 123 192.0.2.1 3478 typ relay',
    sdpMid: '0',
    sdpMLineIndex: 0,
    usernameFragment: 'abc',
  })
  assert.equal(JSON.stringify(result).includes('never-send-this'), false)
})

test('unseenCandidates deduplicates retransmitted snapshots from realtime and polling', () => {
  const seen = new Set<string>()
  const first = { candidate: 'candidate:one', sdpMid: '0', sdpMLineIndex: 0 }
  const second = { candidate: 'candidate:two', sdpMid: '0', sdpMLineIndex: 0 }
  assert.deepEqual(unseenCandidates([first, first, second], seen), [first, second])
  assert.deepEqual(unseenCandidates([first, second], seen), [])
})

test('invalid, excessive and unsafe candidates never enter trickle signaling', () => {
  assert.equal(normalizeCandidate({ candidate: 'some arbitrary text' }), null)
  assert.equal(normalizeCandidate({ candidate: 'candidate:' + 'X'.repeat(3000) }), null)
  assert.equal(normalizeCandidate({ candidate: 'candidate:something', sdpMLineIndex: -1 }), null)
  assert.equal(normalizeCandidate({ candidate: 'candidate:ok', sdpMid: 'A'.repeat(100) }), null)
  assert.deepEqual(unseenCandidates([], new Set()), [])
})
