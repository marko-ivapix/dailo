(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const DB_NAME = 'todoAppDB';
  const DB_VERSION = 1;
  const STORES = ['attachments', 'habitLogs', 'goalHistory', 'recoverySnapshots'];
  const LEGACY_ATTACHMENT_DB_NAME = 'todoAppAttachments';
  const ATTACHMENTS_STORE = 'attachments';
  let dbPromise = null;
  const memoryStores = Object.fromEntries(STORES.map(name => [name, new Map()]));

  function memoryMode() {
    return Boolean(root && root.__TODO_TEST_MEMORY_DB__);
  }

  // Metadata rules stay in TodoCore, while storage callers get one safe entry
  // point before persisting V1.5-compatible state.
  function normalizeState(state) {
    return root.TodoCore?.normalizeState ? root.TodoCore.normalizeState(state) : state;
  }

  function clone(record) {
    if (record === undefined || record === null) return null;
    if (typeof root.structuredClone === 'function') return root.structuredClone(record);
    return { ...record };
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

  function ensureIndex(store, name, keyPath, options) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
  }

  function upgradeDatabase(db, tx) {
    const attachments = db.objectStoreNames.contains('attachments')
      ? tx.objectStore('attachments')
      : db.createObjectStore('attachments', { keyPath: 'id' });
    ensureIndex(attachments, 'taskId', 'taskId', { unique: false });
    ensureIndex(attachments, 'pendingDeleteUntil', 'pendingDeleteUntil', { unique: false });

    const habitLogs = db.objectStoreNames.contains('habitLogs')
      ? tx.objectStore('habitLogs')
      : db.createObjectStore('habitLogs', { keyPath: 'id' });
    ensureIndex(habitLogs, 'habitId', 'habitId', { unique: false });
    ensureIndex(habitLogs, 'date', 'date', { unique: false });
    ensureIndex(habitLogs, 'habitDate', ['habitId', 'date'], { unique: true });

    const goalHistory = db.objectStoreNames.contains('goalHistory')
      ? tx.objectStore('goalHistory')
      : db.createObjectStore('goalHistory', { keyPath: 'id' });
    ensureIndex(goalHistory, 'goalId', 'goalId', { unique: false });
    ensureIndex(goalHistory, 'createdAt', 'createdAt', { unique: false });

    const recoverySnapshots = db.objectStoreNames.contains('recoverySnapshots')
      ? tx.objectStore('recoverySnapshots')
      : db.createObjectStore('recoverySnapshots', { keyPath: 'id' });
    ensureIndex(recoverySnapshots, 'createdAt', 'createdAt', { unique: false });
  }

  async function open() {
    if (memoryMode()) return { name: 'memory-test-db' };
    if (!root.indexedDB) throw new Error('IndexedDB unavailable');
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let request;
        try { request = root.indexedDB.open(DB_NAME, DB_VERSION); }
        catch (error) { reject(error); return; }
        request.onupgradeneeded = () => upgradeDatabase(request.result, request.transaction);
        let failed = false;
        const fail = error => { failed = true; reject(error); };
        request.onsuccess = () => {
          if (failed) { request.result.close(); return; }
          request.result.onversionchange = () => { request.result.close(); dbPromise = null; };
          resolve(request.result);
        };
        request.onerror = () => fail(request.error || new Error('Could not open storage database'));
        request.onblocked = () => fail(new Error('Storage database is blocked'));
      });
    }
    try { return await dbPromise; }
    catch (error) { dbPromise = null; throw error; }
  }

  async function withStore(storeName, mode, fn) {
    const db = await open();
    const tx = db.transaction(storeName, mode);
    const done = transactionDone(tx);
    // Install completion/error handlers before issuing requests, including synchronous failures.
    done.catch(() => {});
    let value;
    try {
      value = await fn(tx.objectStore(storeName), tx);
    } catch (error) {
      try { tx.abort(); } catch (_) { /* transaction already finished */ }
      await done.catch(() => {});
      throw error;
    }
    await done;
    return value;
  }

  function requireRecord(record, fields, label) {
    if (!record || fields.some(field => !record[field])) throw new Error(`Invalid ${label} record`);
  }

  async function putRecord(storeName, record, fields, label) {
    requireRecord(record, fields, label);
    if (memoryMode()) {
      if (storeName === 'habitLogs') {
        const duplicate = [...memoryStores.habitLogs.values()].find(item => item.id !== record.id && item.habitId === record.habitId && item.date === record.date);
        if (duplicate) throw new Error('Habit log already exists for this habit and date');
      }
      memoryStores[storeName].set(record.id, clone(record));
      return clone(record);
    }
    await withStore(storeName, 'readwrite', store => requestPromise(store.put(record)));
    return clone(record);
  }

  async function getRecord(storeName, id) {
    if (memoryMode()) return clone(memoryStores[storeName].get(id));
    return withStore(storeName, 'readonly', store => requestPromise(store.get(id))).then(value => value || null);
  }

  async function listRecords(storeName) {
    if (memoryMode()) return [...memoryStores[storeName].values()].map(clone);
    return withStore(storeName, 'readonly', store => requestPromise(store.getAll()));
  }

  async function listByIndex(storeName, indexName, value) {
    if (memoryMode()) return (await listRecords(storeName)).filter(record => record[indexName] === value);
    return withStore(storeName, 'readonly', store => requestPromise(store.index(indexName).getAll(value)));
  }

  async function deleteManyRecords(storeName, ids) {
    const unique = [...new Set(ids || [])];
    if (memoryMode()) {
      unique.forEach(id => memoryStores[storeName].delete(id));
      return unique.length;
    }
    await withStore(storeName, 'readwrite', store => {
      unique.forEach(id => store.delete(id));
    });
    return unique.length;
  }

  async function clearStore(storeName) {
    if (memoryMode()) {
      const count = memoryStores[storeName].size;
      memoryStores[storeName].clear();
      return count;
    }
    return withStore(storeName, 'readwrite', store => requestPromise(store.clear()));
  }

  async function sameAttachmentRecord(actual, expected) {
    if (!actual || !expected) return actual === expected;
    const canonical = value => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
      return value;
    };
    const metadata = record => { const copy = { ...record }; delete copy.blob; return JSON.stringify(canonical(copy)); };
    if (metadata(actual) !== metadata(expected) || actual.blob?.type !== expected.blob?.type || actual.blob?.size !== expected.blob?.size) return false;
    if (!actual.blob) return true;
    const a = new Uint8Array(await actual.blob.arrayBuffer()), b = new Uint8Array(await expected.blob.arrayBuffer());
    return a.length === b.length && a.every((byte, index) => byte === b[index]);
  }

  // Blob reads yield outside IDB's active request callback. Keep ONE request in
  // flight until the comparison settles, then issue deletion inside its callback.
  // The RW transaction locks the record throughout; no outside-read/ID-only race.
  function mutateMatchingBlob(store, tx, expected, mutate) {
    return new Promise((resolve, reject) => {
      const request = store.get(expected.id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        let settled = false, matches = false, failure = null;
        sameAttachmentRecord(request.result, expected).then(value => { matches = value; settled = true; }, error => { failure = error; settled = true; });
        const keepAlive = () => {
          try {
            const next = store.get(expected.id);
            next.onerror = () => reject(next.error);
            next.onsuccess = () => {
              if (!settled) { keepAlive(); return; }
              try {
                if (failure) throw failure;
                if (matches) mutate();
                resolve(matches ? 1 : 0);
              } catch (error) { try { tx.abort(); } catch (_) {} reject(error); }
            };
          } catch (error) { reject(error); }
        };
        keepAlive();
      };
    });
  }

  function attachmentOwners(state) {
    return [
      ...state.tasks.map(item => ({ type: 'task', item })),
      ...(state.notes || []).map(item => ({ type: 'note', item })),
      ...(state.resources || []).map(item => ({ type: 'resource', item })),
    ];
  }

  function attachmentBelongsTo(record, owner) {
    return Boolean(record && (owner.type === 'task'
      ? record.taskId === owner.item.id && (record.ownerType == null || record.ownerType === 'task')
        && (record.ownerId == null || record.ownerId === owner.item.id)
      : record.taskId == null && record.ownerType === owner.type && record.ownerId === owner.item.id));
  }

  function requireAttachmentRecord(record) {
    requireRecord(record, ['id'], 'attachment');
    if (['note', 'resource'].includes(record.ownerType)) {
      requireRecord(record, ['ownerId'], 'attachment');
      if (record.taskId != null) throw new Error('Invalid attachment ownership');
    } else {
      requireRecord(record, ['taskId'], 'attachment');
      if (record.ownerType != null && record.ownerType !== 'task') throw new Error('Invalid attachment ownership');
    }
  }

  function verifyAttachmentReferences(state, records) {
    const byId = new Map();
    for (const record of records) {
      requireAttachmentRecord(record);
      if (byId.has(record.id)) throw new Error(`Duplicate attachment: ${record.id}`);
      byId.set(record.id, record);
    }
    const referenced = new Set();
    for (const owner of attachmentOwners(state)) {
      for (const id of owner.item.attachmentIds || []) {
        if (referenced.has(id)) throw new Error(`Reused attachment reference: ${id}`);
        referenced.add(id);
        const record = byId.get(id);
        if (!attachmentBelongsTo(record, owner) || !(record.blob instanceof root.Blob)
          || record.blob.size !== record.size) throw new Error(`Missing or invalid attachment: ${id}`);
      }
    }
  }

  const attachments = {
    async put(record) {
      requireAttachmentRecord(record);
      return putRecord('attachments', record, ['id'], 'attachment');
    },
    async get(id) { return getRecord('attachments', id); },
    async getMany(ids) {
      const records = [];
      for (const id of ids || []) {
        const record = await getRecord('attachments', id);
        if (record) records.push(record);
      }
      return records;
    },
    async listByTask(taskId) { return listByIndex('attachments', 'taskId', taskId); },
    async listAll() { return listRecords('attachments'); },
    async markPending(ids, untilIso, token, expectedRecords = null, validate = null) {
      const records = await this.getMany(ids);
      await restoreDeleteRecords({ attachments: records.map(record => ({ ...record, pendingDeleteUntil: untilIso,
        ...(token ? { pendingDeleteToken: token } : {}), updatedAt: new Date().toISOString() })) }, expectedRecords || records, validate);
      return records.length;
    },
    async restorePending(ids) {
      const records = await this.getMany(ids);
      for (const record of records) await this.put({ ...record, pendingDeleteUntil: null, updatedAt: new Date().toISOString() });
      return records.length;
    },
    async deleteMany(ids) { return deleteManyRecords('attachments', ids); },
    async deletePending(records, nowIso, validate = null) {
      const due = records.filter(record => new Date(record.pendingDeleteUntil).getTime() <= new Date(nowIso).getTime());
      if (memoryMode()) {
        let count = 0;
        for (const expected of due) {
          const actual = memoryStores.attachments.get(expected.id);
          if (await sameAttachmentRecord(actual, expected) && memoryStores.attachments.get(expected.id) === actual) { validate?.(expected); memoryStores.attachments.delete(expected.id); count++; }
        }
        return count;
      }
      // One bounded record/transaction at a time, using existing attachment limits.
      let count = 0;
      for (const expected of due) count += await withStore('attachments', 'readwrite', (store, tx) => mutateMatchingBlob(store, tx, expected, () => { validate?.(expected); store.delete(expected.id); }));
      return count;
    },
    async cleanupExpired(nowIso, protectedIds = [], validate = null) {
      const now = new Date(nowIso).getTime();
      if (!Number.isFinite(now)) return 0;
      const expired = (await this.listAll())
        .filter(record => !protectedIds.includes(record.id) && record.pendingDeleteUntil && new Date(record.pendingDeleteUntil).getTime() <= now);
      return this.deletePending(expired, nowIso, validate);
    },
    async clearAll() { return clearStore('attachments'); },
    async replaceAll(records) {
      const list = records || [];
      list.forEach(requireAttachmentRecord);
      if (memoryMode()) {
        memoryStores.attachments.clear();
        list.forEach(record => memoryStores.attachments.set(record.id, clone(record)));
        return;
      }
      await withStore('attachments', 'readwrite', store => {
        store.clear();
        list.forEach(record => store.put(record));
      });
    }
  };

  const habitLogs = {
    async put(record) { return putRecord('habitLogs', record, ['id', 'habitId', 'date'], 'habit log'); },
    async get(id) { return getRecord('habitLogs', id); },
    async getByHabitAndDate(habitId, date) {
      if (memoryMode()) return clone([...memoryStores.habitLogs.values()].find(record => record.habitId === habitId && record.date === date));
      return withStore('habitLogs', 'readonly', store => requestPromise(store.index('habitDate').get([habitId, date]))).then(value => value || null);
    },
    async listByHabit(habitId) { return listByIndex('habitLogs', 'habitId', habitId); },
    async listAll() { return listRecords('habitLogs'); },
    async deleteMany(ids) { return deleteManyRecords('habitLogs', ids); },
    async clearAll() { return clearStore('habitLogs'); }
  };

  const goalHistory = {
    async put(record) { return putRecord('goalHistory', record, ['id', 'goalId'], 'goal history'); },
    async get(id) { return getRecord('goalHistory', id); },
    async listByGoal(goalId) { return listByIndex('goalHistory', 'goalId', goalId); },
    async listAll() { return listRecords('goalHistory'); },
    async deleteMany(ids) { return deleteManyRecords('goalHistory', ids); },
    async clearAll() { return clearStore('goalHistory'); }
  };

  const recoverySnapshots = {
    async put(record) { return putRecord('recoverySnapshots', record, ['id'], 'recovery snapshot'); },
    async get(id) { return getRecord('recoverySnapshots', id); },
    async listAll() { return listRecords('recoverySnapshots'); },
    async deleteMany(ids) { return deleteManyRecords('recoverySnapshots', ids); },
    async clearAll() { return clearStore('recoverySnapshots'); }
  };

  // Atomically restore only captured user records, never clear a growing store.
  async function restoreDeleteRecords(snapshot, expectedAttachments = null, validate = null, expectedHistory = null) {
    const names = ['attachments', 'habitLogs', 'goalHistory'].filter(name => snapshot[name]?.length || snapshot.deleteRecords?.[name]?.length);
    if (!names.length) { validate?.(); return; }
    if (memoryMode()) {
      const guards = [];
      if (expectedAttachments) {
        for (const expected of expectedAttachments) {
          const actual = memoryStores.attachments.get(expected.id);
          if (!(await sameAttachmentRecord(actual, expected))) throw new Error('Retained attachment ownership changed.');
          guards.push(['attachments', expected.id, actual]);
        }
      }
      for (const name of names) {
        for (const [id, expected] of expectedHistory?.[name] || []) {
          const actual = memoryStores[name].get(id);
          if (JSON.stringify(actual || null) !== JSON.stringify(expected)) throw new Error('Retained history ownership changed.');
          guards.push([name, id, actual]);
        }
        for (const expected of snapshot.deleteRecords?.[name] || []) {
          const actual = memoryStores[name].get(expected.id);
          if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Retained history ownership changed.');
          guards.push([name, expected.id, actual]);
        }
      }
      validate?.();
      if (guards.some(([name, id, record]) => memoryStores[name].get(id) !== record)) throw new Error('Retained record ownership changed.');
      for (const name of names) for (const record of snapshot[name] || []) memoryStores[name].set(record.id, clone(record));
      for (const name of names) for (const record of snapshot.deleteRecords?.[name] || []) memoryStores[name].delete(record.id);
      return;
    }
    const db = await open(), tx = db.transaction(names, 'readwrite'), done = transactionDone(tx);
    done.catch(() => {});
    try {
      for (const name of names) for (const record of snapshot[name] || []) {
        const store = tx.objectStore(name);
        if (name === 'attachments' && expectedAttachments) {
          const expected = expectedAttachments.find(item => item.id === record.id);
          if (!expected || !(await mutateMatchingBlob(store, tx, expected, () => { validate?.(); store.put(record); }))) throw new Error('Retained attachment ownership changed.');
        } else if (expectedHistory?.[name]) {
          const expected = expectedHistory[name].find(([id]) => id === record.id);
          await new Promise((resolve, reject) => {
            const read = store.get(record.id);
            read.onerror = () => reject(read.error);
            read.onsuccess = () => {
              try {
                if (!expected || JSON.stringify(read.result || null) !== JSON.stringify(expected[1])) throw new Error('Retained history ownership changed.');
                validate?.(); store.put(record); resolve();
              } catch (error) { try { tx.abort(); } catch (_) {} reject(error); }
            };
          });
        } else { validate?.(); store.put(record); }
      }
      for (const name of names) for (const record of snapshot.deleteRecords?.[name] || [])
        if (!(await mutateMatchingBlob(tx.objectStore(name), tx, record, () => { validate?.(); tx.objectStore(name).delete(record.id); }))) throw new Error('Retained history ownership changed.');
    }
    catch (error) { try { tx.abort(); } catch (_) {} await done.catch(() => {}); throw error; }
    await done;
  }

  function openLegacyAttachmentDb() {
    return new Promise((resolve, reject) => {
      let request;
      try { request = root.indexedDB.open(LEGACY_ATTACHMENT_DB_NAME); }
      catch (error) { reject(error); return; }
      let failed = false;
      request.onsuccess = () => { if (failed) request.result.close(); else resolve(request.result); };
      request.onerror = () => { failed = true; reject(request.error || new Error('Could not open legacy attachment database')); };
      request.onblocked = () => { failed = true; reject(new Error('Legacy attachment database is blocked')); };
    });
  }

  async function readLegacyAttachments(taskAttachmentIds) {
    const ids = new Set((taskAttachmentIds || []).filter(Boolean));
    if (!ids.size || memoryMode()) return [];
    if (!root.indexedDB) throw new Error('IndexedDB unavailable');
    const legacyDb = await openLegacyAttachmentDb();
    try {
      if (!legacyDb.objectStoreNames.contains(ATTACHMENTS_STORE)) return [];
      const records = await new Promise((resolve, reject) => {
        const tx = legacyDb.transaction(ATTACHMENTS_STORE, 'readonly');
        const records = [];
        for (const id of ids) {
          const request = tx.objectStore(ATTACHMENTS_STORE).get(id);
          request.onsuccess = () => { if (request.result) records.push(request.result); };
          request.onerror = () => reject(request.error || new Error('Could not read legacy attachments'));
        }
        tx.oncomplete = () => resolve(records);
        tx.onabort = () => reject(tx.error || new Error('Legacy attachment transaction aborted'));
      });
      return records;
    } finally {
      legacyDb.close();
    }
  }

  async function migrateLegacyAttachments(taskAttachmentIds) {
    let copied = 0;
    for (const record of await readLegacyAttachments(taskAttachmentIds)) {
      if (await attachments.get(record.id)) continue;
      await attachments.put(record);
      copied += 1;
    }
    return copied;
  }

  const MIGRATION_SNAPSHOT_ID = 'migration-v3';

  async function prepareMigration(rawAppData, appData, migrated) {
    await open();
    const owners = attachmentOwners(appData);
    const ids = [...new Set(owners.flatMap(owner => owner.item.attachmentIds || []))];
    const taskIds = new Set(appData.tasks.flatMap(task => task.attachmentIds || []));
    const current = await attachments.getMany(ids);
    const currentIds = new Set(current.map(record => record.id));
    // Only legacy task attachments may be copied from the legacy database.
    const missingIds = ids.filter(id => taskIds.has(id) && !currentIds.has(id));
    const legacy = await readLegacyAttachments(missingIds);
    const records = [...current, ...legacy];
    verifyAttachmentReferences(appData, records);
    if (migrated || legacy.length) {
      await recoverySnapshots.put({
        id: MIGRATION_SNAPSHOT_ID, createdAt: new Date().toISOString(), reason: 'migration',
        rawAppData, appData: JSON.parse(rawAppData), attachmentRefs: ids,
        attachments: records, habitLogRefs: [], goalHistoryRefs: []
      });
      await migrateLegacyAttachments(missingIds);
      // Read back from the facade's actual destination; schema persistence must follow this check.
      for (const expected of legacy) {
        const actual = await attachments.get(expected.id);
        if (!actual || actual.taskId !== expected.taskId || actual.blob.type !== expected.blob.type
          || actual.blob.size !== expected.blob.size) throw new Error(`Attachment copy verification failed: ${expected.id}`);
        const before = new Uint8Array(await expected.blob.arrayBuffer());
        const after = new Uint8Array(await actual.blob.arrayBuffer());
        if (before.some((byte, index) => byte !== after[index])) throw new Error(`Attachment bytes changed: ${expected.id}`);
      }
    }
    verifyAttachmentReferences(appData, await attachments.getMany(ids));
    return MIGRATION_SNAPSHOT_ID;
  }

  async function finishMigration(snapshotId = MIGRATION_SNAPSHOT_ID) {
    await recoverySnapshots.deleteMany([snapshotId]);
  }

  const USER_STORES = ['attachments', 'habitLogs', 'goalHistory'];
  async function captureUserData() {
    if (memoryMode()) return Object.fromEntries(USER_STORES.map(name => [name, [...memoryStores[name].values()].map(clone)]));
    const db = await open(), tx = db.transaction(USER_STORES, 'readonly'), done = transactionDone(tx);
    const values = await Promise.all(USER_STORES.map(name => requestPromise(tx.objectStore(name).getAll())));
    await done;
    return Object.fromEntries(USER_STORES.map((name, i) => [name, values[i]]));
  }

  async function sameUserData(actual, expected) {
    for (const name of USER_STORES) {
      if (actual[name].length !== expected[name].length) return false;
      const byId = new Map(actual[name].map(record => [record.id, record]));
      for (const record of expected[name]) if (!(await sameAttachmentRecord(byId.get(record.id), record))) return false;
    }
    return true;
  }

  // Only user stores participate; the recovery payload must outlive this commit.
  // An optional expected domain is compared under the same native write lock.
  async function replaceUserData(payload, expected = null, validate = null) {
    const next = clone(payload);
    if (memoryMode()) {
      const before = await captureUserData();
      if (expected && !(await sameUserData(before, expected))) throw new Error('Stored data changed. Retry with a fresh safety backup.');
      validate?.();
      if (!(await sameUserData(await captureUserData(), before))) throw new Error('Stored data changed during preparation.');
      validate?.();
      for (const name of USER_STORES) { memoryStores[name].clear(); for (const record of next[name]) memoryStores[name].set(record.id, clone(record)); }
      return;
    }
    const db = await open(), tx = db.transaction(USER_STORES, 'readwrite'), done = transactionDone(tx);
    done.catch(() => {});
    try {
      await new Promise((resolve, reject) => {
        let settled = !expected, matches = !expected, failure = null;
        const values = USER_STORES.map(name => requestPromise(tx.objectStore(name).getAll()));
        Promise.all(values).then(rows => expected ? sameUserData(Object.fromEntries(USER_STORES.map((name, i) => [name, rows[i]])), expected) : true)
          .then(value => { matches = value; settled = true; }, error => { failure = error; settled = true; });
        const pump = () => {
          const request = tx.objectStore('attachments').get('__recovery_keepalive__');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            if (!settled) { pump(); return; }
            try {
              if (failure) throw failure;
              if (!matches) throw new Error('Stored data changed. Retry with a fresh safety backup.');
              validate?.();
              for (const name of USER_STORES) {
                const store = tx.objectStore(name); store.clear();
                for (const record of next[name]) store.put(record);
              }
              resolve();
            } catch (error) { tx.abort(); reject(error); }
          };
        };
        pump();
      });
    } catch (error) { try { tx.abort(); } catch (_) {} await done.catch(() => {}); throw error; }
    await done;
  }

  async function createRecoverySnapshot(reason, state, storage = null) {
    const source = storage || { captureUserData, sameUserData, recoverySnapshots };
    const rawAppData = root.localStorage.getItem('todoAppData'), appData = rawAppData === null ? null : JSON.parse(rawAppData);
    const stateText = JSON.stringify(state), payload = await source.captureUserData();
    if (root.localStorage.getItem('todoAppData') !== rawAppData || JSON.stringify(state) !== stateText
      || !(await source.sameUserData(await source.captureUserData(), payload))
      || root.localStorage.getItem('todoAppData') !== rawAppData || JSON.stringify(state) !== stateText) throw new Error('Source changed while preparing recovery. Retry.');
    const id = `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await source.recoverySnapshots.put({ id, reason, phase: 'prepared', createdAt: new Date().toISOString(), rawAppData, appData,
      liveState: JSON.parse(stateText), ...payload, attachmentRefs: payload.attachments, habitLogRefs: payload.habitLogs, goalHistoryRefs: payload.goalHistory });
    return id;
  }

  async function verifyRecoverySnapshot(snapshotId) {
    const snapshot = await recoverySnapshots.get(snapshotId);
    if (!snapshot || root.localStorage.getItem('todoAppData') !== snapshot.rawAppData
      || !(await sameUserData(await captureUserData(), snapshot))
      || root.localStorage.getItem('todoAppData') !== snapshot.rawAppData) throw new Error('Recovery verification failed. Recovery snapshot retained; retry recovery.');
    return snapshot;
  }

  let automaticSnapshotWork = Promise.resolve();
  function createAutomaticSnapshot(state, now = new Date()) {
    const operation = automaticSnapshotWork.catch(() => {}).then(async () => {
      const timestamp = new Date(now);
      if (!Number.isFinite(timestamp.getTime())) throw new Error('Invalid snapshot date.');
      const previous = (await recoverySnapshots.listAll()).filter(item => item.reason === 'automatic')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (previous.length && timestamp.getTime() - Date.parse(previous[0].createdAt) < 300000) return null;
      const id = await createRecoverySnapshot('automatic', state);
      const snapshot = await recoverySnapshots.get(id);
      try {
        snapshot.appData = normalizeState(snapshot.appData);
        root.TodoBackup.validateDomain(snapshot.appData, snapshot.habitLogs, snapshot.goalHistory);
        verifyAttachmentReferences(snapshot.appData, snapshot.attachments);
        snapshot.createdAt = timestamp.toISOString();
        await recoverySnapshots.put(snapshot);
      } catch (error) { await recoverySnapshots.deleteMany([id]); throw error; }
      // Only automatic copies are eligible; interrupted operations retain their safety data.
      const automatic = (await recoverySnapshots.listAll()).filter(item => item.reason === 'automatic')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      await recoverySnapshots.deleteMany(automatic.slice(5).map(item => item.id));
      return id;
    });
    automaticSnapshotWork = operation;
    return operation;
  }

  async function restoreRecoverySnapshot(snapshotId) {
    const snapshot = await recoverySnapshots.get(snapshotId);
    if (!snapshot) throw new Error('Recovery snapshot is unavailable.');
    let expected = null;
    const validate = () => {
      if (snapshot.destination && ![snapshot.rawAppData, snapshot.destination.rawAppData].includes(root.localStorage.getItem('todoAppData')))
        throw new Error('Recovery ownership changed: foreign metadata is present. Close other tabs and resolve the source before retrying recovery.');
    };
    if (snapshot.destination) {
      validate(); expected = await captureUserData();
      if (!(await sameUserData(expected, snapshot)) && !(await sameUserData(expected, snapshot.destination)))
        throw new Error('Recovery ownership changed: foreign stored records or file bytes are present. Resolve the source before retrying recovery.');
      validate();
    }
    await replaceUserData(snapshot, expected, validate);
    validate();
    if (snapshot.rawAppData === null) root.localStorage.removeItem('todoAppData');
    else root.localStorage.setItem('todoAppData', snapshot.rawAppData);
    await verifyRecoverySnapshot(snapshotId);
    return snapshot.liveState || snapshot.appData;
  }

  async function replaceAllValidatedBackup(validated, expected = null, validate = null) {
    const next = clone(validated);
    verifyAttachmentReferences(next.state, next.attachmentRecords);
    await replaceUserData({ attachments: next.attachmentRecords, habitLogs: next.habitLogs, goalHistory: next.goalHistory }, expected, validate);
    validate?.onCommit?.();
    validate?.();
    root.localStorage.setItem('todoAppData', JSON.stringify(next.state));
  }

  async function clearAllForTests() {
    await Promise.all(STORES.map(clearStore));
  }

  return {
    DB_NAME,
    DB_VERSION,
    STORES: [...STORES],
    normalizeState,
    open,
    attachments,
    habitLogs,
    goalHistory,
    recoverySnapshots,
    restoreDeleteRecords,
    sameAttachmentRecord,
    attachmentOwners,
    attachmentBelongsTo,
    verifyAttachmentReferences,
    migrateLegacyAttachments,
    prepareMigration,
    finishMigration,
    captureUserData,
    sameUserData,
    replaceUserData,
    createRecoverySnapshot,
    createAutomaticSnapshot,
    restoreRecoverySnapshot,
    verifyRecoverySnapshot,
    replaceAllValidatedBackup,
    clearAllForTests
  };
});
