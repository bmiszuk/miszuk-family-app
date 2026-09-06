import test from 'node:test';
import assert from 'node:assert/strict';
import { eventIsPast, localDateTime, toUtc } from '../src/calendar.js';

test('all-day events remain current through their inclusive end date', () => {
  const event = { all_day: true, start_at: '2026-12-24', end_at: '2026-12-25' };
  assert.equal(eventIsPast(event, new Date(2026,11,25,23,59)), false);
  assert.equal(eventIsPast(event, new Date(2026,11,26,0,0)), true);
});
test('an ongoing timed event remains visible until its end', () => {
  const event = { all_day: false, start_at: '2026-10-01T12:00:00.000Z', end_at: '2026-10-01T14:00:00.000Z' };
  assert.equal(eventIsPast(event, new Date('2026-10-01T13:00:00Z')), false);
  assert.equal(eventIsPast(event, new Date('2026-10-01T15:00:00Z')), true);
});
test('local date/time round trips through UTC without changing the appointment', () => {
  const local = '2026-10-20T18:30';
  assert.equal(localDateTime(toUtc(local)), local);
  assert.throws(() => toUtc('invalid'));
});
