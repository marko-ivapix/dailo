const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');

function functionSource(name, nextName) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `${name} is implemented`);
  return source.slice(start, source.indexOf(`  function ${nextName}(`, start));
}

test('Recovery chooser shows loading, failure, empty and one-entity restore controls', () => {
  const code = functionSource('renderLocalSnapshotsModal', 'downloadBackup');
  const context = { modalState: { type: 'local-snapshots', loading: true, snapshots: [] }, esc: String, modalFrame: value => value };
  vm.createContext(context);
  assert.match(vm.runInContext(`${code}\nrenderLocalSnapshotsModal()`, context), /Loading/);
  context.modalState.loading = false;
  assert.match(vm.runInContext('renderLocalSnapshotsModal()', context), /No automatic snapshots/);
  context.modalState.error = 'Storage unavailable';
  assert.match(vm.runInContext('renderLocalSnapshotsModal()', context), /Storage unavailable/);
  context.modalState.error = null;
  context.modalState.snapshots = [{ id: 'snapshot', createdAt: '2026-09-17T12:00:00Z', appData: { tasks: [{ id: 'task', title: 'Recover me' }] } }];
  const html = vm.runInContext('renderLocalSnapshotsModal()', context);
  assert.match(html, /Recover me/); assert.match(html, /data-action="restore-snapshot-entity"/);
  assert.match(html, /data-collection="tasks"/); assert.match(html, /data-entity-id="task"/);
});

test('Storage warning distinguishes unsaved changes from snapshot failure and offers retry', () => {
  const code = functionSource('storageWarningHtml', 'renderMain');
  const context = { storageError: true, automaticSnapshotError: null, esc: String };
  vm.createContext(context);
  assert.match(vm.runInContext(`${code}\nstorageWarningHtml()`, context), /Changes couldn't be saved/);
  assert.match(vm.runInContext('storageWarningHtml()', context), /data-action="retry-save"/);
  context.storageError = false; context.automaticSnapshotError = 'Quota exceeded';
  const html = vm.runInContext('storageWarningHtml()', context);
  assert.match(html, /Automatic snapshot failed/); assert.match(html, /Quota exceeded/);
  assert.doesNotMatch(html, /Changes couldn't be saved/);
});
