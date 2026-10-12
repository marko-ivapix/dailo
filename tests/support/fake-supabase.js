// In-memory stand-in for the Supabase endpoints Dailo sync uses (Auth: OTP, password, recovery, PKCE; PostgREST `records`).
// It enforces the same rules the SQL migration does: rows belong to the token's user (RLS),
// the server clock sets `updated_at`, and replaced versions go to `history`.
'use strict';
const nodeCrypto = require('node:crypto');

function createFakeSupabase({ url = 'https://fake.supabase.co', anonKey = 'anon-key', code = '123456', autoconfirm = false, providers = { google: true, apple: false }, tables = true, reauthentication = false, requireCurrentPassword = false, secureEmailChange = true, files = true, maxFileBytes = 10 * 1024 * 1024, journalPurge = true } = {}) {
  const users = new Map(); // email -> { id, email, password, confirmed }
  const tokens = new Map(); // access token -> { userId, expiresAt }
  const refreshTokens = new Map(); // refresh token -> userId
  const pendingCodes = new Map(); // email -> code (sign-in or sign-up confirmation)
  const recoveryCodes = new Map(); // email -> code
  const authCodes = new Map(); // PKCE auth code -> { challenge, email }
  const reauthCodes = new Map(); // user id -> code
  const emailChanges = new Map(); // user id -> { email, current: code | null, next: code | null }
  const rows = new Map(); // `${userId}|${type}|${id}` -> row
  const history = [];
  const sentCodes = [];
  const mail = []; // { email, kind: 'otp' | 'signup' | 'recovery' }
  const logoutScopes = [];
  const objects = new Map(); // Storage path in the attachments bucket -> { blob, type }
  let downloadFailures = 0;
  let clock = Date.parse('2026-10-08T10:00:00.000Z');
  let tokenCounter = 0;
  const tick = () => new Date(clock += 7).toISOString();
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

  function issueSession(user, expiresIn = 3600) {
    tokenCounter += 1;
    const accessToken = `at-${user.id}-${tokenCounter}`;
    const refreshToken = `rt-${user.id}-${tokenCounter}`;
    tokens.set(accessToken, { userId: user.id, expiresAt: clock + expiresIn * 1000, refreshToken });
    refreshTokens.set(refreshToken, user.id);
    return { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, token_type: 'bearer', user: { id: user.id, email: user.email, user_metadata: user.metadata || {} } };
  }

  function userFor(headers) {
    const auth = headers.Authorization || headers.authorization || '';
    const token = auth.replace(/^Bearer /, '');
    const entry = tokens.get(token);
    if (!entry) return { error: json(401, { message: 'Invalid JWT' }) };
    if (entry.expiresAt <= clock) return { error: json(401, { message: 'JWT expired' }) };
    return { userId: entry.userId };
  }

  async function handle(input, init = {}) {
    const target = new URL(input);
    const headers = init.headers || {};
    if (target.origin !== new URL(url).origin) throw new TypeError('Failed to fetch');
    if (headers.apikey !== anonKey) return json(401, { message: 'Invalid API key' });
    const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : null;
    const method = init.method || 'GET';
    const path = target.pathname;

    const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
    const addUser = (email, fields) => { const user = { id: `user-${users.size + 1}`, email, password: null, confirmed: false, ...fields }; users.set(email, user); return user; };
    const sendCode = (email, kind) => { (kind === 'recovery' ? recoveryCodes : pendingCodes).set(email, code); sentCodes.push({ email, code }); mail.push({ email, kind }); };
    if (path === '/auth/v1/settings' && method === 'GET') {
      return json(200, { external: { email: true, google: Boolean(providers.google), apple: Boolean(providers.apple) }, disable_signup: false, mailer_autoconfirm: autoconfirm });
    }
    if (path === '/auth/v1/otp' && method === 'POST') {
      if (!validEmail(body?.email)) return json(400, { msg: 'Unable to validate email address: invalid format' });
      if (!users.has(body.email)) addUser(body.email);
      sendCode(body.email, 'otp');
      return json(200, {});
    }
    if (path === '/auth/v1/signup' && method === 'POST') {
      if (!validEmail(body?.email)) return json(400, { msg: 'Unable to validate email address: invalid format', error_code: 'validation_failed' });
      if (String(body.password || '').length < 6) return json(422, { msg: 'Password should be at least 6 characters.', error_code: 'weak_password' });
      const existing = users.get(body.email);
      // Like Supabase with e-mail confirmation on: a known address gets a stand-in user without identities.
      if (existing?.confirmed) return autoconfirm ? json(422, { msg: 'User already registered', error_code: 'user_already_exists' }) : json(200, { id: 'stand-in', email: body.email, identities: [] });
      const user = existing ? Object.assign(existing, { password: body.password, metadata: body.data || {} }) : addUser(body.email, { password: body.password, metadata: body.data || {} });
      if (autoconfirm) { user.confirmed = true; return json(200, issueSession(user)); }
      sendCode(body.email, 'signup');
      return json(200, { id: user.id, email: user.email, identities: [{ provider: 'email' }], confirmation_sent_at: new Date(clock).toISOString() });
    }
    if (path === '/auth/v1/resend' && method === 'POST') {
      if (body?.type === 'signup' && users.has(body.email) && !users.get(body.email).confirmed) sendCode(body.email, 'signup');
      return json(200, {});
    }
    if (path === '/auth/v1/recover' && method === 'POST') {
      if (!validEmail(body?.email)) return json(400, { msg: 'Unable to validate email address: invalid format' });
      if (users.has(body.email)) sendCode(body.email, 'recovery');
      return json(200, {});
    }
    // A new address is confirmed by a code sent to it and, with secure e-mail change, by one sent to the current address.
    if (path === '/auth/v1/verify' && method === 'POST' && body?.type === 'email_change') {
      const user = [...users.values()].find(item => { const change = emailChanges.get(item.id); return change && ((change.email === body.email && change.next === body.token) || (item.email === body.email && change.current === body.token)); });
      if (!user) return json(403, { msg: 'Token has expired or is invalid', error_code: 'otp_expired' });
      const change = emailChanges.get(user.id);
      if (change.email === body.email && change.next === body.token) change.next = null; else change.current = null;
      if (change.next || change.current) return json(200, { msg: 'Confirmation link accepted. Please proceed to confirm link sent to the other email', code: 200 });
      emailChanges.delete(user.id);
      users.delete(user.email);
      user.email = change.email;
      users.set(user.email, user);
      return json(200, issueSession(user));
    }
    if (path === '/auth/v1/verify' && method === 'POST') {
      const store = body?.type === 'recovery' ? recoveryCodes : body?.type === 'email' ? pendingCodes : null;
      if (!store || store.get(body.email) !== body.token) return json(403, { msg: 'Token has expired or is invalid', error_code: 'otp_expired' });
      store.delete(body.email);
      const user = users.get(body.email);
      user.confirmed = true;
      return json(200, issueSession(user));
    }
    if (path === '/auth/v1/token' && target.searchParams.get('grant_type') === 'password' && method === 'POST') {
      const user = users.get(body?.email);
      if (!user || !user.password || user.password !== body.password) return json(400, { msg: 'Invalid login credentials', error_code: 'invalid_credentials' });
      if (!user.confirmed) return json(400, { msg: 'Email not confirmed', error_code: 'email_not_confirmed' });
      return json(200, issueSession(user));
    }
    if (path === '/auth/v1/token' && target.searchParams.get('grant_type') === 'pkce' && method === 'POST') {
      const pending = authCodes.get(body?.auth_code);
      const challenge = nodeCrypto.createHash('sha256').update(String(body?.code_verifier || '')).digest('base64url');
      if (!pending || pending.challenge !== challenge) return json(400, { msg: 'invalid flow state, no valid flow state found', error_code: 'flow_state_not_found' });
      authCodes.delete(body.auth_code);
      const user = users.get(pending.email) || addUser(pending.email, { confirmed: true });
      return json(200, issueSession(user));
    }
    if (path === '/auth/v1/reauthenticate' && method === 'GET') {
      const who = userFor(headers);
      if (who.error) return who.error;
      const user = [...users.values()].find(item => item.id === who.userId);
      reauthCodes.set(user.id, code);
      mail.push({ email: user.email, kind: 'reauthentication' });
      return json(200, {});
    }
    if (path === '/auth/v1/user' && method === 'PUT') {
      const who = userFor(headers);
      if (who.error) return who.error;
      const user = [...users.values()].find(item => item.id === who.userId);
      if (body?.email !== undefined) {
        if (!validEmail(body.email)) return json(400, { msg: 'Unable to validate email address: invalid format', error_code: 'email_address_invalid' });
        if (users.has(body.email) && users.get(body.email) !== user) return json(422, { msg: 'A user with this email address has already been registered', error_code: 'email_exists' });
        const secure = secureEmailChange && Boolean(user.email);
        emailChanges.set(user.id, { email: body.email, next: code, current: secure ? code : null });
        mail.push({ email: body.email, kind: 'email_change_new' });
        if (secure) mail.push({ email: user.email, kind: 'email_change_current' });
        return json(200, { id: user.id, email: user.email, new_email: body.email });
      }
      if (String(body?.password || '').length < 6) return json(422, { msg: 'Password should be at least 6 characters.', error_code: 'weak_password' });
      if (reauthentication) {
        if (!body.nonce) return json(400, { msg: 'Password update requires reauthentication', error_code: 'reauthentication_needed' });
        if (reauthCodes.get(user.id) !== body.nonce) return json(400, { msg: 'Requested nonce is invalid', error_code: 'reauthentication_not_valid' });
        reauthCodes.delete(user.id);
      }
      if (requireCurrentPassword && user.password) {
        if (!body.current_password) return json(400, { msg: 'Current password required when setting new password.', error_code: 'current_password_required' });
        if (body.current_password !== user.password) return json(400, { msg: 'Current password required when setting new password.', error_code: 'current_password_invalid' });
      }
      user.password = body.password;
      // Like Supabase Auth: a new password ends every other session of the user.
      const auth = (headers.Authorization || '').replace(/^Bearer /, '');
      for (const [token, item] of tokens) if (item.userId === user.id && token !== auth) { tokens.delete(token); refreshTokens.delete(item.refreshToken); }
      const own = tokens.get(auth);
      for (const [token, userId] of refreshTokens) if (userId === user.id && token !== own?.refreshToken) refreshTokens.delete(token);
      return json(200, { id: user.id, email: user.email });
    }
    if (path === '/auth/v1/token' && target.searchParams.get('grant_type') === 'refresh_token' && method === 'POST') {
      const userId = refreshTokens.get(body?.refresh_token);
      if (!userId) return json(400, { msg: 'Invalid Refresh Token' });
      refreshTokens.delete(body.refresh_token);
      return json(200, issueSession([...users.values()].find(user => user.id === userId)));
    }
    // Like Supabase Auth: without ?scope= a sign-out ends every session of the user ("global"); "local" ends only this one.
    if (path === '/auth/v1/logout' && method === 'POST') {
      const auth = (headers.Authorization || '').replace(/^Bearer /, '');
      const entry = tokens.get(auth);
      const scope = target.searchParams.get('scope') || 'global';
      logoutScopes.push(scope);
      if (entry && scope === 'global') {
        for (const [token, item] of tokens) if (item.userId === entry.userId) tokens.delete(token);
        for (const [token, userId] of refreshTokens) if (userId === entry.userId) refreshTokens.delete(token);
      } else if (entry) { tokens.delete(auth); refreshTokens.delete(entry.refreshToken); }
      return json(204, null);
    }
    // Supabase Storage, bucket "attachments" (0003_attachments.sql): each user reads and writes only "<user id>/…".
    if (path.startsWith('/storage/v1/')) {
      const who = userFor(headers);
      if (who.error) return who.error;
      if (!files) return json(400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
      const mine = objectPath => objectPath.split('/')[0] === who.userId;
      if (path === '/storage/v1/object/list/attachments' && method === 'POST') {
        const prefix = `${String(body?.prefix || '').replace(/\/+$/, '')}/`;
        return json(200, [...objects.keys()].filter(key => mine(key) && key.startsWith(prefix)).sort().slice(Number(body?.offset || 0), Number(body?.offset || 0) + Number(body?.limit || 100)).map(key => ({ name: key.slice(prefix.length) })));
      }
      if (path === '/storage/v1/object/attachments' && method === 'DELETE') {
        for (const key of body?.prefixes || []) if (mine(key)) objects.delete(key);
        return json(200, []);
      }
      const upload = /^\/storage\/v1\/object\/attachments\/(.+)$/.exec(path);
      if (upload && ['POST', 'PUT'].includes(method)) {
        const key = decodeURIComponent(upload[1]);
        if (!mine(key)) return json(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        if (init.body.size > maxFileBytes) return json(413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
        objects.set(key, { blob: init.body, type: headers['Content-Type'] });
        return json(200, { Key: `attachments/${key}` });
      }
      const download = /^\/storage\/v1\/object\/authenticated\/attachments\/(.+)$/.exec(path);
      if (download && method === 'GET') {
        const key = decodeURIComponent(download[1]);
        if (!mine(key) || !objects.has(key)) return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        if (downloadFailures > 0) { downloadFailures -= 1; return json(500, { message: 'download failed' }); }
        const blob = objects.get(key).blob;
        return { ok: true, status: 200, blob: async () => blob, json: async () => ({}), text: async () => '' };
      }
      return json(400, { statusCode: '404', error: 'not_found', message: `No route ${method} ${path}` });
    }
    // Before 0001_sync.sql runs, PostgREST knows neither the table nor the function.
    if (!tables && path.startsWith('/rest/v1/')) return json(404, { code: 'PGRST205', message: "Could not find the table 'public.records' in the schema cache" });
    // R51: 0005_journal_history.sql deletes the caller's journal versions from the history.
    if (path === '/rest/v1/rpc/purge_journal_history' && method === 'POST') {
      if (!journalPurge) return json(404, { code: 'PGRST202', message: 'Could not find the function public.purge_journal_history without parameters in the schema cache' });
      const who = userFor(headers);
      if (who.error) return who.error;
      const before = history.length;
      for (let index = history.length - 1; index >= 0; index -= 1) if (history[index].user_id === who.userId && history[index].type === 'journal') history.splice(index, 1);
      return json(200, before - history.length);
    }
    if (path === '/rest/v1/rpc/delete_my_account' && method === 'POST') {
      const who = userFor(headers);
      if (who.error) return who.error;
      for (const key of [...rows.keys()]) if (key.startsWith(`${who.userId}|`)) rows.delete(key);
      for (const [email, user] of users) if (user.id === who.userId) users.delete(email);
      for (const [token, entry] of tokens) if (entry.userId === who.userId) tokens.delete(token);
      return json(204, null);
    }
    if (path === '/rest/v1/records') {
      const who = userFor(headers);
      if (who.error) return who.error;
      if (method === 'POST') {
        if (target.searchParams.get('on_conflict') !== 'user_id,type,id' || !/resolution=merge-duplicates/.test(headers.Prefer || '')) return json(409, { message: 'duplicate key value violates unique constraint' });
        for (const row of body) {
          if (row.type === 'attachments' && !files) return json(400, { code: '23514', message: 'new row for relation "records" violates check constraint "records_type_check"' });
          if (row.user_id !== who.userId) return json(403, { message: 'new row violates row-level security policy for table "records"' });
          if (row.deleted ? row.data !== null : row.data == null) return json(400, { message: 'violates check constraint' });
        }
        for (const row of body) {
          const key = `${who.userId}|${row.type}|${row.id}`;
          const previous = rows.get(key);
          if (previous && (JSON.stringify(previous.data) !== JSON.stringify(row.data) || previous.deleted !== row.deleted)) history.push({ ...previous });
          rows.set(key, { user_id: who.userId, type: row.type, id: row.id, data: row.data, deleted: Boolean(row.deleted), updated_at: tick() });
        }
        return json(201, null);
      }
      if (method === 'GET') {
        let list = [...rows.values()].filter(row => row.user_id === who.userId);
        const since = target.searchParams.get('updated_at');
        if (since) {
          const [op, value] = since.split(/\.(.+)/);
          list = list.filter(row => (op === 'gt' ? Date.parse(row.updated_at) > Date.parse(value) : Date.parse(row.updated_at) >= Date.parse(value)));
        }
        if (target.searchParams.get('deleted') === 'eq.false') list = list.filter(row => !row.deleted);
        list.sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
        const offset = Number(target.searchParams.get('offset') || 0);
        const limit = Number(target.searchParams.get('limit') || 1000);
        return json(200, list.slice(offset, offset + limit).map(({ user_id, ...row }) => row));
      }
    }
    return json(404, { message: `No route ${method} ${path}` });
  }

  return {
    url, anonKey, fetch: handle, sentCodes, mail, logoutScopes, history,
    // What a provider (Google, Apple) does after the user agrees: it hands the app an auth code for this challenge.
    providerRedirect({ provider, codeChallenge, email }) {
      if (!providers[provider]) throw new Error(`${provider} is off`);
      const authCode = `ac-${authCodes.size + 1}-${provider}`;
      authCodes.set(authCode, { challenge: codeChallenge, email });
      return authCode;
    },
    passwordOf: email => users.get(email)?.password ?? null,
    filesOf: userId => [...objects.keys()].filter(key => key.startsWith(`${userId}/`)).sort(),
    fileText: key => objects.get(key)?.blob.text(),
    failDownloads: count => { downloadFailures = count; },
    metadataOf: email => users.get(email)?.metadata ?? null,
    isConfirmed: email => Boolean(users.get(email)?.confirmed),
    rowsFor: email => { const user = users.get(email); return user ? [...rows.values()].filter(row => row.user_id === user.id) : []; },
    hasUser: email => users.has(email),
    advance: ms => { clock += ms; },
    now: () => clock,
  };
}

module.exports = { createFakeSupabase };
