import test from 'node:test';
import assert from 'node:assert/strict';
import { chicagoDate, celebrations, parseFamilyDate } from '../src/directoryDates.js';
const person = (id, date) => ({ id, first_name: id, birth_date: date });
test('Chicago today does not follow UTC or device timezone', () => {
  assert.equal(chicagoDate(new Date('2026-01-01T03:00:00Z')), '2025-12-31');
  assert.equal(chicagoDate(new Date('2026-07-01T04:00:00Z')), '2026-06-30');
});
test('Dec 31/Jan 1 reminders include today, tomorrow and optional age', () => {
  const dates = celebrations([person('Bob','12-31'),person('Jessica','2000-01-01')],[],new Date('2025-12-31T18:00:00Z'));
  assert.equal(dates[0].days,0); assert.equal(dates[0].when,'today'); assert.ok(!('age' in dates[0]));
  assert.equal(dates[1].when,'tomorrow'); assert.equal(dates[1].age,26);
  const jan = celebrations([person('Bob','12-31'),person('Jessica','2000-01-01')],[],new Date('2026-01-01T18:00:00Z'));
  assert.equal(jan.length,1); assert.equal(jan[0].days,0);
});
test('anniversary appears once for both spouses and upcoming weekdays are correct', () => {
  const people=[person('Bob','06-01'),person('Steph','07-01')];
  const dates=celebrations(people,[{id:'marriage',person1_id:'Bob',person2_id:'Steph',relationship_type:'spouse',anniversary_date:'2000-09-12'}],new Date('2026-09-10T18:00:00Z'));
  assert.equal(dates.length,1); assert.equal(dates[0].name,'Bob & Steph'); assert.equal(dates[0].when,'Saturday'); assert.ok(!('age' in dates[0]));
});
test('Feb 29 is valid without a year and observed Feb 28 in non-leap years', () => {
  assert.ok(parseFamilyDate('02-29')); assert.equal(parseFamilyDate('2025-02-29'),null);
  assert.equal(celebrations([person('Leap','2000-02-29')],[],new Date('2025-02-28T18:00:00Z'))[0].days,0);
  assert.equal(celebrations([person('Leap','02-29')],[],new Date('2024-02-28T18:00:00Z'))[0].days,1);
});
