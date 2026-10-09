(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DailoPlatform = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // The only code that knows whether Dailo runs in a browser (web/PWA) or inside the Capacitor app on
  // iOS/Android (audit 2026-10-09, section 7). The app calls these functions instead of browser-only APIs.
  // On the web every function keeps the browser behavior Dailo had before; the native branches use the
  // official Capacitor plugins through Capacitor.registerPlugin (vendor/capacitor/capacitor.js).

  const SHARE_DIR = 'dailo-share';
  const MIRROR = 'dailo/state.json';
  const MIRROR_TMP = 'dailo/state.json.tmp';
  const CHUNK_BYTES = 3 * 256 * 1024; // a multiple of 3, so every base64 chunk can be appended as is

  // FNV-1a over the UTF-16 code units, folded to a positive 31-bit integer (Android and iOS both accept it).
  function notificationId(key) {
    let hash = 0x811c9dc5;
    const text = String(key);
    for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
    return ((hash >>> 0) & 0x7fffffff) || 1;
  }

  function create(env = root) {
    const cap = env.Capacitor;
    const isNative = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
    const kind = isNative ? String((typeof cap.getPlatform === 'function' && cap.getPlatform()) || 'native') : 'web';
    const registered = {};
    const plugin = name => {
      if (!isNative || typeof cap.registerPlugin !== 'function') return null;
      if (!registered[name]) registered[name] = cap.registerPlugin(name);
      return registered[name];
    };
    const doc = () => env.document || null;

    // Pause and resume. Browsers report `visibilitychange` (iOS suspends a backgrounded page without
    // `pagehide`); the native app also reports the App plugin's `pause`/`resume`. Handlers must be idempotent:
    // one transition can arrive through more than one event, so calls within 800 ms are merged.
    function merged(fn) {
      let last = -Infinity;
      return reason => {
        const now = Date.now();
        if (now - last < 800) return;
        last = now;
        try { fn(reason); } catch (error) { env.console?.error?.(error); }
      };
    }
    function onPause(fn) {
      const handler = merged(fn);
      doc()?.addEventListener?.('visibilitychange', () => { if (doc().visibilityState === 'hidden') handler('hidden'); });
      env.addEventListener?.('pagehide', () => handler('pagehide'));
      plugin('App')?.addListener('pause', () => handler('pause'));
    }
    function onResume(fn) {
      const handler = merged(fn);
      doc()?.addEventListener?.('visibilitychange', () => { if (doc().visibilityState === 'visible') handler('visible'); });
      plugin('App')?.addListener('resume', () => handler('resume'));
    }

    // Android hardware Back. `handler()` returns true when it closed something (a sheet, popover or dialog);
    // otherwise Back goes to the previous in-app screen, and from the first screen the app is minimized.
    function setBackHandler(handler) {
      if (!isNative || kind !== 'android') return false;
      plugin('App')?.addListener('backButton', event => {
        let handled = false;
        try { handled = Boolean(handler()); } catch (error) { env.console?.error?.(error); }
        if (handled) return;
        if (event?.canGoBack) env.history?.back();
        else plugin('App')?.minimizeApp?.();
      });
      return true;
    }

    // Files. The web downloads through a temporary link, as before. In the app a WebView cannot download
    // a blob, so the file is written to the cache directory in chunks, handed to the system share sheet
    // ("Save to Files", Drive, mail, open in another app) and deleted afterwards.
    function webDownload(blob, fileName) {
      const url = env.URL.createObjectURL(blob), anchor = doc().createElement('a');
      anchor.href = url; anchor.download = fileName;
      try { doc().body.appendChild(anchor); anchor.click(); }
      finally { anchor.remove(); env.setTimeout(() => env.URL.revokeObjectURL(url), 1000); }
      return 'downloaded';
    }
    function base64Of(bytes) {
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return env.btoa(binary);
    }
    async function writeChunked(fs, path, blob) {
      let offset = 0;
      do {
        const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
        const options = { path, data: base64Of(bytes), directory: 'CACHE' };
        if (offset === 0) await fs.writeFile({ ...options, recursive: true });
        else await fs.appendFile(options);
        offset += CHUNK_BYTES;
      } while (offset < blob.size);
    }
    const safeName = name => String(name || 'dailo-file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 120) || 'dailo-file';
    async function shareBlob(blob, fileName, title) {
      const fs = plugin('Filesystem'), share = plugin('Share');
      if (!fs || !share) throw new Error('File sharing is unavailable.');
      const path = `${SHARE_DIR}/${Date.now()}-${safeName(fileName)}`;
      await writeChunked(fs, path, blob);
      try {
        const { uri } = await fs.getUri({ path, directory: 'CACHE' });
        await share.share({ title: title || safeName(fileName), files: [uri] });
        return 'shared';
      } catch (error) {
        if (/cancel/i.test(String(error?.message || error || ''))) return 'cancelled';
        throw error;
      } finally {
        Promise.resolve(fs.deleteFile({ path, directory: 'CACHE' })).catch(() => {});
      }
    }
    // Returns 'downloaded' (web), 'shared' or 'cancelled' (app). Callers record a backup only when it was not cancelled.
    async function saveFile(blob, fileName, title) {
      return isNative ? shareBlob(blob, fileName, title) : webDownload(blob, fileName);
    }
    // Native only: opens a file in another app through the share sheet. The web keeps its own logic.
    async function openFile(blob, fileName) {
      return shareBlob(blob, fileName, fileName);
    }
    // Leftovers from an interrupted share are removed at start.
    async function cleanupSharedFiles() {
      if (!isNative) return;
      try { await plugin('Filesystem')?.rmdir({ path: SHARE_DIR, directory: 'CACHE', recursive: true }); } catch (_) { /* nothing to clean */ }
    }

    // Links that leave Dailo. The web opens a new tab as before. In the app, http(s) opens in the system
    // browser sheet and mailto:/tel: go to the system apps, so the WebView never navigates away from Dailo.
    function openExternal(url) {
      if (!url) return;
      if (!isNative) { env.open?.(url, '_blank', 'noopener'); return; }
      if (/^https?:/i.test(url)) { Promise.resolve(plugin('Browser')?.open({ url })).catch(error => env.console?.error?.(error)); return; }
      env.location.href = url;
    }
    // Native only: every link with target=_blank, an http(s) address or a mailto:/tel: scheme goes through
    // openExternal. Relative pages that are not packaged in the app (the tester guide) map to their online copy.
    function interceptExternalLinks(target, { onlinePages = {} } = {}) {
      if (!isNative || !target?.addEventListener) return false;
      target.addEventListener('click', event => {
        const anchor = event.target?.closest?.('a[href]');
        if (!anchor) return;
        const href = anchor.getAttribute('href') || '';
        if (href.startsWith('#') || href.startsWith('javascript:')) return;
        const online = onlinePages[href];
        if (!online && !/^(https?:|mailto:|tel:)/i.test(href) && anchor.getAttribute('target') !== '_blank') return;
        event.preventDefault();
        openExternal(online || anchor.href);
      }, true);
      return true;
    }

    // Storage. A browser decides whether to keep site data (navigator.storage.persist); the app keeps its
    // data in its own container until it is uninstalled, so the browser question does not apply there.
    function storageStatus() {
      return isNative ? { state: 'app' } : null;
    }

    // Durable mirror (app only, audit M5). WebView storage can be cleared by the system; the canonical metadata
    // text is therefore also written to the app's Library directory. A write goes to a temporary file first; the
    // old file is replaced only after that succeeded, and reading falls back to the temporary file, so an
    // interrupted write never leaves nothing behind. Writes are queued so two of them never interleave.
    let mirrorQueue = Promise.resolve();
    const isStateText = text => { try { const value = JSON.parse(text); return Boolean(value) && typeof value === 'object' && !Array.isArray(value); } catch (_) { return false; } };
    function writeMirror(text) {
      if (!isNative || typeof text !== 'string' || !isStateText(text)) return Promise.resolve(false);
      const fs = plugin('Filesystem');
      const run = async () => {
        await fs.writeFile({ path: MIRROR_TMP, data: text, directory: 'LIBRARY', encoding: 'utf8', recursive: true });
        try { await fs.deleteFile({ path: MIRROR, directory: 'LIBRARY' }); } catch (_) { /* first write */ }
        await fs.rename({ from: MIRROR_TMP, to: MIRROR, directory: 'LIBRARY', toDirectory: 'LIBRARY' });
        return true;
      };
      mirrorQueue = mirrorQueue.catch(() => {}).then(run);
      return mirrorQueue;
    }
    async function readMirror() {
      if (!isNative) return null;
      const fs = plugin('Filesystem');
      for (const path of [MIRROR, MIRROR_TMP]) {
        try {
          const { data } = await fs.readFile({ path, directory: 'LIBRARY', encoding: 'utf8' });
          if (typeof data === 'string' && isStateText(data)) return data;
        } catch (_) { /* missing or unreadable: try the next copy */ }
      }
      return null;
    }

    // Reminders as phone notifications (app only, audit M6). The app hands over the full list of upcoming
    // reminders; reconcile keeps what is already pending unchanged, cancels only what is gone or changed, and
    // schedules the rest, so a reminder is never missed between a cancel-all and a re-schedule. Notification ids
    // are stable 31-bit hashes of the reminder key. Without permission nothing is scheduled.
    const ln = () => plugin('LocalNotifications');
    const permissionOf = value => (value === 'granted' ? 'granted' : value === 'denied' ? 'denied' : 'prompt');
    async function notificationPermission() {
      if (!ln()) return 'unavailable';
      try { return permissionOf((await ln().checkPermissions())?.display); } catch (_) { return 'unavailable'; }
    }
    async function requestNotificationPermission() {
      if (!ln()) return 'unavailable';
      return permissionOf((await ln().requestPermissions())?.display);
    }
    // Android 12+: without the exact-alarm setting a reminder can arrive a few minutes late. Scheduling an exact
    // notification would open the system settings screen on every call, so reconcile asks for inexact ones instead
    // and only an explicit button opens the screen. Null: not Android, or the plugin cannot tell.
    async function exactAlarms() {
      if (kind !== 'android' || !ln()) return null;
      try { return (await ln().checkExactNotificationSetting())?.exact_alarm === 'granted' ? 'granted' : 'denied'; } catch (_) { return null; }
    }
    async function allowExactAlarms() {
      if (kind !== 'android' || !ln()) return null;
      return (await ln().changeExactNotificationSetting())?.exact_alarm === 'granted' ? 'granted' : 'denied';
    }
    let reconcileQueue = Promise.resolve();
    function reconcile(items) {
      if (!isNative) return Promise.resolve({ status: 'web' });
      const run = async () => {
        if (!ln()) return { status: 'unavailable' };
        const permission = await notificationPermission();
        if (permission !== 'granted') return { status: 'permission', permission };
        const exact = await exactAlarms();
        const desired = new Map();
        for (const item of items || []) {
          let id = notificationId(item.key);
          while (desired.has(id)) id = (id % 0x7fffffff) + 1;
          desired.set(id, { ...item, sig: notificationId(`${item.title}\u0000${item.body}\u0000${item.at}\u0000${item.route}\u0000${exact}`).toString(36) });
        }
        const now = Date.now();
        const pending = (await ln().getPending())?.notifications || [];
        const kept = new Set(), cancel = [];
        for (const entry of pending) {
          const id = Number(entry.id), at = Date.parse(entry.schedule?.at);
          if (Number.isFinite(at) && at <= now) continue; // already shown (Android lists those too)
          const want = desired.get(id);
          if (want && entry.extra?.key === want.key && entry.extra?.sig === want.sig) kept.add(id);
          else cancel.push({ id });
        }
        if (cancel.length) await ln().cancel({ notifications: cancel });
        const notifications = [...desired].filter(([id]) => !kept.has(id)).map(([id, item]) => ({
          id, title: item.title, body: item.body || '',
          schedule: { at: new Date(item.at), allowWhileIdle: true },
          extra: { key: item.key, route: item.route, sig: item.sig },
          ...(exact === 'denied' ? { isExactNotification: false } : {}),
        }));
        if (notifications.length) await ln().schedule({ notifications });
        return { status: 'ok', permission, exact, scheduled: notifications.length, cancelled: cancel.length, kept: kept.size };
      };
      reconcileQueue = reconcileQueue.catch(() => {}).then(run);
      return reconcileQueue;
    }
    // A tapped notification. The plugin keeps the event until a listener exists, so a tap that started the app
    // is delivered once the app registers this after loading its data.
    function onNotificationOpen(handler) {
      if (!isNative || !ln()) return false;
      ln().addListener('localNotificationActionPerformed', event => {
        try { handler(event?.notification?.extra || {}); } catch (error) { env.console?.error?.(error); }
      });
      return true;
    }

    return Object.freeze({
      kind,
      isNative,
      allowsServiceWorker: !isNative,
      plugin,
      lifecycle: Object.freeze({ onPause, onResume }),
      backButton: Object.freeze({ setHandler: setBackHandler }),
      files: Object.freeze({ saveFile, openFile, cleanupSharedFiles }),
      links: Object.freeze({ openExternal, interceptExternalLinks }),
      storage: Object.freeze({ status: storageStatus }),
      durable: Object.freeze({ write: writeMirror, read: readMirror }),
      notifications: Object.freeze({ permission: notificationPermission, requestPermission: requestNotificationPermission, exactAlarms, allowExactAlarms, reconcile, onOpen: onNotificationOpen, notificationId }),
    });
  }

  const platform = create(root);
  return Object.freeze({ ...platform, create });
});
