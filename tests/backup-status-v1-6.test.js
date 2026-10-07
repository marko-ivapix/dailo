const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function renderSettings(backupStatus) {
  let adapter;
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/settings-ui.js'), 'utf8'), {
    window: { TodoDomainModules: { register: value => { adapter = value; } } },
  });
  return adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, compactDensity: true, todayFocusFilter: 'all', todayVisibleSections: [], backupStatus } },
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', esc: value => String(value),
  });
}

test('Settings persists and visibly reports backup export, import, snapshot, and validation status', () => {
  const page = renderSettings({
    lastExport: '2026-09-17T10:00:00.000Z', lastImport: '2026-09-17T11:00:00.000Z',
    snapshotAvailable: true, validationResult: 'Backup validated and recovery copy ready',
  });

  for (const label of ['Last export', 'Last import', 'Recovery snapshot', 'Validation']) assert.match(page, new RegExp(label));
  for (const value of ['2026-09-17T10:00:00.000Z', '2026-09-17T11:00:00.000Z', 'Available', 'Backup validated and recovery copy ready']) assert.match(page, new RegExp(value));
});
