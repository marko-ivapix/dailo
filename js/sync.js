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

  const COLLECTIONS = ['tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews', 'journal'];
  // Per-device settings and fields that never leave the device (attachments sync in V2.1).
  const DEVICE_SETTINGS = ['backupStatus', 'compactDensity'];
  // Reminder fired markers are device-local too (audit R-3): a reminder firing on one device must not rewrite the
  // record for the others. Shadow format 2 hashes records without them; format 1 (V2.0-a) hashed them in.
  const DEVICE_FIELDS = { tasks: ['attachmentIds', 'reminderFiredAt'], notes: ['attachmentIds'], resources: ['attachmentIds'], goals: ['reminderFiredMoments'], habits: ['reminderFiredMoments'] };
  const LEGACY_DEVICE_FIELDS = { tasks: ['attachmentIds'], notes: ['attachmentIds'], resources: ['attachmentIds'] };
  const DEVICE_DEFAULTS = { attachmentIds: [], reminderFiredAt: null, reminderFiredMoments: [] };
  const SHADOW_FORMAT = 2;
  const PULL_OVERLAP_MS = 5000;
  // Record types this build understands. Rows of any other type come from a newer app version: they are
  // left alone on the server and never enter the shadow, so this build can never push deletions for them.
  const KNOWN_TYPES = new Set([...COLLECTIONS, 'settings', 'habitLogs', 'attachments']);
  const knownRow = row => KNOWN_TYPES.has(row?.type);

  class SyncError extends Error {
    constructor(message, status = 0, reason = '') {
      super(message);
      this.name = 'SyncError';
      this.status = status;
      // Supabase's error_code (R40), e.g. invalid_credentials, email_not_confirmed or user_already_exists.
      this.reason = reason;
    }
  }

  // R40: a new password has at least 8 characters with a digit and a letter (any alphabet).
  function passwordProblem(password) {
    const value = String(password || '');
    return value.length >= 8 && /\d/.test(value) && /\p{L}/u.test(value) ? '' : msg('The password needs at least 8 characters, with a digit and a letter.');
  }

  // R40: Google and Apple sign-in use PKCE (RFC 7636). The verifier stays on the device; the provider sees only
  // its S256 challenge.
  const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  function createCodeVerifier(cryptoImpl = root.crypto) {
    return Array.from(cryptoImpl.getRandomValues(new Uint8Array(64)), byte => VERIFIER_CHARS[byte % VERIFIER_CHARS.length]).join('');
  }
  async function codeChallenge(verifier, cryptoImpl = root.crypto) {
    const digest = new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    return root.btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // R42: Supabase's answers as sentences the app translates. Auth sends error_code (older servers error and
  // error_description), PostgREST a Postgres or PGRST code; anything else keeps "Server error: <detail>".
  const TOO_MANY = msg('Too many requests. Wait a minute and try again.');
  const ACCOUNT_EXISTS = msg('An account with this e-mail address already exists. Sign in.');
  const METHOD_OFF = msg('This sign-in method is turned off on the server.');
  const NO_BUCKET = msg('The server has no place for attachments yet. Run 0003_attachments.sql in Supabase.');
  const TOO_LARGE = msg('The file is larger than the server allows.');
  const MISSING_TABLES = msg('The sync tables are missing on the server. Run 0001_sync.sql and 0002_journal.sql in Supabase.');
  const AUTH_MESSAGES = Object.freeze({
    invalid_credentials: msg('Wrong e-mail address or password.'),
    email_not_confirmed: msg('The e-mail address is not confirmed yet.'),
    user_already_exists: ACCOUNT_EXISTS,
    email_exists: ACCOUNT_EXISTS,
    weak_password: msg('The password is too weak for the server. Use a longer one with digits and letters.'),
    over_email_send_rate_limit: TOO_MANY,
    over_request_rate_limit: TOO_MANY,
    otp_expired: msg('The code is wrong or has expired.'),
    reauthentication_not_valid: msg('The code is wrong or has expired.'),
    current_password_invalid: msg('The current password is not right.'),
    email_address_not_authorized: msg('The server cannot send e-mail to this address yet: its SMTP is not set up.'),
    signup_disabled: msg('Registration is turned off on the server.'),
    email_address_invalid: msg('Enter a valid e-mail address.'),
    same_password: msg('The new password must differ from the old one.'),
    provider_disabled: METHOD_OFF,
    email_provider_disabled: METHOD_OFF,
  });
  function serverMessage(status, reason, detail) {
    if (AUTH_MESSAGES[reason]) return AUTH_MESSAGES[reason];
    if (/invalid login credentials/i.test(detail)) return AUTH_MESSAGES.invalid_credentials;
    if (/email not confirmed/i.test(detail)) return AUTH_MESSAGES.email_not_confirmed;
    if (status === 429) return TOO_MANY;
    if (/error sending .*email/i.test(detail)) return msg('The server could not send the e-mail. Try again later.');
    if (/email address.*(invalid format|is invalid)/i.test(detail)) return AUTH_MESSAGES.email_address_invalid;
    if (/(invalid|no) api key/i.test(detail)) return msg('The server does not accept the app key.');
    if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(reason)) return MISSING_TABLES;
    if (reason === '23514' && /records_type_check/.test(detail)) return msg('The server does not accept Dnevnik yet. Run 0002_journal.sql in Supabase.');
    if (/bucket not found/i.test(detail)) return NO_BUCKET;
    if (status === 413 || /exceeded the maximum allowed size/i.test(detail)) return TOO_LARGE;
    return detail ? `${msg('Server error')}: ${detail}` : msg('Server error');
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

  // R46 (V2.1): attachments sync as "attachments" records holding the file's metadata, with the file itself in Supabase
  // Storage at attachments/<user id>/<id>. Owners keep attachmentIds device-local; a device links a file when it has
  // downloaded it. Older apps ignore the new record type.
  const FILE_OWNERS = ['task', 'note', 'resource'];
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  function attachmentData(record) {
    return {
      id: record.id, ownerType: record.ownerType || 'task', ownerId: record.ownerId || record.taskId,
      fileName: String(record.fileName || 'attachment'), mimeType: String(record.mimeType || 'application/octet-stream'),
      size: Number(record.size ?? record.blob?.size ?? 0), createdAt: record.createdAt || null, updatedAt: record.updatedAt || null,
    };
  }
  // A pulled record must name a safe Storage path, a known owner and a size the app accepts.
  function safeAttachmentData(data) {
    const valid = data && typeof data === 'object' && typeof data.id === 'string' && /^[\w-]{1,120}$/.test(data.id)
      && FILE_OWNERS.includes(data.ownerType) && typeof data.ownerId === 'string' && data.ownerId !== ''
      && typeof data.fileName === 'string' && typeof data.mimeType === 'string'
      && Number.isFinite(data.size) && data.size >= 0 && data.size <= MAX_FILE_BYTES;
    return valid ? data : null;
  }
  // Removes deleted files from their owners' device-local attachmentIds.
  function dropAttachmentIds(state, ids) {
    for (const type of ['tasks', 'notes', 'resources']) {
      for (const item of state?.[type] || []) {
        if (Array.isArray(item?.attachmentIds) && item.attachmentIds.some(id => ids.has(id))) item.attachmentIds = item.attachmentIds.filter(id => !ids.has(id));
      }
    }
  }

  // Everything that syncs, keyed "type/id": collection records, the shared settings, habit logs and (R46) attachments.
  function collectRecords(state, habitLogs = [], deviceFields = DEVICE_FIELDS, attachments = []) {
    const records = new Map();
    for (const type of COLLECTIONS) {
      for (const item of Array.isArray(state?.[type]) ? state[type] : []) {
        if (item && typeof item.id === 'string' && item.id) records.set(keyOf(type, item.id), { type, id: item.id, data: clone(omit(item, deviceFields[type] || [])) });
      }
    }
    if (state?.settings && typeof state.settings === 'object') records.set(keyOf('settings', 'settings'), { type: 'settings', id: 'settings', data: clone(omit(state.settings, DEVICE_SETTINGS)) });
    for (const log of habitLogs || []) if (log && typeof log.id === 'string' && log.id) records.set(keyOf('habitLogs', log.id), { type: 'habitLogs', id: log.id, data: clone(log) });
    for (const file of attachments || []) if (file && typeof file.id === 'string' && file.id) records.set(keyOf('attachments', file.id), { type: 'attachments', id: file.id, data: clone(attachmentData(file)) });
    return records;
  }

  // A pulled row without device-local fields (older clients still send the fired markers).
  const remoteData = row => (COLLECTIONS.includes(row.type) && row.data ? omit(row.data, DEVICE_FIELDS[row.type] || []) : row.data);

  // Shadow format 1 → 2: a record unchanged since the last sync gets its hash without the device-local fields, so
  // the format change pushes nothing and remote deletions still apply.
  function upgradeShadow(shadow, state, habitLogs) {
    const next = { ...shadow };
    const legacy = collectRecords(state, habitLogs, LEGACY_DEVICE_FIELDS);
    for (const [key, record] of collectRecords(state, habitLogs)) {
      const old = legacy.get(key);
      if (old && own(next, key) && next[key] === hashRecord(old.data)) next[key] = hashRecord(record.data);
    }
    return next;
  }

  // Fingerprint of the synced records except settings. The app stores it when it creates the first-run examples,
  // so it can tell later that nothing of the user's is on this device yet (audit M9).
  function recordFingerprint(state, habitLogs = []) {
    const out = {};
    for (const [key, record] of collectRecords(state, habitLogs)) if (record.type !== 'settings') out[key] = hashRecord(record.data);
    return out;
  }
  function untouchedSample(state, habitLogs, fingerprint) {
    const expected = fingerprint && typeof fingerprint === 'object' ? Object.keys(fingerprint) : [];
    if (!expected.length) return false;
    const count = COLLECTIONS.reduce((total, type) => total + (Array.isArray(state?.[type]) ? state[type].length : 0), 0) + (habitLogs?.length || 0);
    if (count !== expected.length) return false; // cheap: most states differ in size
    const current = recordFingerprint(state, habitLogs);
    return Object.keys(current).length === expected.length && expected.every(key => current[key] === fingerprint[key]);
  }

  function diffRecords(records, shadow = {}, skipTypes = []) {
    const upserts = [];
    const deletes = [];
    for (const [key, record] of records) if (shadow[key] !== hashRecord(record.data)) upserts.push(record);
    for (const key of Object.keys(shadow)) {
      if (records.has(key)) continue;
      const [type, ...rest] = key.split('/');
      if (!KNOWN_TYPES.has(type) || skipTypes.includes(type)) continue;
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
      const data = remoteData(row);
      if (existing && hashRecord(omit(existing, deviceFields)) === hashRecord(data)) continue;
      const record = clone(data);
      for (const field of deviceFields) record[field] = existing && own(existing, field) ? existing[field] : clone(DEVICE_DEFAULTS[field] ?? null);
      if (index >= 0) list[index] = record;
      else list.push(record);
      changed = true;
    }
    return { state: next, habitLogPuts: [...puts.values()], habitLogDeletes: [...deletes], changed };
  }

  function createClient({ url, anonKey, fetch: fetchImpl = root.fetch ? root.fetch.bind(root) : null, now = () => Date.now(), pageSize = 1000, batchSize = 500 } = {}) {
    const base = String(url || '').replace(/\/+$/, '');

    // R46: `raw` sends a file as it is (with its own type), `blob` returns the answer as a file.
    async function request(path, { method = 'GET', body, token, prefer, raw = null, type = '', upsert = false, blob = false } = {}) {
      // The publishable key goes only in `apikey`; it is not a JWT, so Supabase refuses it as a Bearer token.
      const headers = { apikey: anonKey, 'Content-Type': raw ? type || 'application/octet-stream' : 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (prefer) headers.Prefer = prefer;
      if (upsert) headers['x-upsert'] = 'true';
      let response;
      try {
        response = await fetchImpl(`${base}${path}`, { method, headers, body: raw || (body === undefined ? undefined : JSON.stringify(body)) });
      } catch (error) {
        throw new SyncError(msg('Network unavailable'), 0);
      }
      if (!response.ok) {
        let detail = '';
        let reason = '';
        try {
          const data = await response.json();
          detail = data?.msg || data?.message || data?.error_description || data?.error || '';
          reason = String(data?.error_code || (typeof data?.code === 'string' ? data.code : '') || (typeof data?.error === 'string' ? data.error : ''));
        } catch (_) { /* no body */ }
        throw new SyncError(serverMessage(response.status, reason, String(detail)), response.status, reason);
      }
      if (blob) return response.blob();
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    const toSession = data => {
      const name = String(data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || '').trim();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: now() + Number(data.expires_in || 3600) * 1000,
        user: { id: data.user?.id, email: data.user?.email, ...(name ? { name } : {}) },
      };
    };
    const address = email => String(email || '').trim();

    return {
      async requestCode(email) {
        await request('/auth/v1/otp', { method: 'POST', body: { email: String(email || '').trim(), create_user: true } });
      },
      // Also confirms a new account with the code from its e-mail (R40).
      async verifyCode(email, code) {
        return toSession(await request('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: String(email || '').trim(), token: String(code || '').trim() } }));
      },
      // R40: e-mail and password. Sign-up returns a session when the project confirms automatically; otherwise the
      // address gets a code. An address that already has an account gets a stand-in user without identities.
      async signUp(email, password, { fullName = '', termsAcceptedAt = '' } = {}) {
        const data = { ...(String(fullName).trim() ? { full_name: String(fullName).trim() } : {}), ...(termsAcceptedAt ? { terms_accepted_at: termsAcceptedAt } : {}) };
        const result = await request('/auth/v1/signup', { method: 'POST', body: { email: address(email), password: String(password || ''), data } });
        if (result?.access_token) return { session: toSession(result) };
        if (Array.isArray(result?.identities) && !result.identities.length) throw new SyncError(ACCOUNT_EXISTS, 422, 'user_already_exists');
        return { confirm: true };
      },
      async signIn(email, password) {
        return toSession(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: address(email), password: String(password || '') } }));
      },
      async resendSignUp(email) {
        await request('/auth/v1/resend', { method: 'POST', body: { type: 'signup', email: address(email) } });
      },
      async requestPasswordReset(email) {
        await request('/auth/v1/recover', { method: 'POST', body: { email: address(email) } });
      },
      async verifyRecovery(email, code) {
        return toSession(await request('/auth/v1/verify', { method: 'POST', body: { type: 'recovery', email: address(email), token: String(code || '').trim() } }));
      },
      // R43: the server may ask for a code it e-mails (reauthenticate) or for the current password first.
      // A new password ends the account's other sessions.
      async updatePassword(session, password, { nonce = '', currentPassword = '' } = {}) {
        const body = { password: String(password || ''), ...(nonce ? { nonce: String(nonce) } : {}), ...(currentPassword ? { current_password: String(currentPassword) } : {}) };
        await request('/auth/v1/user', { method: 'PUT', token: session?.accessToken, body });
      },
      async reauthenticate(session) {
        await request('/auth/v1/reauthenticate', { token: session?.accessToken });
      },
      // A new address gets a code; with secure e-mail change the current address gets one too, and both confirm.
      async changeEmail(session, email) {
        await request('/auth/v1/user', { method: 'PUT', token: session?.accessToken, body: { email: address(email) } });
      },
      async verifyEmailChange(email, code) {
        const data = await request('/auth/v1/verify', { method: 'POST', body: { type: 'email_change', email: address(email), token: String(code || '').trim() } });
        return data?.access_token ? { session: toSession(data) } : { pending: true };
      },
      // Which providers the project has turned on ({ external: { google, apple, … } }).
      async authSettings() {
        return (await request('/auth/v1/settings')) || {};
      },
      authorizeUrl({ provider, redirectTo, codeChallenge: challenge }) {
        return `${base}/auth/v1/authorize?${new URLSearchParams({ provider, redirect_to: redirectTo, code_challenge: challenge, code_challenge_method: 's256' })}`;
      },
      // R42: what "Proveri server" on Nalog reports. E-mail templates and SMTP are not visible through the public API.
      async checkServer() {
        const result = { key: false, tables: 'unknown', signup: false, confirm: false, google: false, apple: false };
        let settings;
        try { settings = await request('/auth/v1/settings'); } catch (error) { if (error.status === 401) return result; throw error; }
        Object.assign(result, { key: true, signup: !settings?.disable_signup, confirm: !settings?.mailer_autoconfirm, google: Boolean(settings?.external?.google), apple: Boolean(settings?.external?.apple) });
        try { await request('/rest/v1/records?select=id&limit=1'); result.tables = 'ok'; }
        catch (error) { result.tables = error.message === MISSING_TABLES ? 'missing' : [401, 403].includes(error.status) ? 'ok' : 'unknown'; }
        return result;
      },
      async exchangeCode(code, verifier) {
        return toSession(await request('/auth/v1/token?grant_type=pkce', { method: 'POST', body: { auth_code: String(code || ''), code_verifier: String(verifier || '') } }));
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
      // Only this device's session ends; without the scope Supabase signs out every device of the account.
      async signOut(session) {
        try { await request('/auth/v1/logout?scope=local', { method: 'POST', token: session?.accessToken }); } catch (_) { /* signing out locally is enough */ }
      },
      // The account's files go first: SQL may not delete Storage objects, so the function leaves them.
      async deleteAccount(session) {
        if (await this.filesAvailable(session)) {
          const ids = await this.listFiles(session);
          if (ids.length) await this.removeFiles(session, ids);
        }
        await request('/rest/v1/rpc/delete_my_account', { method: 'POST', token: session.accessToken, body: {} });
      },
      // R46: the attachments bucket in Supabase Storage (0003_attachments.sql); each user has the folder "<user id>".
      async filesAvailable(session) {
        try { await request('/storage/v1/object/list/attachments', { method: 'POST', token: session?.accessToken, body: { prefix: session.user.id, limit: 1, offset: 0 } }); return true; }
        catch (error) { if (error?.message === NO_BUCKET) return false; throw error; }
      },
      async listFiles(session) {
        const ids = [];
        for (let offset = 0; ; offset += pageSize) {
          const page = (await request('/storage/v1/object/list/attachments', { method: 'POST', token: session.accessToken, body: { prefix: session.user.id, limit: pageSize, offset } })) || [];
          ids.push(...page.map(item => item.name).filter(Boolean));
          if (page.length < pageSize) return ids;
        }
      },
      async uploadFile(session, id, file, type) {
        await request(`/storage/v1/object/attachments/${encodeURIComponent(session.user.id)}/${encodeURIComponent(id)}`, { method: 'POST', token: session.accessToken, raw: file, type, upsert: true });
      },
      async downloadFile(session, id) {
        return request(`/storage/v1/object/authenticated/attachments/${encodeURIComponent(session.user.id)}/${encodeURIComponent(id)}`, { token: session.accessToken, blob: true });
      },
      async removeFiles(session, ids) {
        for (let start = 0; start < ids.length; start += batchSize) {
          await request('/storage/v1/object/attachments', { method: 'DELETE', token: session.accessToken, body: { prefixes: ids.slice(start, start + batchSize).map(id => `${session.user.id}/${id}`) } });
        }
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
  async function syncOnce({ client, meta, readLocal, writeLocal, files = null, mode = null, now = () => Date.now() }) {
    try {
      meta.session = await client.ensureSession(meta.session);
      const session = meta.session;
      // R46: attachments take part when the app hands over its files and the server has their bucket. A file that
      // arrived as a record but is not downloaded yet waits in `pending` and counts as present, so no deletion goes out.
      const withFiles = Boolean(files) && await client.filesAvailable(session);
      const pending = withFiles ? { ...(meta.pendingFiles || {}) } : {};
      const usable = row => knownRow(row) && (row.type !== 'attachments' || (withFiles && (row.deleted || safeAttachmentData(row.data))));
      const gather = source => collectRecords(source.state, source.habitLogs, DEVICE_FIELDS, withFiles ? [...(source.attachments || []), ...Object.values(pending)] : []);
      const fileDeletes = new Set();
      // Without the bucket the files stay on the device, and Nalog says which migration is missing.
      let fileError = files && !withFiles ? NO_BUCKET : null;
      const takeFileRows = (rows, source) => {
        const localIds = new Set((source.attachments || []).map(file => file.id));
        for (const row of rows) {
          if (row.type !== 'attachments') continue;
          if (row.deleted) { delete pending[row.id]; if (localIds.has(row.id)) fileDeletes.add(row.id); }
          else if (!localIds.has(row.id)) pending[row.id] = clone(row.data);
        }
      };
      const apply = async (source, rows) => {
        takeFileRows(rows, source);
        const result = applyRemote(source.state, source.habitLogs, rows);
        if (fileDeletes.size) dropAttachmentIds(result.state, fileDeletes);
        if (result.changed || fileDeletes.size) await writeLocal({ ...result, fileDeletes: [...fileDeletes] });
      };
      const fetchPending = async () => {
        for (const [id, data] of Object.entries(pending)) {
          try {
            const file = await client.downloadFile(session, id);
            if (await files.store(data, file)) delete pending[id];
          } catch (error) { fileError = fileError || error?.message || String(error); }
        }
      };
      const finishFiles = () => {
        if (withFiles) meta.pendingFiles = pending;
        if (fileError) meta.fileError = fileError;
        else delete meta.fileError;
      };

      const local = await readLocal();
      const records = gather(local);
      let shadow = meta.shadow ? { ...meta.shadow } : null;
      if (shadow && meta.shadowFormat !== SHADOW_FORMAT) shadow = upgradeShadow(shadow, local.state, local.habitLogs);
      let cursor = meta.cursor || null;

      if (!shadow) {
        const remoteRows = await client.pull(session, null);
        const live = remoteRows.filter(row => !row.deleted && usable(row));
        const remoteHasData = live.some(row => row.type !== 'settings');
        const localHasData = [...records.values()].some(record => record.type !== 'settings');
        const chosen = mode || (remoteHasData && localHasData ? null : localHasData ? 'merge' : 'server');
        if (!chosen) return { status: 'choose' };
        if (chosen === 'server') {
          const liveKeys = new Set(live.map(row => keyOf(row.type, row.id)));
          const localOnly = [...records.values()].filter(record => record.type !== 'settings' && !liveKeys.has(keyOf(record.type, record.id)))
            .map(record => ({ type: record.type, id: record.id, data: null, deleted: true, updated_at: '' }));
          await apply(local, [...localOnly, ...live]);
          meta.shadow = Object.fromEntries(live.map(row => [keyOf(row.type, row.id), hashRecord(remoteData(row))]));
          meta.shadowFormat = SHADOW_FORMAT;
          meta.cursor = latest(remoteRows, null);
          if (withFiles) await fetchPending();
          finishFiles();
          meta.lastSyncAt = new Date(now()).toISOString();
          meta.lastError = null;
          return { status: 'ok', pushed: 0, pulled: live.length };
        }
        if (chosen === 'device') {
          shadow = Object.fromEntries(live.map(row => [keyOf(row.type, row.id), hashRecord(remoteData(row))]));
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

      const diff = diffRecords(records, shadow, withFiles ? [] : ['attachments']);
      // A file goes to Storage before its record, so no device sees a record without its file; one that fails waits.
      const sent = [];
      for (const record of diff.upserts) {
        if (record.type === 'attachments') {
          if (pending[record.id]) continue;
          const file = await files.read(record.id);
          if (!file) continue;
          try { await client.uploadFile(session, record.id, file, record.data.mimeType); } catch (error) { fileError = fileError || error?.message || String(error); continue; }
        }
        sent.push(record);
      }
      const outgoing = [...sent, ...diff.deletes.map(record => ({ ...record, deleted: true }))];
      if (outgoing.length) await client.push(session, outgoing);
      const goneFiles = diff.deletes.filter(record => record.type === 'attachments').map(record => record.id);
      if (goneFiles.length) {
        try { await client.removeFiles(session, goneFiles); } catch (_) { /* a leftover file costs space, not data */ }
      }
      for (const record of sent) shadow[keyOf(record.type, record.id)] = hashRecord(record.data);
      for (const record of diff.deletes) delete shadow[keyOf(record.type, record.id)];
      meta.shadow = { ...shadow };
      meta.shadowFormat = SHADOW_FORMAT;
      meta.cursor = cursor;

      const since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null;
      const pulled = await client.pull(session, since);
      const current = await readLocal();
      const currentRecords = gather(current);
      const incoming = pulled.filter(row => {
        if (!usable(row)) return false;
        const key = keyOf(row.type, row.id);
        return row.deleted ? own(shadow, key) || currentRecords.has(key) : shadow[key] !== hashRecord(remoteData(row));
      });
      if (incoming.length) await apply(current, incoming);
      for (const row of incoming) {
        const key = keyOf(row.type, row.id);
        if (row.deleted) delete shadow[key];
        else shadow[key] = hashRecord(remoteData(row));
      }
      meta.shadow = shadow;
      meta.shadowFormat = SHADOW_FORMAT;
      meta.cursor = latest(pulled, cursor);
      if (withFiles) await fetchPending();
      finishFiles();
      meta.lastSyncAt = new Date(now()).toISOString();
      meta.lastError = null;
      return { status: 'ok', pushed: outgoing.length, pulled: incoming.length };
    } catch (error) {
      meta.lastError = error?.message || String(error);
      return { status: 'error', error: meta.lastError, code: error?.status || 0 };
    }
  }

  // R50: Supabase Realtime (Phoenix channels, protocol 1.0.0) tells a signed-in device that a record of its account
  // changed. It only pokes a sync, and the pull does the work, so a missed message costs nothing but time. Row Level
  // Security applies to the channel, which also filters by the account.
  const REALTIME_TOPIC = 'realtime:dailo-records';
  const HEARTBEAT_MS = 25000;
  const RECONNECT_MS = [1000, 2000, 5000, 10000, 30000];
  function createRealtime({ url, key, WebSocket: Socket = root.WebSocket, timers = root, onChange, onStatus } = {}) {
    let socket = null;
    let heartbeat = null;
    let retry = null;
    let attempt = 0;
    let ref = 0;
    let joinRef = null;
    let token = null;
    let current = null;
    let stopped = true;
    let state = 'off';
    const setState = next => { if (state !== next) { state = next; onStatus?.(next); } };
    const nextRef = () => String(++ref);
    const send = message => { if (socket && socket.readyState === (Socket?.OPEN ?? 1)) socket.send(JSON.stringify(message)); };
    function clearTimers() {
      timers.clearInterval(heartbeat); heartbeat = null;
      timers.clearTimeout(retry); retry = null;
    }
    function open() {
      clearTimers();
      if (stopped || !current) return;
      const ws = new Socket(`${String(url).replace(/^http/, 'ws').replace(/\/+$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`);
      socket = ws;
      setState('connecting');
      ws.onopen = () => {
        if (socket !== ws) return;
        joinRef = nextRef();
        token = current.accessToken;
        const changes = [{ event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${current.user.id}` }];
        send({ topic: REALTIME_TOPIC, event: 'phx_join', ref: joinRef, join_ref: joinRef, payload: { config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: changes }, access_token: token } });
        heartbeat = timers.setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() }), HEARTBEAT_MS);
      };
      ws.onmessage = event => {
        if (socket !== ws) return;
        let message;
        try { message = JSON.parse(event.data); } catch (_) { return; }
        if (message?.topic !== REALTIME_TOPIC) return;
        if (message.event === 'phx_reply' && message.ref === joinRef) {
          if (message.payload?.status === 'ok') { attempt = 0; setState('live'); } else ws.close();
        } else if (message.event === 'postgres_changes') onChange?.();
        else if (message.event === 'phx_error' || message.event === 'phx_close') ws.close();
      };
      // A closed socket (network, sleep, a refused join) comes back after a growing pause; onclose follows onerror.
      ws.onerror = () => {};
      ws.onclose = () => {
        if (socket !== ws) return;
        socket = null;
        clearTimers();
        if (stopped) return;
        setState('connecting');
        retry = timers.setTimeout(open, RECONNECT_MS[Math.min(attempt++, RECONNECT_MS.length - 1)]);
      };
    }
    function connect(session) {
      if (!Socket || !url || !key || !session?.accessToken || !session.user?.id) return;
      const sameAccount = current?.user?.id === session.user.id;
      current = session;
      stopped = false;
      if ((socket || retry) && sameAccount) {
        // An access token lasts an hour; the open channel gets the refreshed one instead of reconnecting.
        if (socket && state === 'live' && token && token !== session.accessToken) {
          token = session.accessToken;
          send({ topic: REALTIME_TOPIC, event: 'access_token', ref: nextRef(), payload: { access_token: token } });
        }
        return;
      }
      if (socket) { const old = socket; socket = null; old.close(); }
      attempt = 0;
      open();
    }
    function disconnect() {
      stopped = true;
      current = null;
      token = null;
      clearTimers();
      const old = socket;
      socket = null;
      old?.close();
      setState('off');
    }
    return Object.freeze({ connect, disconnect, status: () => state });
  }

  // Sync is offered only when the deployment has a project URL and public key (js/sync-config.js).
  function isConfigured(config) {
    return Boolean(config && /^https:\/\/[^\s/]+/.test(config.url || '') && typeof config.anonKey === 'string' && config.anonKey.length > 20);
  }

  return Object.freeze({ COLLECTIONS, DEVICE_SETTINGS, SyncError, safeAttachmentData, passwordProblem, createCodeVerifier, codeChallenge, collectRecords, hashRecord, recordFingerprint, untouchedSample, diffRecords, applyRemote, createClient, createRealtime, syncOnce, isConfigured });
});
