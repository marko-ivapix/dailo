(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoAttachments = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const DB_NAME = 'todoAppAttachments';
  const DB_VERSION = 1;
  const STORE = 'attachments';
  let dbPromise = null;
  const memory = new Map();

  function cloneMemoryRecord(record) {
    return record ? { ...record } : null;
  }

  function memoryMode() {
    return Boolean(root && root.__TODO_TEST_MEMORY_DB__);
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    });
  }

  async function open() {
    if (memoryMode()) return { name: 'memory-test-db' };
    if (!root.indexedDB) throw new Error('IndexedDB unavailable');
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let request;
        try { request = root.indexedDB.open(DB_NAME, DB_VERSION); }
        catch (error) { reject(error); return; }
        request.onupgradeneeded = () => {
          const db = request.result;
          let store;
          if (!db.objectStoreNames.contains(STORE)) store = db.createObjectStore(STORE, { keyPath: 'id' });
          else store = request.transaction.objectStore(STORE);
          if (!store.indexNames.contains('taskId')) store.createIndex('taskId', 'taskId', { unique: false });
          if (!store.indexNames.contains('pendingDeleteUntil')) store.createIndex('pendingDeleteUntil', 'pendingDeleteUntil', { unique: false });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open attachment database'));
        request.onblocked = () => reject(new Error('Attachment database is blocked'));
      });
    }
    return dbPromise;
  }

  async function withStore(mode, fn) {
    const db = await open();
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const value = await fn(store, tx);
    await transactionDone(tx);
    return value;
  }

  async function put(record) {
    if (!record || !record.id || !record.taskId) throw new Error('Invalid attachment record');
    if (memoryMode()) { memory.set(record.id, cloneMemoryRecord(record)); return record; }
    await withStore('readwrite', store => requestPromise(store.put(record)));
    return record;
  }

  async function get(id) {
    if (memoryMode()) return cloneMemoryRecord(memory.get(id) || null);
    return withStore('readonly', store => requestPromise(store.get(id))).then(value => value || null);
  }

  async function getMany(ids) {
    const list = [];
    for (const id of ids || []) {
      const record = await get(id);
      if (record) list.push(record);
    }
    return list;
  }

  async function listByTask(taskId) {
    if (memoryMode()) return [...memory.values()].filter(r => r.taskId === taskId).map(cloneMemoryRecord);
    return withStore('readonly', store => requestPromise(store.index('taskId').getAll(taskId)));
  }

  async function listAll() {
    if (memoryMode()) return [...memory.values()].map(cloneMemoryRecord);
    return withStore('readonly', store => requestPromise(store.getAll()));
  }

  async function markPending(ids, untilIso) {
    const records = await getMany(ids);
    for (const record of records) await put({ ...record, pendingDeleteUntil: untilIso, updatedAt: new Date().toISOString() });
    return records.length;
  }

  async function restorePending(ids) {
    const records = await getMany(ids);
    for (const record of records) await put({ ...record, pendingDeleteUntil: null, updatedAt: new Date().toISOString() });
    return records.length;
  }

  async function deleteMany(ids) {
    const unique = [...new Set(ids || [])];
    if (memoryMode()) { unique.forEach(id => memory.delete(id)); return unique.length; }
    await withStore('readwrite', async store => {
      for (const id of unique) store.delete(id);
    });
    return unique.length;
  }

  async function cleanupExpired(nowIso) {
    const now = new Date(nowIso).getTime();
    if (!Number.isFinite(now)) return 0;
    const records = await listAll();
    const expired = records.filter(record => record.pendingDeleteUntil && new Date(record.pendingDeleteUntil).getTime() <= now).map(record => record.id);
    if (expired.length) await deleteMany(expired);
    return expired.length;
  }

  async function clearAll() {
    if (memoryMode()) { const size = memory.size; memory.clear(); return size; }
    await withStore('readwrite', store => requestPromise(store.clear()));
  }

  async function replaceAll(records) {
    if (memoryMode()) {
      memory.clear();
      for (const record of records || []) memory.set(record.id, cloneMemoryRecord(record));
      return;
    }
    await withStore('readwrite', async store => {
      store.clear();
      for (const record of records || []) store.put(record);
    });
  }

  return { DB_NAME, open, put, get, getMany, listByTask, listAll, markPending, restorePending, deleteMany, cleanupExpired, clearAll, replaceAll };
});
