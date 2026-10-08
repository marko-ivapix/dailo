const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/core.js');

// 2026-10-07 is a Wednesday (sreda).
const TODAY = '2026-10-07';
const parse = text => Core.parseQuickPlanPhrase(text, TODAY);

test('Quick Add accepts Serbian day keywords at the end of the title', () => {
  assert.deepEqual(parse('Pozovi mamu danas'), { title: 'Pozovi mamu', plannedDate: '2026-10-07' });
  assert.deepEqual(parse('Kupi hleb sutra'), { title: 'Kupi hleb', plannedDate: '2026-10-08' });
  assert.deepEqual(parse('Kupi hleb SUTRA'), { title: 'Kupi hleb', plannedDate: '2026-10-08' });
  assert.deepEqual(parse('Teretana ponedeljak'), { title: 'Teretana', plannedDate: '2026-10-12' });
  assert.deepEqual(parse('Teretana u utorak'), { title: 'Teretana', plannedDate: '2026-10-13' });
  assert.deepEqual(parse('Sastanak sreda'), { title: 'Sastanak', plannedDate: '2026-10-14' }, 'today\'s weekday means next week');
  assert.deepEqual(parse('Sastanak u sredu'), { title: 'Sastanak', plannedDate: '2026-10-14' });
  assert.deepEqual(parse('Trening četvrtak'), { title: 'Trening', plannedDate: '2026-10-08' });
  assert.deepEqual(parse('Trening cetvrtak'), { title: 'Trening', plannedDate: '2026-10-08' });
  assert.deepEqual(parse('Trening u Četvrtak'), { title: 'Trening', plannedDate: '2026-10-08' });
  assert.deepEqual(parse('Plati račun u petak'), { title: 'Plati račun', plannedDate: '2026-10-09' });
  assert.deepEqual(parse('Izlet subota'), { title: 'Izlet', plannedDate: '2026-10-10' });
  assert.deepEqual(parse('Izlet u subotu'), { title: 'Izlet', plannedDate: '2026-10-10' });
  assert.deepEqual(parse('Ručak nedelja'), { title: 'Ručak', plannedDate: '2026-10-11' });
  assert.deepEqual(parse('Ručak u nedelju'), { title: 'Ručak', plannedDate: '2026-10-11' });
});

test('Quick Add accepts a Serbian "u H:MM" time and pads a single-digit hour', () => {
  assert.deepEqual(parse('Zubar sutra u 9:30'), { title: 'Zubar', plannedDate: '2026-10-08', plannedTime: '09:30' });
  assert.deepEqual(parse('Sastanak u 10:00'), { title: 'Sastanak', plannedDate: null, plannedTime: '10:00' });
  assert.deepEqual(parse('Sastanak u ponedeljak u 14:15'), { title: 'Sastanak', plannedDate: '2026-10-12', plannedTime: '14:15' });
  assert.deepEqual(parse('Call Monday at 9:05'), { title: 'Call', plannedDate: '2026-10-12', plannedTime: '09:05' });
});

test('Serbian keywords only count at the end and never swallow an invalid phrase', () => {
  for (const text of ['Sutra izveštaj', 'Kupi sutra mleko', 'Sastanak u sredu ujutru', 'Zubar sutra u 25:00', 'Zubar sutra u 9:75', 'u sredu', 'Pročitaj knjigu']) {
    assert.deepEqual(parse(text), { title: text, plannedDate: null }, text);
  }
  assert.deepEqual(parse('Plan u Monday'), { title: 'Plan u', plannedDate: '2026-10-12' }, 'the Serbian "u" belongs only to Serbian weekdays');
});

test('English Quick Add keywords keep working', () => {
  assert.deepEqual(parse('Send invoice tomorrow'), { title: 'Send invoice', plannedDate: '2026-10-08' });
  assert.deepEqual(parse('Plan sprint tomorrow 09:30'), { title: 'Plan sprint', plannedDate: '2026-10-08', plannedTime: '09:30' });
  assert.deepEqual(parse('Review wednesday'), { title: 'Review', plannedDate: '2026-10-14' });
  assert.deepEqual(parse('Send invoice tomorrow morning'), { title: 'Send invoice tomorrow morning', plannedDate: null });
});

test('Quick Add without date parsing reads the same Serbian and English time phrases', () => {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const parseTitle = source.slice(source.indexOf('  function parseQuickAddTitle('), source.indexOf('  function nextOrder('));
  const context = vm.createContext({ Core, state: { tags: [] } });
  vm.runInContext(parseTitle, context);
  // V1.10 adds more fields; this test keeps checking the V1.9 ones.
  const pick = ({ title, plannedDate, plannedTime, tagIds, priority }) => ({ title, plannedDate, plannedTime, tagIds, priority });
  const result = text => pick(JSON.parse(JSON.stringify(vm.runInContext(`parseQuickAddTitle(${JSON.stringify(text)}, false)`, context))));
  assert.deepEqual(result('Sastanak u 9:30'), { title: 'Sastanak', plannedDate: null, plannedTime: '09:30', tagIds: [], priority: null });
  assert.deepEqual(result('Read at 18:45'), { title: 'Read', plannedDate: null, plannedTime: '18:45', tagIds: [], priority: null });
  assert.deepEqual(result('Zubar sutra'), { title: 'Zubar sutra', plannedDate: null, plannedTime: null, tagIds: [], priority: null });
  assert.deepEqual(result('Read 25:00'), { title: 'Read 25:00', plannedDate: null, plannedTime: null, tagIds: [], priority: null });
});
