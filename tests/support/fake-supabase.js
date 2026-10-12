// In-memory stand-in for the Supabase endpoints Dailo sync uses (Auth: OTP, password, recovery, PKCE; PostgREST `records`).
// It enforces the same rules the SQL migration does: rows belong to the token's user (RLS),
// the server clock sets `updated_at`, and replaced versions go to `history`.
'use strict';
const nodeCrypto = require('node:crypto');

function createFakeSupabase({ url = 'https://fake.supabase.co', anonKey = 'anon-key', code = '123456', autoconfirm = false, providers = { google: true, apple: false } } = {}) {
  const users = new Map(); // email -> { id, email, password, confirmed }
  const tokens = new Map(); // access token -> { userId, expiresAt }
  const refreshTokens = new Map(); // refresh token -> userId
  const pendingCodes = new Map(); // email -> code (sign-in or sign-up confirmation)
  const recoveryCodes = new Map(); // email -> code
  const authCodes = new Map(); // PKCE auth code -> { challenge, email }
  const rows = new Map(); // `${userId}|${type}|${id}` -> row
  const history = [];
  const sentCodes = [];
  const mail = []; // { email, kind: 'otp' | 'signup' | 'recovery' }
  let clock = Date.parse('2026-10-08T10:00:00.000Z');
  let tokenCounter = 0;
  const tick = () => new Date(clock += 7).toISOString();
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

  function issueSession(user, expiresIn = 3600) {
    tokenCounter += 1;
    const accessToken = `at-${user.id}-${tokenCounter}`;
    const refreshToken = `rt-${user.id}-${tokenCounter}`;
    tokens.set(accessToken, { userId: user.id, expiresAt: clock + expiresIn * 1000 });
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
    const body = init.body ? JSON.parse(init.body) : null;
    const method = init.method || 'GET';
    const path = target.pathname;

    const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
    const addUser = (email, fields) => { const user = { id: `user-${users.size + 1}`, email, password: null, confirmed: false, ...fields }; users.set(email, user); return user; };
    const sendCode = (email, kind) => { (kind === 'recovery' ? recoveryCodes : pendingCodes).set(email, code); sentCodes.push({ email, code }); mail.push({ email, kind }); };
    if (path === '/auth/v1/settings' && method === 'GET') {
      return json(200, { external: { email: true, google: Boolean(providers.google), apple: Boolean(providers.apple) }, mailer_autoconfirm: autoconfirm });
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
    if (path === '/auth/v1/user' && method === 'PUT') {
      const who = userFor(headers);
      if (who.error) return who.error;
      if (String(body?.password || '').length < 6) return json(422, { msg: 'Password should be at least 6 characters.', error_code: 'weak_password' });
      const user = [...users.values()].find(item => item.id === who.userId);
      user.password = body.password;
      return json(200, { id: user.id, email: user.email });
    }
    if (path === '/auth/v1/token' && target.searchParams.get('grant_type') === 'refresh_token' && method === 'POST') {
      const userId = refreshTokens.get(body?.refresh_token);
      if (!userId) return json(400, { msg: 'Invalid Refresh Token' });
      refreshTokens.delete(body.refresh_token);
      return json(200, issueSession([...users.values()].find(user => user.id === userId)));
    }
    if (path === '/auth/v1/logout' && method === 'POST') {
      const auth = (headers.Authorization || '').replace(/^Bearer /, '');
      tokens.delete(auth);
      return json(204, null);
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
    url, anonKey, fetch: handle, sentCodes, mail, history,
    // What a provider (Google, Apple) does after the user agrees: it hands the app an auth code for this challenge.
    providerRedirect({ provider, codeChallenge, email }) {
      if (!providers[provider]) throw new Error(`${provider} is off`);
      const authCode = `ac-${authCodes.size + 1}-${provider}`;
      authCodes.set(authCode, { challenge: codeChallenge, email });
      return authCode;
    },
    passwordOf: email => users.get(email)?.password ?? null,
    metadataOf: email => users.get(email)?.metadata ?? null,
    isConfirmed: email => Boolean(users.get(email)?.confirmed),
    rowsFor: email => { const user = users.get(email); return user ? [...rows.values()].filter(row => row.user_id === user.id) : []; },
    hasUser: email => users.has(email),
    advance: ms => { clock += ms; },
    now: () => clock,
  };
}

module.exports = { createFakeSupabase };
