import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Home places Dinner Tonight before Polls without changing their cards', async () => {
  const source = await readFile(new URL('../src/features/home/Home.jsx', import.meta.url), 'utf8');
  const dinner = source.indexOf('<Dinner member={member} compact/>');
  const polls = source.indexOf('<PollHome summary={polls}/>');
  const groceries = source.indexOf('<GroceryHomeCard member={member}/>');

  assert.ok(dinner >= 0 && polls >= 0 && groceries >= 0, 'all Home cards remain present');
  assert.ok(dinner < polls && polls < groceries, 'Dinner, Polls, then Groceries');
  assert.equal((source.match(/<Dinner member=\{member\} compact\/>/g) || []).length, 1);
  assert.equal((source.match(/<PollHome summary=\{polls\}\/>/g) || []).length, 1);
});
