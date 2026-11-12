import assert from 'node:assert/strict'
import { test } from 'node:test'
import { celebrationOn, daysUntil, timeSince } from '../src/calendar'
import { themes } from '../src/themes'

test('counts local calendar days across the year boundary', () => {
  assert.equal(daysUntil('2020-01-01', true, new Date(2026, 11, 31, 23)), 1)
  assert.equal(daysUntil('2020-01-01', true, new Date(2027, 0, 1)), 0)
})

test('uses February 28 for leap day in a common year', () => {
  assert.equal(daysUntil('2020-02-29', true, new Date(2025, 1, 27)), 1)
  assert.equal(daysUntil('2020-02-29', true, new Date(2028, 1, 27)), 2)
})

test('future and past one-time dates use signed day counts', () => {
  assert.equal(daysUntil('2027-05-01', false, new Date(2027, 3, 30)), 1)
  assert.equal(daysUntil('2027-05-01', false, new Date(2027, 4, 2)), -1)
  assert.equal(timeSince('2027-05-01', new Date(2027, 3, 30)), null)
  assert.equal(timeSince('2026-01-31', new Date(2026, 1, 28)), '1 mo, 0 days')
})

test('only approved recurring occasions celebrate', () => {
  assert.equal(celebrationOn(new Date(2026, 11, 5)), 'anniversary')
  assert.equal(celebrationOn(new Date(2026, 1, 26)), 'kisses')
  assert.equal(celebrationOn(new Date(2026, 1, 22)), null)
  assert.equal(celebrationOn(new Date(2026, 8, 23)), null)
})

test('all six theme IDs have distinct complete palettes', () => {
  assert.deepEqual(Object.keys(themes), [
    'cherry',
    'scarlet',
    'velvet',
    'sunset',
    'berry',
    'night',
  ])
  assert.equal(new Set(Object.values(themes).map((theme) => theme[2])).size, 6)
  assert.ok(
    Object.values(themes).every((theme) =>
      theme.slice(1).every((value) => /^#[A-F0-9]{6}$/.test(value)),
    ),
  )
})
