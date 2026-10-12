// R50: Supabase Realtime tells a signed-in device that one of its account's records changed, so it syncs at once
// instead of on the next five-minute round. The socket only pokes a sync; the pull itself is unchanged.
// Spec: docs/superpowers/specs/2026-10-12-r50-realtime.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const session = (token = 'jwt-1') => ({ accessToken: token, user: { id: 'user-1' } });

function harness() {
  const sockets = [];
  const timers = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.sent = []; this.readyState = 0; sockets.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code: 1000 }); }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
  }
  FakeSocket.OPEN = 1;
  const clock = {
    setTimeout: (run, ms) => { const timer = { run, ms, repeat: false, live: true }; timers.push(timer); return timer; },
    setInterval: (run, ms) => { const timer = { run, ms, repeat: true, live: true }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.live = false; },
    clearInterval: timer => { if (timer) timer.live = false; },
  };
  const changes = [];
  const statuses = [];
  const live = Sync.createRealtime({ url: 'https://abc.supabase.co', key: 'sb_publishable_key', WebSocket: FakeSocket, timers: clock, onChange: () => changes.push('change'), onStatus: status => statuses.push(status) });
  const pending = ms => timers.filter(timer => timer.live && !timer.repeat && timer.ms === ms);
  const fire = ms => { const due = pending(ms); assert.ok(due.length, `a timer of ${ms} ms`); due.forEach(timer => { timer.live = false; timer.run(); }); };
  return { live, sockets, timers, changes, statuses, pending, fire };
}

test('connect opens the Realtime socket and joins the records channel for this account with its token', () => {
  const h = harness();
  h.live.connect(session());
  assert.equal(h.sockets.length, 1);
  assert.equal(h.sockets[0].url, 'wss://abc.supabase.co/realtime/v1/websocket?apikey=sb_publishable_key&vsn=1.0.0');
  assert.equal(h.live.status(), 'connecting');
  h.sockets[0].open();
  const join = h.sockets[0].sent[0];
  assert.equal(join.topic, 'realtime:dailo-records');
  assert.equal(join.event, 'phx_join');
  // R58: the channel listens to the opaque per-account row of 0006_security.sql instead of records.
  assert.deepEqual(join.payload.config.postgres_changes, [{ event: '*', schema: 'public', table: 'record_pokes', filter: 'user_id=eq.user-1' }]);
  assert.equal(join.payload.access_token, 'jwt-1');
  h.sockets[0].receive({ topic: 'realtime:dailo-records', event: 'phx_reply', ref: join.ref, payload: { status: 'ok', response: {} } });
  assert.equal(h.live.status(), 'live');
  assert.deepEqual(h.statuses, ['connecting', 'live']);
  h.live.connect(session());
  assert.equal(h.sockets.length, 1, 'a second connect keeps the open socket');
});

test('a change to a record pokes a sync; other messages do not', () => {
  const h = harness();
  h.live.connect(session());
  h.sockets[0].open();
  h.sockets[0].receive({ topic: 'realtime:dailo-records', event: 'postgres_changes', payload: { data: { type: 'UPDATE', table: 'records' } } });
  h.sockets[0].receive({ topic: 'realtime:dailo-records', event: 'presence_state', payload: {} });
  h.sockets[0].receive({ topic: 'phoenix', event: 'phx_reply', payload: { status: 'ok' } });
  h.sockets[0].onmessage({ data: 'not json' });
  assert.deepEqual(h.changes, ['change']);
});

test('a heartbeat every 25 seconds keeps the socket open', () => {
  const h = harness();
  h.live.connect(session());
  h.sockets[0].open();
  const beat = h.timers.find(timer => timer.repeat && timer.live);
  assert.equal(beat.ms, 25000);
  beat.run();
  assert.deepEqual(h.sockets[0].sent.at(-1), { topic: 'phoenix', event: 'heartbeat', payload: {}, ref: h.sockets[0].sent.at(-1).ref });
});

test('a lost connection comes back with growing pauses; disconnect stops it for good', () => {
  const h = harness();
  h.live.connect(session());
  h.sockets[0].open();
  h.sockets[0].close();
  assert.equal(h.live.status(), 'connecting');
  h.fire(1000);
  assert.equal(h.sockets.length, 2);
  h.sockets[1].close();
  h.fire(2000);
  h.sockets[2].close();
  h.fire(5000);
  h.sockets[3].open();
  h.sockets[3].receive({ topic: 'realtime:dailo-records', event: 'phx_reply', ref: h.sockets[3].sent[0].ref, payload: { status: 'ok' } });
  h.sockets[3].close();
  h.fire(1000);
  assert.equal(h.sockets.length, 5, 'a successful join resets the pause');
  h.live.disconnect();
  assert.equal(h.live.status(), 'off');
  assert.equal(h.sockets[4].readyState, 3);
  assert.equal(h.timers.filter(timer => timer.live).length, 0, 'no timer left behind');
});

test('a refused join closes the socket and tries again later; a new token is sent on the open channel', () => {
  const h = harness();
  h.live.connect(session());
  h.sockets[0].open();
  h.sockets[0].receive({ topic: 'realtime:dailo-records', event: 'phx_reply', ref: h.sockets[0].sent[0].ref, payload: { status: 'error', response: { reason: 'unmatched topic' } } });
  assert.equal(h.sockets[0].readyState, 3);
  h.fire(1000);
  h.sockets[1].open();
  h.sockets[1].receive({ topic: 'realtime:dailo-records', event: 'phx_reply', ref: h.sockets[1].sent[0].ref, payload: { status: 'ok' } });
  h.live.connect(session('jwt-2'));
  const refresh = h.sockets[1].sent.at(-1);
  assert.deepEqual([refresh.topic, refresh.event, refresh.payload], ['realtime:dailo-records', 'access_token', { access_token: 'jwt-2' }]);
  h.live.connect(session('jwt-2'));
  assert.equal(h.sockets[1].sent.filter(message => message.event === 'access_token').length, 1, 'the same token is not sent twice');
});

test('without WebSocket or a session nothing opens', () => {
  const live = Sync.createRealtime({ url: 'https://abc.supabase.co', key: 'k', WebSocket: null, onChange() {} });
  live.connect(session());
  assert.equal(live.status(), 'off');
  const h = harness();
  h.live.connect(null);
  h.live.connect({ accessToken: 'x', user: {} });
  assert.equal(h.sockets.length, 0);
});

test('the app: a change pokes a sync; the socket opens after a sync, closes in the background and on sign-out', () => {
  assert.match(app, /const liveSync = syncClient && Sync\.createRealtime \? Sync\.createRealtime\(\{ url: syncConfig\.url, key: syncConfig\.anonKey, onChange: \(\) => scheduleSync\(800\), onStatus: \(\) => refreshSyncCard\(\) \}\) : null;/);
  assert.match(fn('runSync'), /if \(result\.status === 'ok'\) \{? ?connectLiveSync\(\);/, 'R51 adds the journal step after it');
  assert.match(fn('connectLiveSync'), /if \(liveSync && document\.visibilityState !== 'hidden' && session\?\.accessToken\) liveSync\.connect\(session\);/);
  assert.match(fn('startSync'), /if \(document\.visibilityState === 'visible'\) scheduleSync\(500\); else liveSync\?\.disconnect\(\);/);
  assert.match(fn('signOutSync'), /liveSync\?\.disconnect\(\);/);
  assert.match(app, /clearTimeout\(syncTimer\);\n\s+liveSync\?\.disconnect\(\);\n(\s+forgetJournalKey\(\);\n)?\s+syncMeta = \{\};/);
  assert.match(fn('syncView'), /live: liveSync\?\.status\(\) === 'live'/);
  // R58: the CSP names this project's host only (tests/security-r58.test.js keeps it equal to js/sync-config.js).
  assert.match(read('index.html'), /connect-src 'self' https:\/\/[a-z0-9]+\.supabase\.co wss:\/\/[a-z0-9]+\.supabase\.co;/);
});

test('Nalog says when changes arrive at once; the migration adds records to the Realtime publication', () => {
  assert.match(read('js/settings-ui.js'), /\$\{sync\.live \? ` · \$\{tr\('changes arrive at once'\)\}` : ''\}/);
  assert.ok(read('js/i18n-sr.js').includes('"changes arrive at once": "promene stižu odmah"'));
  const sql = read('supabase/migrations/0004_realtime.sql');
  assert.match(sql, /alter publication supabase_realtime add table public\.records;/);
  assert.match(sql, /pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'/);
  assert.match(read('docs/v2/podesavanje-supabase.md'), /0004_realtime\.sql/);
});

test('R50 shipped as 2.0.0-alpha.77 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 77);
});
