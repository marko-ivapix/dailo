(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DailoNative = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Dailo in the Capacitor app (V2.0-b, spec docs/superpowers/specs/2026-10-08-todo-v2-0-design.md, section A).
  // On the web every call is a no-op. In the app it schedules reminders as local notifications,
  // shares files through the share sheet and reports resume and notification taps.

  const ROUTES = { task: '#today', goal: '#goals', habit: '#habits' };

  // Android needs an integer id: a stable positive 31-bit FNV-1a hash of the reminder key.
  function notificationId(key) {
    let hash = 0x811c9dc5;
    for (const char of String(key)) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return (hash & 0x7fffffff) || 1;
  }

  // Core.upcomingReminders entries → LocalNotifications.schedule payloads; `bodies` holds the translated text per kind.
  function toNotifications(reminders, bodies = {}) {
    return (reminders || []).map(item => ({
      id: notificationId(item.key),
      title: item.title,
      body: bodies[item.kind] || '',
      schedule: { at: new Date(item.at), allowWhileIdle: true },
      extra: { kind: item.kind, itemId: item.id, route: ROUTES[item.kind] || '#today' },
    }));
  }

  async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return root.btoa(binary);
  }

  const inert = Object.freeze({
    isNative: false, platform: 'web',
    permission: async () => 'unavailable', requestPermission: async () => 'unavailable',
    scheduleReminders: async () => ({ scheduled: 0 }),
    shareFile: async () => false, onResume() {}, onNotificationTap() {},
  });

  function createBridge({ Capacitor = root.Capacitor } = {}) {
    if (!Capacitor?.isNativePlatform?.()) return inert;
    const plugin = name => Capacitor.Plugins?.[name] || Capacitor.registerPlugin(name);
    const notifications = plugin('LocalNotifications');
    const app = plugin('App');
    const filesystem = plugin('Filesystem');
    const share = plugin('Share');
    let lastScheduled = null;

    return {
      isNative: true,
      platform: Capacitor.getPlatform(),
      // 'granted', 'denied', 'prompt' or 'prompt-with-rationale'.
      async permission() { return (await notifications.checkPermissions()).display; },
      async requestPermission() { return (await notifications.requestPermissions()).display; },
      // Replaces every pending reminder with `list`; an unchanged list is left alone.
      async scheduleReminders(list) {
        if ((await this.permission()) !== 'granted') { lastScheduled = null; return { scheduled: 0 }; }
        const signature = JSON.stringify(list);
        if (signature === lastScheduled) return { scheduled: list.length };
        const pending = (await notifications.getPending()).notifications || [];
        if (pending.length) await notifications.cancel({ notifications: pending.map(item => ({ id: item.id })) });
        if (list.length) await notifications.schedule({ notifications: list });
        lastScheduled = signature;
        return { scheduled: list.length };
      },
      // True when shared, false when the share sheet was cancelled; other failures throw.
      async shareFile(blob, fileName, title) {
        const { uri } = await filesystem.writeFile({ path: fileName, data: await blobToBase64(blob), directory: 'CACHE' });
        try { await share.share({ title, dialogTitle: title, url: uri }); }
        catch (error) { if (/cancel/i.test(error?.message || '')) return false; throw error; }
        return true;
      },
      onResume(handler) { app.addListener('resume', () => handler()); },
      onNotificationTap(handler) { notifications.addListener('localNotificationActionPerformed', event => handler(event?.notification?.extra || {})); },
    };
  }

  return Object.freeze({ notificationId, toNotifications, createBridge });
});
