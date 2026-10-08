(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DailoSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Dailo V2.0 sync (spec: docs/superpowers/specs/2026-10-08-todo-v2-0-design.md, sections C–E).
  // Local data stays the source of truth. A sync compares the local records with a device-local
  // shadow of what was last synced, pushes the differences, then pulls what other devices changed.
  // No dependencies: plain fetch against Supabase Auth and the PostgREST `records` table.

  // Marks a user-visible error text as a translation key (see js/i18n.js); the app translates it where it is shown.
  const msg = text => text;

  const COLLECTIONS = ['tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews'];
  // Per-device settings and fields that never leave the device (attachments sync in V2.1).
  const DEVICE_SETTINGS = ['backupStatus', 'compactDensity'];
  const DEVICE_FIELDS = { tasks: ['attachmentIds'], notes: ['attachmentIds'], resources: ['attachmentIds'] };
  const PULL_OVERLAP_MS = 5000;

  class SyncError extends Error {
    constructor(message, status = 0) {
      super(message);
      this.name = 'SyncError';
      this.status = status;
    }
  }

  const keyOf = (type, id) => `${type}/${id}`;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

  function omit(object, keys) {
    const copy = { ...(object || {}) };
    for (const key of keys) delete copy[key];
    return copy;
  }

  function pick(object, keys) {
    return Object.fromEntries(keys.filter(key => own(object, key)).map(key => [key, object[key]]));
  }

  // JSON with sorted keys, so equal records hash equally whatever their key order.
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(item => stable(item === undefined ? null : item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function hashRecord(data) {
    const text = stable(data);
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x5bd1e995);
    }
    return `${(first >>> 0).toString(36)}.${(second >>> 0).toString(36)}.${text.length.toString(36)}`;
  }

  // Everything that syncs, keyed "type/id": collection records, the shared settings and habit logs.
  function collectRecords(state, habitLogs = []) {
    const records = new Map();
    for (const type of COLLECTIONS) {
      for (const item of Array.isArray(state?.[type]) ? state[type] : []) {
        if (item && typeof item.id === 'string' && item.id) records.set(keyOf(type, item.id), { type, id: item.id, data: clone(omit(item, DEVICE_FIELDS[type] || [])) });
      }
    }
    if (state?.settings && typeof state.settings === 'object') records.set(keyOf('settings', 'settings'), { type: 'settings', id: 'settings', data: clone(omit(state.settings, DEVICE_SETTINGS)) });
    for (const log of habitLogs || []) if (log && typeof log.id === 'string' && log.id) records.set(keyOf('habitLogs', log.id), { type: 'habitLogs', id: log.id, data: clone(log) });
    return records;
  }

  function diffRecords(records, shadow = {}) {
    const upserts = [];
    const deletes = [];
    for (const [key, record] of records) if (shadow[key] !== hashRecord(record.data)) upserts.push(record);
    for (const key of Object.keys(shadow)) {
      if (records.has(key)) continue;
      const [type, ...rest] = key.split('/');
      deletes.push({ type, id: rest.join('/') });
    }
    return { upserts, deletes };
  }

  const byServerTime = (a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || ''));

  // Applies pulled rows to a copy of the local data. Device-only fields and settings stay as they are.
  // Two logs for the same habit and day: the one with the greater id wins on every device.
  function applyRemote(state, habitLogs, rows) {
    const next = clone(state) || {};
    const logs = new Map((habitLogs || []).map(log => [log.id, log]));
    const puts = new Map();
    const deletes = new Set();
    let changed = false;
    for (const row of [...(rows || [])].sort(byServerTime)) {
      if (row.type === 'settings') {
        if (row.deleted || !row.data) continue;
        const current = next.settings || {};
        if (hashRecord(omit(current, DEVICE_SETTINGS)) === hashRecord(row.data)) continue;
        next.settings = { ...clone(row.data), ...pick(current, DEVICE_SETTINGS) };
        changed = true;
        continue;
      }
      if (row.type === 'habitLogs') {
        const current = logs.get(row.id);
        if (row.deleted) {
          if (current) { logs.delete(row.id); puts.delete(row.id); deletes.add(row.id); changed = true; }
          continue;
        }
        const data = clone(row.data);
        const rival = [...logs.values()].find(log => log.id !== row.id && log.habitId === data.habitId && log.date === data.date);
        if (rival && rival.id > row.id) continue;
        if (rival) { logs.delete(rival.id); puts.delete(rival.id); deletes.add(rival.id); changed = true; }
        if (!current || hashRecord(current) !== hashRecord(data)) { logs.set(row.id, data); puts.set(row.id, data); deletes.delete(row.id); changed = true; }
        continue;
      }
      if (!COLLECTIONS.includes(row.type)) continue;
      if (!Array.isArray(next[row.type])) next[row.type] = [];
      const list = next[row.type];
      const index = list.findIndex(item => item && item.id === row.id);
      if (row.deleted) {
        if (index >= 0) { list.splice(index, 1); changed = true; }
        continue;
      }
      const deviceFields = DEVICE_FIELDS[row.type] || [];
      const existing = index >= 0 ? list[index] : null;
      if (existing && hashRecord(omit(existing, deviceFields)) === hashRecord(row.data)) continue;
      const record = clone(row.data);
      for (const field of deviceFields) record[field] = existing && own(existing, field) ? existing[field] : [];
      if (index >= 0) list[index] = record;
      else list.push(record);
      changed = true;
    }
    return { state: next, habitLogPuts: [...puts.values()], habitLogDeletes: [...deletes], changed };
  }

  function createClient({ url, anonKey, fetch: fetchImpl = root.fetch ? root.fetch.bind(root) : null, now = () => Date.now(), pageSize = 1000, batchSize = 500 } = {}) {
    const base = String(url || '').replace(/\/+$/, '');

    async function request(path, { method = 'GET', body, token, prefer } = {}) {
      const headers = { apikey: anonKey, Authorization: `Bearer ${token || anonKey}`, 'Content-Type': 'application/json' };
      if (prefer) headers.Prefer = prefer;
      let response;
      try {
        response = await fetchImpl(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (error) {
        throw new SyncError(`${msg('Network unavailable')}: ${error?.message || error}`, 0);
      }
      if (!response.ok) {
        let detail = '';
        try {
          const data = await response.json();
          detail = data?.msg || data?.message || data?.error_description || data?.error || '';
        } catch (_) { /* no body */ }
        throw new SyncError(detail ? `${msg('Server error')}: ${detail}` : msg('Server error'), response.status);
      }
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    const toSession = data => ({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: now() + Number(data.expires_in || 3600) * 1000,
      user: { id: data.user?.id, email: data.user?.email },
    });

    return {
      async requestCode(email) {
        await request('/auth/v1/otp', { method: 'POST', body: { email: String(email || '').trim(), create_user: true } });
      },
      async verifyCode(email, code) {
        return toSession(await request('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: String(email || '').trim(), token: String(code || '').trim() } }));
      },
      async refresh(session) {
        return toSession(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session?.refreshToken } }));
      },
      async ensureSession(session) {
        if (!session?.accessToken) throw new SyncError(msg('Not signed in'), 401);
        if (session.expiresAt - 60000 > now()) return session;
        try { return await this.refresh(session); } catch (error) {
          // A rejected refresh token means the sign-in is over; network and server failures stay retryable.
          if ([400, 401, 403].includes(error?.status)) throw new SyncError(msg('Session expired'), 401);
          throw error;
        }
      },
      async signOut(session) {
        try { await request('/auth/v1/logout', { method: 'POST', token: session?.accessToken }); } catch (_) { /* signing out locally is enough */ }
      },
      async deleteAccount(session) {
        await request('/rest/v1/rpc/delete_my_account', { method: 'POST', token: session.accessToken, body: {} });
      },
      async push(session, records) {
        for (let start = 0; start < records.length; start += batchSize) {
          await request('/rest/v1/records?on_conflict=user_id,type,id', {
            method: 'POST', token: session.accessToken, prefer: 'resolution=merge-duplicates,return=minimal',
            body: records.slice(start, start + batchSize).map(record => ({ user_id: session.user.id, type: record.type, id: record.id, data: record.deleted ? null : record.data, deleted: Boolean(record.deleted) })),
          });
        }
      },
      async pull(session, since) {
        const rows = [];
        for (let offset = 0; ; offset += pageSize) {
          const params = new URLSearchParams({ select: 'type,id,data,deleted,updated_at', order: 'updated_at.asc,type.asc,id.asc', limit: String(pageSize), offset: String(offset) });
          if (since) params.set('updated_at', `gt.${since}`);
          const page = (await request(`/rest/v1/records?${params}`, { token: session?.accessToken })) || [];
          rows.push(...page);
          if (page.length < pageSize) return rows;
        }
      },
    };
  }

  const latest = (rows, fallback) => rows.reduce((max, row) => (!max || Date.parse(row.updated_at) > Date.parse(max) ? row.updated_at : max), fallback || null);

  // One sync round: push local changes, then pull and apply what changed elsewhere.
  // `meta` is the device-local sync record ({ session, shadow, cursor, lastSyncAt, lastError }) and is updated in place.
  // The first sync on a device returns { status: 'choose' } when both sides have data and no `mode` is given.
  async function syncOnce({ client, meta, readLocal, writeLocal, mode = null, now = () => Date.now() }) {
    try {
      meta.session = await client.ensureSession(meta.session);
      const session = meta.session;
      const local = await readLocal();
      const records = collectRecords(local.state, local.habitLogs);
      let shadow = meta.shadow ? { ...meta.shadow } : null;
      let cursor = meta.cursor || null;

      if (!shadow) {
        const remoteRows = await client.pull(session, null);
        const live = remoteRows.filter(row => !row.deleted);
        const remoteHasData = live.some(row => row.type !== 'settings');
        const localHasData = [...records.values()].some(record => record.type !== 'settings');
        const chosen = mode || (remoteHasData && localHasData ? null : localHasData ? 'merge' : 'server');
        if (!chosen) return { status: 'choose' };
        if (chosen === 'server') {
          const liveKeys = new Set(live.map(row => keyOf(row.type, row.id)));
          const localOnly = [...records.values()].filter(record => record.type !== 'settings' && !liveKeys.has(keyOf(record.type, record.id)))
            .map(record => ({ type: record.type, id: record.id, data: null, deleted: true, updated_at: '' }));
          const result = applyRemote(local.state, local.habitLogs, [...localOnly, ...live]);
          if (result.changed) await writeLocal(result);
          meta.shadow = Object.fromEntries(live.map(row => [keyOf(row.type, row.id), hashRecord(row.data)]));
          meta.cursor = latest(remoteRows, null);
          meta.lastSyncAt = new Date(now()).toISOString();
          meta.lastError = null;
          return { status: 'ok', pushed: 0, pulled: live.length };
        }
        if (chosen === 'device') {
          shadow = Object.fromEntries(live.map(row => [keyOf(row.type, row.id), hashRecord(row.data)]));
          cursor = latest(remoteRows, null);
        } else {
          // Merge: a record on both sides keeps its newer `updatedAt`; otherwise this device's version wins.
          shadow = {};
          for (const row of live) {
            const mine = records.get(keyOf(row.type, row.id));
            if (mine && Date.parse(row.data?.updatedAt) > Date.parse(mine.data?.updatedAt)) shadow[keyOf(row.type, row.id)] = hashRecord(mine.data);
          }
          cursor = null;
        }
      }

      const diff = diffRecords(records, shadow);
      const outgoing = [...diff.upserts, ...diff.deletes.map(record => ({ ...record, deleted: true }))];
      if (outgoing.length) await client.push(session, outgoing);
      for (const record of diff.upserts) shadow[keyOf(record.type, record.id)] = hashRecord(record.data);
      for (const record of diff.deletes) delete shadow[keyOf(record.type, record.id)];
      meta.shadow = { ...shadow };
      meta.cursor = cursor;

      const since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null;
      const pulled = await client.pull(session, since);
      const current = await readLocal();
      const currentRecords = collectRecords(current.state, current.habitLogs);
      const incoming = pulled.filter(row => {
        const key = keyOf(row.type, row.id);
        return row.deleted ? own(shadow, key) || currentRecords.has(key) : shadow[key] !== hashRecord(row.data);
      });
      if (incoming.length) {
        const result = applyRemote(current.state, current.habitLogs, incoming);
        if (result.changed) await writeLocal(result);
      }
      for (const row of incoming) {
        const key = keyOf(row.type, row.id);
        if (row.deleted) delete shadow[key];
        else shadow[key] = hashRecord(row.data);
      }
      meta.shadow = shadow;
      meta.cursor = latest(pulled, cursor);
      meta.lastSyncAt = new Date(now()).toISOString();
      meta.lastError = null;
      return { status: 'ok', pushed: outgoing.length, pulled: incoming.length };
    } catch (error) {
      meta.lastError = error?.message || String(error);
      return { status: 'error', error: meta.lastError, code: error?.status || 0 };
    }
  }

  // Sync is offered only when the deployment has a project URL and public key (js/sync-config.js).
  function isConfigured(config) {
    return Boolean(config && /^https:\/\/[^\s/]+/.test(config.url || '') && typeof config.anonKey === 'string' && config.anonKey.length > 20);
  }

  return Object.freeze({ COLLECTIONS, DEVICE_SETTINGS, SyncError, collectRecords, hashRecord, diffRecords, applyRemote, createClient, syncOnce, isConfigured });
});
