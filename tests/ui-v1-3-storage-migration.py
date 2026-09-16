"""Disposable real-origin/real-IndexedDB migration acceptance (managed Chromium)."""
import functools
import http.server
import json
from pathlib import Path
import threading
import unittest

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
RAW = json.dumps({
    'version': 2,
    'tasks': [{'id': 'legacy-task', 'title': 'Original task', 'notes': 'Keep notes',
               'projectId': 'legacy-project', 'isInbox': False, 'isCompleted': False,
               'plannedDate': '2099-09-17', 'dueDate': '2099-09-19',
               'reminderAt': '2099-09-19T10:00:00.000Z', 'reminderFiredAt': None,
               'recurrence': {'frequency': 'weekly', 'interval': 2},
               'subtasks': [{'id': 'sub-1', 'title': 'Child', 'isCompleted': True, 'order': 4}],
               'tagIds': ['tag-1'], 'priority': 'high', 'attachmentIds': ['file-1', 'file-2'],
               'todayOrder': 7, 'projectOrder': 3, 'inboxOrder': 6,
               'createdAt': '2026-01-01T00:00:00Z', 'updatedAt': '2026-01-02T00:00:00Z'}],
    'projects': [{'id': 'legacy-project', 'name': 'Old project', 'color': '#5362FF',
                  'order': 8, 'isArchived': True, 'archivedAt': '2026-02-01T00:00:00Z'}],
    'tags': [{'id': 'tag-1', 'name': 'Keep tag', 'color': '#30CBAD', 'order': 2,
              'createdAt': '2026-01-01T00:00:00Z', 'updatedAt': '2026-01-02T00:00:00Z'}],
    'settings': {'weekStartsOn': 'monday', 'customPreference': 'kept'},
    'ui': {'sidebarCollapsed': True, 'completedPeriod': 7},
}, indent=2)

SEED = """async raw => {
  localStorage.setItem('todoAppData', raw);
  const db = await new Promise((resolve,reject) => {
    const r = indexedDB.open('todoAppAttachments', 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore('attachments', {keyPath:'id'});
      s.createIndex('taskId','taskId');
    };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    await new Promise((resolve,reject) => {
      const tx = db.transaction('attachments','readwrite');
      for (const id of ['file-1','file-2','unreferenced']) tx.objectStore('attachments').put({
        id, taskId:'legacy-task', name:id+'.bin', type:'application/x-migration-test', size:5,
        blob:new Blob([new Uint8Array([0,255,17,128,42])], {type:'application/x-migration-test'}),
        createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-02T00:00:00Z', pendingDeleteUntil:null
      });
      tx.oncomplete=resolve; tx.onabort=() => reject(tx.error);
    });
  } finally { db.close(); }
}"""

FAILURE = """mode => {
  window.migrationFailure = mode;
  window.migrationEvents = [];
  const originalSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    if (key === 'todoAppData' && JSON.parse(value).version === 3) window.migrationEvents.push('persist');
    if (window.migrationFailure === 'persist' && key === 'todoAppData') throw new Error('Injected metadata write failure');
    return originalSet.call(this,key,value);
  };
  const originalStore = IDBTransaction.prototype.objectStore;
  IDBTransaction.prototype.objectStore = function(name) {
    if (name === 'habitLogs') window.migrationEvents.push('hydrate');
    return originalStore.call(this,name);
  };
  const originalOpen = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function(name, ...args) {
    if (window.migrationFailure === 'open' && name === 'todoAppDB')
      throw new Error('Injected database opening failure');
    return originalOpen.call(this,name,...args);
  };
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(record, ...args) {
    if (this.name === 'recoverySnapshots') this.transaction.addEventListener('complete', () => window.migrationEvents.push('snapshot-complete'));
    if (this.name === 'attachments') window.migrationEvents.push('copy');
    if (window.migrationFailure === 'snapshot' && this.name === 'recoverySnapshots')
      throw new Error('Injected snapshot failure');
    if (window.migrationFailure === 'copy' && this.name === 'attachments' && record.id === 'file-2')
      throw new Error('Injected legacy copy failure');
    return originalPut.call(this,record,...args);
  };
  const originalDelete = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function(key) {
    if (window.migrationFailure === 'cleanup' && this.name === 'recoverySnapshots') throw new Error('Injected cleanup failure');
    return originalDelete.call(this,key);
  };
}"""


class MigrationTests(unittest.TestCase):
    def run(self, result=None):
        self.context = None
        try:
            return super().run(result)
        finally:
            if self.context:
                self.context.close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 1000})
        self.context.route('**/*', lambda route: route.continue_()
                           if route.request.url.startswith(self.origin) else route.abort())
        self.page = self.context.new_page()
        self.page.route('**/seed.html', lambda route: route.fulfill(body='<html></html>', content_type='text/html'))
        self.page.goto(self.origin + '/seed.html')
        self.page.evaluate(SEED, RAW)

    def boot(self, failure=None):
        if failure:
            self.page.add_init_script('(' + FAILURE + ')(' + json.dumps(failure) + ')')
        self.page.goto(self.origin + '/index.html')
        self.page.wait_for_function("window.TodoApp && (TodoApp.state || document.querySelector('[data-action=retry-load]'))")
        self.page.evaluate('TodoApp.ready')

    def blob(self, attachment_id='file-1'):
        return self.page.evaluate("""async id => {
          const r = await TodoAttachments.get(id);
          return r ? {id:r.id, taskId:r.taskId, type:r.blob.type, bytes:[...new Uint8Array(await r.blob.arrayBuffer())]} : null;
        }""", attachment_id)

    def test_automatic_legacy_blob_startup(self):
        self.boot()
        self.assertEqual(self.blob(), {'id': 'file-1', 'taskId': 'legacy-task',
                                      'type': 'application/x-migration-test', 'bytes': [0, 255, 17, 128, 42]})
        metadata = self.page.evaluate("async () => { const {blob,...metadata}=await TodoAttachments.get('file-1'); return metadata; }")
        self.assertEqual(metadata, {'id': 'file-1', 'taskId': 'legacy-task', 'name': 'file-1.bin',
                                    'type': 'application/x-migration-test', 'size': 5,
                                    'createdAt': '2026-01-01T00:00:00Z', 'updatedAt': '2026-01-02T00:00:00Z',
                                    'pendingDeleteUntil': None})

    def test_failed_open_preserves_exact_original_raw(self):
        self.boot('open')
        self.assertEqual(self.page.evaluate("localStorage.getItem('todoAppData')"), RAW,
                         'Startup overwrote source metadata before IndexedDB readiness')
        self.assertIsNone(self.page.evaluate('TodoApp.state'))
        self.assertIn('migration', self.page.locator('.recovery').inner_text().lower())

    def test_snapshot_before_persist_contains_restorable_records(self):
        self.boot('copy')
        snapshots = self.page.evaluate('TodoStorage.recoverySnapshots.listAll()')
        self.assertEqual(len(snapshots), 1)
        self.assertEqual(snapshots[0]['appData'], json.loads(RAW))
        self.assertEqual(snapshots[0]['rawAppData'], RAW)
        self.assertEqual(set(snapshots[0]['attachmentRefs']), {'file-1', 'file-2'})
        restored = self.page.evaluate("""async () => {
          const [s] = await TodoStorage.recoverySnapshots.listAll();
          return Promise.all(s.attachments.map(async r => ({id:r.id, type:r.blob.type, bytes:[...new Uint8Array(await r.blob.arrayBuffer())]})));
        }""")
        self.assertEqual(len(restored), 2)
        for record in restored:
            self.assertEqual(record['bytes'], [0, 255, 17, 128, 42])
            self.assertEqual(record['type'], 'application/x-migration-test')
        self.assertEqual(self.page.evaluate("localStorage.getItem('todoAppData')"), RAW)

    def test_snapshot_failure_error_and_retry(self):
        self.check_retry('snapshot')

    def test_open_failure_error_and_retry(self):
        self.check_retry('open')

    def test_partial_copy_error_and_retry(self):
        self.check_retry('copy')

    def test_metadata_persist_failure_and_retry(self):
        self.check_retry('persist')

    def test_snapshot_copy_persist_then_hydration_order_and_cleanup(self):
        self.boot('observe')
        self.page.wait_for_function("window.migrationEvents.includes('hydrate')")
        events = self.page.evaluate('window.migrationEvents')
        self.assertLess(events.index('snapshot-complete'), events.index('copy'))
        self.assertLess(events.index('copy'), events.index('persist'))
        self.assertLess(events.index('persist'), events.index('hydrate'))
        self.assertEqual(self.page.evaluate('TodoStorage.recoverySnapshots.listAll()'), [])

    def test_cleanup_failure_does_not_discard_committed_ready_state(self):
        self.boot('cleanup')
        self.assertEqual(self.page.evaluate('TodoApp.state.version'), 3)
        self.assertEqual(self.page.locator('[data-action="retry-load"]').count(), 0)
        self.assertEqual(len(self.page.evaluate('TodoStorage.recoverySnapshots.listAll()')), 1)
        self.assertEqual(self.blob()['bytes'], [0, 255, 17, 128, 42])
        # A fresh document uses the same durable origin without the page-scoped injection.
        self.page.close()
        self.page = self.context.new_page()
        self.page.goto(self.origin + '/index.html')
        self.page.wait_for_function('window.TodoApp?.state?.version === 3')
        self.assertEqual(self.page.evaluate('TodoStorage.recoverySnapshots.listAll()'), [])

    def test_failure_pagehide_cannot_save_replacement_state(self):
        self.boot('copy')
        self.page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        self.assertEqual(self.page.evaluate("localStorage.getItem('todoAppData')"), RAW)
        self.assertNotIn('hydrate', self.page.evaluate('window.migrationEvents'))

    def test_missing_referenced_blob_is_actionable_without_metadata_loss(self):
        damaged = json.loads(RAW)
        damaged['tasks'][0]['attachmentIds'].append('missing-file')
        raw = json.dumps(damaged, indent=2)
        self.page.evaluate("raw => localStorage.setItem('todoAppData',raw)", raw)
        self.boot()
        self.assertIsNone(self.page.evaluate('TodoApp.state'))
        self.assertEqual(self.page.evaluate("localStorage.getItem('todoAppData')"), raw)
        self.assertEqual(self.page.locator('[data-action="retry-load"]').count(), 1)

    def test_invalid_state_never_copies_or_replaces_source(self):
        invalid = json.loads(RAW)
        invalid['tasks'][0]['projectId'] = 'missing-project'
        raw = json.dumps(invalid, indent=2)
        self.page.evaluate("raw => localStorage.setItem('todoAppData',raw)", raw)
        self.boot('observe')
        self.assertIsNone(self.page.evaluate('TodoApp.state'))
        self.assertEqual(self.page.evaluate("localStorage.getItem('todoAppData')"), raw)
        self.assertNotIn('copy', self.page.evaluate('window.migrationEvents'))
        self.assertNotIn('persist', self.page.evaluate('window.migrationEvents'))

    def check_retry(self, mode):
        self.boot(mode)
        self.assertEqual(self.page.evaluate("localStorage.getItem('todoAppData')"), RAW)
        self.assertIsNone(self.page.evaluate('TodoApp.state'))
        self.page.evaluate('window.migrationFailure = null')
        self.page.click('[data-action="retry-load"]', timeout=4000)
        self.page.wait_for_function('TodoApp.state?.version === 3')
        self.assertEqual(self.blob('file-2')['bytes'], [0, 255, 17, 128, 42])
        self.assertEqual(len(self.page.evaluate('TodoAttachments.listAll()')), 2)

    def test_preserves_metadata_source_and_reload_is_idempotent(self):
        self.boot()
        self.page.wait_for_function("JSON.parse(localStorage.getItem('todoAppData')).version === 3")
        migrated = self.page.evaluate("JSON.parse(localStorage.getItem('todoAppData'))")
        original = json.loads(RAW)
        for key, value in original['tasks'][0].items():
            self.assertEqual(migrated['tasks'][0][key], value, key)
        for key, value in original['projects'][0].items():
            self.assertEqual(migrated['projects'][0][key], value, key)
        self.assertEqual(migrated['tags'], original['tags'])
        self.assertEqual(migrated['settings']['customPreference'], 'kept')
        self.assertEqual(migrated['ui']['completedPeriod'], 7)
        self.assertNotIn('habitLogCache', migrated)
        self.assertNotIn('habitMetrics', migrated)
        source = self.page.evaluate("""async () => {
          const db = await new Promise(r => { const q=indexedDB.open('todoAppAttachments'); q.onsuccess=()=>r(q.result); });
          try {
            const records = await new Promise(r => { const q=db.transaction('attachments').objectStore('attachments').getAll(); q.onsuccess=()=>r(q.result); });
            return Promise.all(records.map(async v => ({id:v.id,type:v.blob.type,bytes:[...new Uint8Array(await v.blob.arrayBuffer())]})));
          }
          finally { db.close(); }
        }""")
        self.assertEqual({record['id'] for record in source}, {'file-1', 'file-2', 'unreferenced'})
        for record in source:
            self.assertEqual(record['bytes'], [0, 255, 17, 128, 42])
            self.assertEqual(record['type'], 'application/x-migration-test')
        self.assertEqual(len(self.page.evaluate('TodoAttachments.listAll()')), 2)
        self.page.reload()
        self.page.wait_for_function('window.TodoApp?.state?.version === 3')
        self.assertEqual(len(self.page.evaluate('TodoAttachments.listAll()')), 2)
        self.assertEqual(self.blob(), {'id': 'file-1', 'taskId': 'legacy-task',
                                      'type': 'application/x-migration-test', 'bytes': [0, 255, 17, 128, 42]})

    def test_v3_still_legacy_references_recover(self):
        self.page.add_script_tag(url=self.origin + '/js/core.js')
        self.page.evaluate("localStorage.setItem('todoAppData',JSON.stringify(TodoCore.migrateStateV3(JSON.parse(localStorage.getItem('todoAppData'))).state))")
        self.boot()
        self.assertEqual(self.blob()['bytes'], [0, 255, 17, 128, 42])

    def test_real_schema_indexes_and_compound_uniqueness(self):
        self.page.add_script_tag(url=self.origin + '/js/storage.js')
        schema = self.page.evaluate("""async () => {
          const db = await TodoStorage.open();
          return [...db.objectStoreNames].map(name => {
            const s=db.transaction(name).objectStore(name);
            return {name, keyPath:s.keyPath, indexes:[...s.indexNames].map(i => ({name:i,keyPath:s.index(i).keyPath,unique:s.index(i).unique}))};
          });
        }""")
        expected = {'attachments': {'taskId': ('taskId', False), 'pendingDeleteUntil': ('pendingDeleteUntil', False)},
                    'habitLogs': {'habitId': ('habitId', False), 'date': ('date', False), 'habitDate': (['habitId', 'date'], True)},
                    'goalHistory': {'goalId': ('goalId', False), 'createdAt': ('createdAt', False)},
                    'recoverySnapshots': {'createdAt': ('createdAt', False)}}
        self.assertEqual({s['name']: {i['name']: (i['keyPath'], i['unique']) for i in s['indexes']} for s in schema}, expected)
        self.assertEqual([s['keyPath'] for s in schema], ['id'] * 4)
        duplicate = self.page.evaluate("""async () => {
          await TodoStorage.habitLogs.put({id:'first',habitId:'habit',date:'2026-09-16',status:'done'});
          try { await TodoStorage.habitLogs.put({id:'other',habitId:'habit',date:'2026-09-16',status:'skipped'}); return 'accepted'; }
          catch(error) { return error.name; }
        }""")
        self.assertEqual(duplicate, 'ConstraintError')
        self.assertEqual(len(self.page.evaluate('TodoStorage.habitLogs.listAll()')), 1)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                MigrationTests.browser = browser
                MigrationTests.origin = f'http://127.0.0.1:{server.server_port}'
                result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(MigrationTests))
            finally:
                browser.close()
        return 0 if result.wasSuccessful() else 1
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == '__main__':
    raise SystemExit(main())
