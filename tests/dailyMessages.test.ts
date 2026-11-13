import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dailyMessages } from '../src/dailyMessages'

test('daily love notes are distinct from requests and have a useful preset catalog', () => {
  assert.ok(dailyMessages.length >= 15)
  assert.equal(new Set(dailyMessages.map(x => x.id)).size, dailyMessages.length)
  assert.ok(dailyMessages.some(x => /i love you/i.test(x.title)))
  assert.ok(dailyMessages.some(x => /thinking of you/i.test(x.title)))
  for (const note of dailyMessages) {
    assert.ok(note.title.length >= 3 && note.title.length <= 70)
    assert.ok(note.message.length >= 1 && note.message.length <= 160)
    assert.ok(!note.message.endsWith('?'), 'daily note should not be a request')
  }
})
