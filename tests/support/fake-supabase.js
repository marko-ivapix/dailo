// In-memory stand-in for the Supabase endpoints Dailo sync uses (Auth OTP + PostgREST `records`).
// It enforces the same rules the SQL migration does: rows belong to the token's user (RLS),
// the server clock sets `updated_at`, and replaced versions go to `history`.
'use strict';

function createFakeSupabase({ url = 'https://fake.supabase.co', anonKey = 'anon-key', code = '123456' } = {}) {
  const users = new Map(); // email -> { id, email }
  const tokens = new Map(); // access token -> { userId, expiresAt }
  const refreshTokens = new Map(); // refresh token -> userId
  const pendingCodes = new Map(); // email -> code
  const rows = new Map(); // `${userId}|${type}|${id}` -> row
  const history = [];
  const sentCodes = [];
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
    return { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, token_type: 'bearer', user: { id: user.id, email: user.email } };
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

    if (path === '/auth/v1/otp' && method === 'POST') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.email || '')) return json(400, { msg: 'Unable to validate email address: invalid format' });
      if (!users.has(body.email)) users.set(body.email, { id: `user-${users.size + 1}`, email: body.email });
      pendingCodes.set(body.email, code);
      sentCodes.push({ email: body.email, code });
      return json(200, {});
    }
    if (path === '/auth/v1/verify' && method === 'POST') {
      if (body?.type !== 'email' || pendingCodes.get(body.email) !== body.token) return json(403, { msg: 'Token has expired or is invalid' });
      pendingCodes.delete(body.email);
      return json(200, issueSession(users.get(body.email)));
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
    url, anonKey, fetch: handle, sentCodes, history,
    rowsFor: email => { const user = users.get(email); return user ? [...rows.values()].filter(row => row.user_id === user.id) : []; },
    hasUser: email => users.has(email),
    advance: ms => { clock += ms; },
    now: () => clock,
  };
}

module.exports = { createFakeSupabase };
