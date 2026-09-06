import test from 'node:test';
import assert from 'node:assert/strict';
import { sectionFromHash, nextEvent, latestNews } from '../src/navigation.js';

test('navigation supports direct section links and safe home fallback', () => {
  for (const id of ['home', 'groceries', 'calendar', 'news']) assert.equal(sectionFromHash(`#${id}`), id);
  for (const hash of ['', '#main', '#unknown']) assert.equal(sectionFromHash(hash), 'home');
});

test('home selects upcoming or ongoing events without mutating calendar data', () => {
  const now = new Date('2026-09-06T12:00:00');
  const events = [
    { title: 'Later', all_day: true, start_at: '2026-09-10' },
    { title: 'Past', all_day: true, start_at: '2026-09-01' },
    { title: 'Ongoing', all_day: true, start_at: '2026-09-05', end_at: '2026-09-07' },
  ];
  const before = structuredClone(events);
  assert.equal(nextEvent(events, now).title, 'Ongoing');
  assert.deepEqual(events, before);
  assert.equal(nextEvent([], now), undefined);
});

test('home selects newest news by creation time regardless of input order', () => {
  const posts = [{ title: 'Old', created_at: '2026-09-01T00:00:00Z' }, { title: 'New', created_at: '2026-09-06T00:00:00Z' }];
  assert.equal(latestNews(posts).title, 'New');
  assert.equal(posts[0].title, 'Old');
  assert.equal(latestNews([]), undefined);
});
