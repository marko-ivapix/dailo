(function () {
  'use strict';

  const I18n = window.TodoI18n;
  const { tr, trn, trMessage, msg } = I18n;

  // The browser shows reminders only while Dailo is open; the app schedules phone notifications (audit M6).
  function reminderRows(native, notificationButtonLabel) {
    const row = (title, text, action, label) => `<div class="settings-row"><div class="settings-label"><strong>${title}</strong><span>${text}</span></div><button class="btn btn-secondary" type="button" data-action="${action}">${label}</button></div>`;
    if (!native) return row(tr('Browser reminders'), tr('Reminders appear while Dailo is open. Browser notifications are optional, and nothing arrives while the app is closed.'), 'enable-notifications', notificationButtonLabel());
    const text = native.permission === 'granted' ? tr('Reminders arrive as notifications, even when Dailo is closed.')
      : native.permission === 'denied' ? tr('Notifications are off for Dailo. Turn them on in the phone settings.')
        : tr('Allow notifications so reminders arrive even when Dailo is closed.');
    const label = native.permission === 'granted' ? tr('Enabled') : native.permission === 'denied' ? tr('Blocked') : tr('Enable');
    const exact = native.permission === 'granted' && native.exact === 'denied'
      ? row(tr('Exact time'), tr('Android may deliver reminders a few minutes late. Allow exact alarms for Dailo.'), 'allow-exact-alarms', tr('Allow')) : '';
    return row(tr('Reminders'), text, 'enable-notifications', label) + exact;
  }

  // Keyboard shortcut rows (Računar).
  const SHORTCUT_ROWS = ctx => { const { state, shortcutLabels, esc } = ctx; return Object.entries(shortcutLabels).map(([key,label])=>`<div class="settings-row shortcut-row"><label class="settings-label" for="shortcut-${key}"><strong>${esc(tr(label))}</strong></label><input class="input shortcut-input" id="shortcut-${key}" data-shortcut="${key}" aria-label="${esc(tr('{command} shortcut', { command: tr(label) }))}" placeholder="${tr('Disabled')}" value="${esc(state.settings.shortcuts[key] || '')}" /><button class="btn btn-secondary" data-action="save-shortcut" data-command="${key}">${tr('Save')}</button><button class="btn btn-ghost" data-action="disable-shortcut" data-command="${key}">${tr('Disable')}</button></div>`).join(''); };

  function renderSettings(ctx) {
    const { state, pageHeader, shortcutError, notificationButtonLabel, esc } = ctx;
    const backupStatus = state.settings.backupStatus || {};
    const statusTime = value => (value && !Number.isNaN(Date.parse(value))
      ? `<time datetime="${esc(value)}">${esc(new Date(value).toLocaleString(I18n.locale(), { dateStyle: 'medium', timeStyle: 'short' }))}</time>`
      : tr('Never'));
    // Status sentences are stored in English; "Prefix: detail" failures translate their prefix.
    const persistence = ctx.storagePersistence?.() || { state: 'unknown' };
    const persistenceText = {
      granted: tr('On. The browser keeps Dailo data unless you delete it.'),
      denied: tr('Not granted yet. Install Dailo to the Home Screen and keep regular backups.'),
      unsupported: tr('Not supported in this browser. Keep regular backups.'),
      app: tr('Kept by the app on this device until the app is removed. Keep regular backups.'),
    }[persistence.state] || tr('Checking…');
    const megabytes = bytes => `${new Intl.NumberFormat(I18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1048576)} MB`;
    const usage = Number.isFinite(persistence.usage) && Number.isFinite(persistence.quota) ? ` ${tr('{used} of {total} used.', { used: megabytes(persistence.usage), total: megabytes(persistence.quota) })}` : '';
    const reminderDays = ctx.Core?.backupReminderDays ? ctx.Core.backupReminderDays(state.settings) : 7;
    const reminderOptions = [...new Set([0, 3, 7, 14, 30, reminderDays])].sort((a, b) => a - b)
      .map(days => `<option value="${days}"${days === reminderDays ? ' selected' : ''}>${days === 1 ? tr('Every day') : days ? trn(days, 'Every {count} day', 'Every {count} days') : tr('Off')}</option>`).join('');
    const release = ctx.release || {};
    const installed = Boolean(ctx.environmentInfo?.().standalone);
    const reportHref = release.problemReportMailto?.({ email: release.REPORT_EMAIL, version: release.APP_VERSION, ...(ctx.environmentInfo?.() || {}) }) || null;
    const sundayFirst = state.settings.weekStartsOn === 0 || state.settings.weekStartsOn === 'sunday';
    const capacity = ctx.Core?.dailyCapacityMinutes ? ctx.Core.dailyCapacityMinutes(state.settings) : 360;
    // R12c (J6): the evening journal notice — off or a time; a time synced from elsewhere is listed too.
    const rawJournalTime = state.settings.journalReminderTime;
    const journalTime = rawJournalTime === null ? null : typeof rawJournalTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(rawJournalTime) ? rawJournalTime : '20:00';
    const journalOptions = `<option value="off"${journalTime ? '' : ' selected'}>${tr('Off')}</option>` + [...new Set(['19:00', '20:00', '21:00', '22:00', ...(journalTime ? [journalTime] : [])])].sort()
      .map(time => `<option value="${time}"${time === journalTime ? ' selected' : ''}>${esc(tr('From {time}', { time }))}</option>`).join('');
    const capacityOptions = [...new Set([0, 120, 240, 300, 360, 420, 480, 600, 720, capacity])].sort((a, b) => a - b)
      .map(minutes => `<option value="${minutes}"${minutes === capacity ? ' selected' : ''}>${minutes ? tr('{hours} h', { hours: new Intl.NumberFormat(I18n.locale(), { maximumFractionDigits: 1 }).format(minutes / 60) }) : tr('Off')}</option>`).join('');
    const sync = ctx.syncView?.() || { configured: false };
    const busy = sync.busy ? ' disabled' : '';
    const syncError = sync.error ? `<p class="validation" role="alert">${esc(trMessage(sync.error))}</p>` : '';
    const syncCard = !sync.configured ? '' : `
      <section class="settings-card" data-settings-sync>
        <h2>${tr('Account')}</h2>
        ${sync.signedIn ? `<div class="settings-row"><div class="settings-label"><strong>${tr('Account')}</strong><span>${esc(sync.email)}</span></div></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Last sync')}</strong><span data-sync-status>${sync.running ? tr('Syncing…') : statusTime(sync.lastSyncAt)}${sync.lastError ? `<br><span class="validation" role="alert">${esc(trMessage(sync.lastError))}</span>` : ''}</span></div><button class="btn btn-secondary" type="button" data-action="sync-now"${sync.running ? ' disabled' : ''}><i class="ph ph-arrows-clockwise"></i> ${tr('Sync now')}</button></div>
        <p class="area-empty-copy">${tr('Tasks, projects, goals, habits, notes and settings sync between your devices. Attachments stay on the device where they were added.')}</p>
        <div class="sync-actions"><button class="btn btn-secondary" type="button" data-action="sync-sign-out">${tr('Sign out')}</button><button class="btn btn-ghost" type="button" data-action="sync-delete-account" style="color:var(--danger)">${tr('Delete account')}</button></div>`
        : sync.step === 'code' ? `<div class="settings-row"><label class="settings-label" for="sync-code"><strong>${tr('Code from the e-mail')}</strong><span>${tr('A code was sent to {email}. It is valid for a short time.', { email: esc(sync.email) })}</span></label><input class="input" id="sync-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" /></div>
        ${syncError}
        <div class="sync-actions"><button class="btn btn-secondary" type="button" data-action="sync-verify-code"${busy}>${tr('Confirm')}</button><button class="btn btn-ghost" type="button" data-action="sync-request-code"${busy}>${tr('Send a new code')}</button><button class="btn btn-ghost" type="button" data-action="sync-change-email">${tr('Change e-mail')}</button></div>`
        : `<div class="settings-row"><label class="settings-label" for="sync-email"><strong>${tr('Sign in')}</strong><span>${tr('Optional. Enter your e-mail address to get a sign-in code. No password is needed. Without signing in, everything stays only on this device.')}</span></label><input class="input" id="sync-email" type="email" inputmode="email" autocomplete="email" value="${esc(sync.email)}" /></div>
        ${syncError}
        <div class="sync-actions"><button class="btn btn-secondary" type="button" data-action="sync-request-code"${busy}>${tr('Send code')}</button></div>`}
      </section>`;
    const privacy = !sync.configured ? tr('Your data stays only on this device. Dailo has no server or account.')
      : sync.signedIn ? tr('Your data is on this device and in your sync account on a server in the EU. Attachments stay only on this device.')
        : tr('Your data stays only on this device until you sign in to sync.');
    // Redesign R10g (M5, M6): Nalog, Opšte, Podaci, Pomoć and Računar (desktop only); a choice applies at once.
    return `${pageHeader(tr('Settings'), '', { add: false })}
${syncCard}
      <section class="settings-card" data-settings-general>
        <h2>${tr('General')}</h2>
        <div class="settings-row"><label class="settings-label" for="preference-week-start"><strong>${tr('Week starts on')}</strong><span>${tr('Used by weekly views and habit periods.')}</span></label><select class="input" id="preference-week-start"><option value="monday"${!sundayFirst ? ' selected' : ''}>${tr('Monday')}</option><option value="sunday"${sundayFirst ? ' selected' : ''}>${tr('Sunday')}</option></select></div>
        <div class="settings-row"><label class="settings-label" for="daily-capacity"><strong>${tr('Daily capacity')}</strong><span>${tr('Planned work per day, compared with task durations in the Calendar day view.')}</span></label><select class="input" id="daily-capacity">${capacityOptions}</select></div>
        ${reminderRows(ctx.notificationSettings?.() || null, notificationButtonLabel)}
        <div class="settings-row"><label class="settings-label" for="journal-reminder-time"><strong>${tr('Journal reminder')}</strong><span>${tr('When “Write down how the day went” appears on Today.')}</span></label><select class="input" id="journal-reminder-time">${journalOptions}</select></div>
      </section>
      <section class="settings-card" data-settings-data>
        <h2>${tr('Data')}</h2>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Backup')}</strong><span>${tr('Last export:')} ${statusTime(backupStatus.lastExport)}<br>${tr('Last import:')} ${statusTime(backupStatus.lastImport)}<br>${tr('Recovery snapshot:')} ${backupStatus.snapshotAvailable ? tr('Available') : tr('None pending')}<br>${tr('Validation:')} ${esc(trMessage(backupStatus.validationResult || msg('Not yet validated')))}</span></div><button class="btn btn-secondary" type="button" data-action="export-backup"><i class="ph ph-download-simple"></i> ${tr('Export ZIP')}</button></div>
        <div class="settings-row settings-sub"><label class="settings-label" for="backup-reminder-days"><strong>${tr('Backup reminder')}</strong><span>${tr('Today reminds you to export a backup when the last one is older than this.')}</span></label><select class="input" id="backup-reminder-days">${reminderOptions}</select></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Restore from backup')}</strong><span>${tr('Validate a ZIP first, then replace current data only after you confirm.')}</span></div><div><button class="btn btn-secondary" type="button" data-action="import-backup"><i class="ph ph-upload-simple"></i> ${tr('Import ZIP')}</button><input id="backup-import-input" type="file" accept=".zip,application/zip" hidden /></div></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Local snapshots')}</strong><span>${tr('Five automatic copies, at most once every five minutes after saving. Restore one item with its files and history.')}</span></div><button class="btn btn-secondary" type="button" data-action="open-local-snapshots">${tr('Browse snapshots')}</button></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Persistent storage')}</strong><span data-storage-persistence="${esc(persistence.state)}">${esc(persistenceText)}${esc(usage)}</span></div>${persistence.state === 'denied' ? `<button class="btn btn-secondary" type="button" data-action="request-storage-persistence">${tr('Request')}</button>` : ''}</div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Populate demo workspace')}</strong><span>${tr('Add missing editable examples across Areas, Projects, Tasks, Goals, Habits, Cleaning, Tags, Notes and Resources. Existing items and edits stay intact.')}</span></div><button class="btn btn-secondary" type="button" data-action="add-starter-examples">${tr('Populate workspace')}</button></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Reset app data')}</strong><span>${tr('A safety ZIP is created first, then local tasks, projects, tags, attachments and preferences are cleared.')}</span></div><button class="btn btn-ghost" type="button" data-action="reset-app" style="color:var(--danger)">${tr('Reset')}</button></div>
      </section>
      <section class="settings-card" data-settings-about>
        <h2>${tr('Help')}</h2>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Guide')}</strong><span>${tr('How to install Dailo, keep backups and report problems.')}</span></div><a class="btn btn-secondary" href="uputstvo.html" target="_blank" rel="noopener" data-beta-guide>${tr('Open guide')}</a></div>
        ${reportHref ? `<div class="settings-row"><div class="settings-label"><strong>${tr('Report a problem')}</strong><span>${tr('Opens an e-mail with the app version and device details. Your data is not attached.')}</span></div><a class="btn btn-secondary" href="${esc(reportHref)}" data-report-problem>${tr('Report a problem')}</a></div>` : ''}
        ${installed ? '' : `<div class="settings-row"><div class="settings-label"><strong>${tr('Install app')}</strong><span data-install-status="browser">${tr('On iPhone, in Safari tap Share, then Add to Home Screen, then Add. Install first and then start using Dailo: data in Safari and in the installed app are kept separately.')}</span></div></div>`}
        <div class="settings-row"><div class="settings-label"><strong>${tr('Privacy')}</strong><span data-privacy-note>${privacy}</span></div></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('About')}</strong><span>Dailo ${esc(release.APP_VERSION || '')}</span></div></div>
      </section>
      <section class="settings-card settings-desktop" data-settings-desktop>
        <h2>${tr('Computer')}</h2>
        <p class="area-empty-copy">${tr('Use a letter or digit with optional Ctrl/Cmd, Alt and Shift. Leave disabled commands unassigned.')}</p>
        ${shortcutError()?`<p class="validation" role="alert">${esc(shortcutError())}</p>`:''}
        ${SHORTCUT_ROWS(ctx)}
        <button class="btn btn-secondary" data-action="reset-shortcuts">${tr('Reset to defaults')}</button>
        <div class="settings-row"><label class="settings-label" for="preference-density"><strong>${tr('Compact density')}</strong><span>${tr('Keep task rows and controls tight.')}</span></label><input id="preference-density" type="checkbox" ${state.settings.compactDensity !== false ? 'checked' : ''}></div>
      </section>`;
  }

  window.TodoDomainModules?.register({
    name: 'settings',
    renderRoute(route, ctx) {
      if (route.type === 'settings') return renderSettings(ctx);
    },
    handleAction(action, event, ctx) {
      const element = event?.target.closest('[data-action]');
      if (!element) return false;
      if (action === 'save-shortcut') ctx.saveShortcut(element.dataset.command);
      else if (action === 'disable-shortcut') ctx.disableShortcut(element.dataset.command);
      else if (action === 'reset-shortcuts') ctx.resetShortcuts();
      else return false;
      return true;
    }
  });
})();
