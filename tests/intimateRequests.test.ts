import assert from 'node:assert/strict'
import { test } from 'node:test'
import { intimateCategories, intimateRequests, findIntimateRequest } from '../src/intimateRequests'

test('approved private requests are grouped into three familiar themes', () => {
  assert.deepEqual(intimateCategories.map(x=>x.id), ['direct','flirty','romantic'])
  assert.equal(intimateRequests.length,15)
  assert.equal(intimateRequests.filter(x=>x.category==='direct').length,5)
  assert.equal(intimateRequests.filter(x=>x.category==='flirty').length,5)
  assert.equal(intimateRequests.filter(x=>x.category==='romantic').length,5)
})

test('every private request has a unique stable identifier and an optional editable message', () => {
  assert.equal(new Set(intimateRequests.map(x=>x.id)).size,15)
  for (const request of intimateRequests) {
    assert.ok(request.id.length > 3)
    assert.ok(request.title.length > 3 && request.title.length <= 55)
    assert.ok(request.message.length > 1 && request.message.length <= 160)
  }
  assert.match(findIntimateRequest('sex_tonight')!.title,/sex with you/i)
  assert.equal(findIntimateRequest('unknown'),undefined)
})
