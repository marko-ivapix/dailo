(function () {
  'use strict';

  const I18n = window.TodoI18n;
  const { tr, trn, trMessage, msg } = I18n;

  // A stored time as a readable date and hour, or "Nikad" (Settings → Podaci and the Nalog screen).
  function statusTimeHtml(esc, value) {
    return value && !Number.isNaN(Date.parse(value))
      ? `<time datetime="${esc(value)}">${esc(new Date(value).toLocaleString(I18n.locale(), { dateStyle: 'medium', timeStyle: 'short' }))}</time>`
      : tr('Never');
  }

  // The browser shows reminders only while Dailo is open; the app schedules phone notifications (audit M6).
  // R32 (finding 18): a button appears only when it does something; otherwise the line says the state.
  function reminderRows(native) {
    const row = (title, text, action = '', label = '') => `<div class="settings-row"><div class="settings-label"><strong>${title}</strong><span>${text}</span></div>${label ? `<button class="btn btn-secondary" type="button" data-action="${action}">${label}</button>` : ''}</div>`;
    if (!native) {
      const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
      const status = { granted: tr('Browser notifications are on.'), denied: tr('Browser notifications are blocked in this browser.'), unsupported: tr('This browser cannot show notifications.') }[permission];
      return row(tr('Browser reminders'), `${tr('Reminders appear while Dailo is open. Browser notifications are optional, and nothing arrives while the app is closed.')}${status ? ` ${status}` : ''}`, 'enable-notifications', permission === 'default' ? tr('Enable') : '');
    }
    const text = native.permission === 'granted' ? tr('Reminders arrive as notifications, even when Dailo is closed.')
      : native.permission === 'denied' ? tr('Notifications are off for Dailo. Turn them on in the phone settings.')
        : tr('Allow notifications so reminders arrive even when Dailo is closed.');
    const exact = native.permission === 'granted' && native.exact === 'denied'
      ? row(tr('Exact time'), tr('Android may deliver reminders a few minutes late. Allow exact alarms for Dailo.'), 'allow-exact-alarms', tr('Allow')) : '';
    return row(tr('Notifications'), text, 'enable-notifications', ['granted', 'denied'].includes(native.permission) ? '' : tr('Enable')) + exact;
  }

  // R37 (J): one line on the state of the data: what is kept, when the last backup was made, and a warning tone when
  // there is no recent backup or the storage can be cleared.
  function dataHealth(ctx, persistence, reminderDays) {
    const { state } = ctx;
    const count = list => (list || []).length;
    const library = count(state.notes) + count(state.resources);
    const parts = [trn(count(state.tasks), '{count} task', '{count} tasks'), trn(count(state.projects), '{count} project', '{count} projects'), trn(count(state.habits), '{count} habit', '{count} habits'), trn(library, '{count} note or resource', '{count} notes and resources')];
    const last = Date.parse(state.settings.backupStatus?.lastExport || '');
    const days = Number.isFinite(last) ? Math.max(0, Math.floor((Date.parse(ctx.nowIso?.() || new Date().toISOString()) - last) / 86400000)) : null;
    const backup = days === null ? tr('no backup yet') : days === 0 ? tr('backup today') : trn(days, 'backup {count} day ago', 'backup {count} days ago');
    const ok = days !== null && days <= Math.max(reminderDays || 7, 1) && ['granted', 'app'].includes(persistence.state);
    return `<div class="settings-row settings-health is-${ok ? 'ok' : 'warning'}"><div class="settings-label"><strong>${tr('Data health')}</strong><span>${parts.join(' · ')} · ${backup}</span></div></div>`;
  }

  // Keyboard shortcut rows (Računar).
  const SHORTCUT_ROWS = ctx => { const { state, shortcutLabels, esc } = ctx; return Object.entries(shortcutLabels).map(([key,label])=>`<div class="settings-row shortcut-row"><label class="settings-label" for="shortcut-${key}"><strong>${esc(tr(label))}</strong></label><input class="input shortcut-input" id="shortcut-${key}" data-shortcut="${key}" aria-label="${esc(tr('{command} shortcut', { command: tr(label) }))}" placeholder="${tr('Disabled')}" value="${esc(state.settings.shortcuts[key] || '')}" /><button class="btn btn-secondary" data-action="save-shortcut" data-command="${key}">${tr('Save')}</button><button class="btn btn-ghost" data-action="disable-shortcut" data-command="${key}">${tr('Disable')}</button></div>`).join(''); };

  function renderSettings(ctx) {
    const { state, pageHeader, shortcutError, esc } = ctx;
    const backupStatus = state.settings.backupStatus || {};
    const statusTime = value => statusTimeHtml(esc, value);
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
    const theme = ctx.readTheme?.() || 'dark';
    const themes = [['dark', tr('Dark')], ['light', tr('Light')], ['system', tr('Follow the system')]].map(([value, label]) => `<option value="${value}"${value === theme ? ' selected' : ''}>${label}</option>`).join('');
    const textSize = ctx.readTextSize?.() || 'normal';
    const textSizes = [['small', tr('Smaller')], ['normal', tr('Normal')], ['large', tr('Larger')], ['larger', tr('Largest')]].map(([value, label]) => `<option value="${value}"${value === textSize ? ' selected' : ''}>${label}</option>`).join('');
    const reminderOptions = [...new Set([0, 3, 7, 14, 30, reminderDays])].sort((a, b) => a - b)
      .map(days => `<option value="${days}"${days === reminderDays ? ' selected' : ''}>${days === 1 ? tr('Every day') : days ? trn(days, 'Every {count} day', 'Every {count} days') : tr('Off')}</option>`).join('');
    const release = ctx.release || {};
    const installed = Boolean(ctx.environmentInfo?.().standalone);
    // R32 (finding 31): the steps for the browser in use; Chromium offers its own install through "Instaliraj".
    const iPhone = /iPhone|iPad|iPod/.test(ctx.environmentInfo?.().userAgent || '');
    const canPrompt = !iPhone && Boolean(ctx.installPrompt?.());
    const installText = iPhone ? tr('On iPhone, in Safari tap Share, then Add to Home Screen, then Add. Install first and then start using Dailo: data in Safari and in the installed app are kept separately.')
      : canPrompt ? tr('Dailo opens like an app and works without internet.') : tr('In the browser menu, choose Install or Add to Home Screen.');
    const installButton = canPrompt ? `<button class="btn btn-secondary" type="button" data-action="install-app">${tr('Install')}</button>` : '';
    const reportHref = release.problemReportMailto?.({ email: release.REPORT_EMAIL, version: release.APP_VERSION, ...(ctx.environmentInfo?.() || {}) }) || null;
    const sundayFirst = state.settings.weekStartsOn === 0 || state.settings.weekStartsOn === 'sunday';
    const capacity = ctx.Core?.dailyCapacityMinutes ? ctx.Core.dailyCapacityMinutes(state.settings) : 360;
    // R12c (J6): the evening journal notice — off or a time; a time synced from elsewhere is listed too.
    // R18: the hour Dailo proposes for reminders (06:00–21:00, plus a stored time off the hour).
    const rawDefault = state.settings.defaultReminderTime;
    const defaultTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawDefault || '') ? rawDefault : '09:00';
    const defaultTimeOptions = [...new Set([...Array.from({ length: 16 }, (_, index) => `${String(index + 6).padStart(2, '0')}:00`), defaultTime])].sort()
      .map(time => `<option value="${time}"${time === defaultTime ? ' selected' : ''}>${time}</option>`).join('');
    const native = ctx.notificationSettings?.() || null;
    const autoBackup = ctx.readAutoBackup?.() || { enabled: false };
    const rawJournalTime = state.settings.journalReminderTime;
    const journalTime = rawJournalTime === null ? null : typeof rawJournalTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(rawJournalTime) ? rawJournalTime : '20:00';
    const journalOptions = `<option value="off"${journalTime ? '' : ' selected'}>${tr('Off')}</option>` + [...new Set(['19:00', '20:00', '21:00', '22:00', ...(journalTime ? [journalTime] : [])])].sort()
      .map(time => `<option value="${time}"${time === journalTime ? ' selected' : ''}>${esc(tr('From {time}', { time }))}</option>`).join('');
    const capacityOptions = [...new Set([0, 120, 240, 300, 360, 420, 480, 600, 720, capacity])].sort((a, b) => a - b)
      .map(minutes => `<option value="${minutes}"${minutes === capacity ? ' selected' : ''}>${minutes ? tr('{hours} h', { hours: new Intl.NumberFormat(I18n.locale(), { maximumFractionDigits: 1 }).format(minutes / 60) }) : tr('Off')}</option>`).join('');
    const sync = ctx.syncView?.() || { configured: false };
    const privacy = !sync.configured ? tr('Your data stays only on this device. Dailo has no server or account.')
      : sync.signedIn ? tr('Your data is on this device and in your sync account on a server in the EU. Attachments stay only on this device.')
        : tr('Your data stays only on this device until you sign in to sync.');
    // Redesign R10g (M5, M6): Opšte, Podaci, Pomoć and Računar (desktop only); a choice applies at once. R15 moved Nalog
    // to its own screen (renderAccount).
    return `${pageHeader(tr('Settings'), '', { add: false })}
      <section class="settings-card" data-settings-general>
        <h2>${tr('General')}</h2>
        <div class="settings-row"><label class="settings-label" for="preference-week-start"><strong>${tr('Week starts on')}</strong><span>${tr('Used by weekly views and habit periods.')}</span></label><select class="input" id="preference-week-start"><option value="monday"${!sundayFirst ? ' selected' : ''}>${tr('Monday')}</option><option value="sunday"${sundayFirst ? ' selected' : ''}>${tr('Sunday')}</option></select></div>
        <div class="settings-row"><label class="settings-label" for="daily-capacity"><strong>${tr('Daily capacity')}</strong><span>${tr('Planned work per day, compared with task durations in the Calendar day view.')}</span></label><select class="input" id="daily-capacity">${capacityOptions}</select></div>
        <div class="settings-row"><label class="settings-label" for="theme"><strong>${tr('Theme')}</strong><span>${tr('Only on this device.')}</span></label><select class="input" id="theme">${themes}</select></div>
        <div class="settings-row"><label class="settings-label" for="text-size"><strong>${tr('Text size')}</strong><span>${tr('Only on this device.')}</span></label><select class="input" id="text-size">${textSizes}</select></div>
      </section>
      <section class="settings-card" data-settings-reminders>
        <h2>${tr('Reminders')}</h2>
        ${reminderRows(native)}
        <div class="settings-row"><div class="settings-label"><strong>${tr('Test reminder')}</strong><span>${tr('A reminder arrives in five seconds, so you can see that notifications work.')}</span></div><button class="btn btn-secondary" type="button" data-action="test-reminder">${tr('Send')}</button></div>
        <div class="settings-row"><label class="settings-label" for="default-reminder-time"><strong>${tr('Default reminder time')}</strong><span>${tr('Used when Dailo proposes a reminder: tomorrow, the day before, new habits and goals.')}</span></label><select class="input" id="default-reminder-time">${defaultTimeOptions}</select></div>
        <div class="settings-row"><label class="settings-label" for="planned-time-reminders"><strong>${tr('Reminder at the planned time')}</strong><span>${tr('A task with a planned time reminds you then, even without its own reminder.')}</span></label><input id="planned-time-reminders" type="checkbox"${state.settings.plannedTimeReminders === true ? ' checked' : ''}></div>
        <div class="settings-row"><label class="settings-label" for="journal-reminder-time"><strong>${tr('Journal reminder')}</strong><span>${tr('When “Write down how the day went” appears on Today.')}</span></label><select class="input" id="journal-reminder-time">${journalOptions}</select></div>${native ? `
        <div class="settings-row settings-sub"><label class="settings-label" for="journal-notifications"><strong>${tr('Journal on the phone too')}</strong><span>${tr('The notification arrives even when Dailo is closed.')}</span></label><input id="journal-notifications" type="checkbox"${state.settings.journalNotifications === true ? ' checked' : ''}${journalTime ? '' : ' disabled'}></div>` : ''}
      </section>
      <section class="settings-card" data-settings-data>
        <h2>${tr('Data')}</h2>
        ${dataHealth(ctx, persistence, reminderDays)}
        <div class="settings-row"><div class="settings-label"><strong>${tr('Backup')}</strong><span>${tr('Last export:')} ${statusTime(backupStatus.lastExport)}${backupStatus.lastImport ? `<br>${tr('Last import:')} ${statusTime(backupStatus.lastImport)}` : ''}${backupStatus.snapshotAvailable ? `<br>${tr('Recovery snapshot:')} ${tr('Available')}` : ''}${backupStatus.validationResult && backupStatus.validationResult !== msg('Not yet validated') ? `<br>${tr('Validation:')} ${esc(trMessage(backupStatus.validationResult))}` : ''}</span></div><button class="btn btn-secondary" type="button" data-action="export-backup"><i class="ph ph-download-simple"></i> ${tr('Export ZIP')}</button></div>
${native ? `
        <div class="settings-row"><label class="settings-label" for="auto-backup"><strong>${tr('Automatic backup')}</strong><span>${tr('Once a week to Documents/Dailo on this phone; the newest four are kept.')}${autoBackup.lastAt ? `<br>${tr('Last copy:')} ${statusTime(autoBackup.lastAt)}` : ''}${autoBackup.error ? `<br>${esc(tr('Last attempt failed: {error}', { error: autoBackup.error }))}` : ''}</span></label><input id="auto-backup" type="checkbox"${autoBackup.enabled ? ' checked' : ''}></div>` : ''}
        <div class="settings-row settings-sub"><label class="settings-label" for="backup-reminder-days"><strong>${tr('Backup reminder')}</strong><span>${tr('Today reminds you to export a backup when the last one is older than this.')}</span></label><select class="input" id="backup-reminder-days">${reminderOptions}</select></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Restore from backup')}</strong><span>${tr('Validate a ZIP first, then replace current data only after you confirm.')}</span></div><div><button class="btn btn-secondary" type="button" data-action="import-backup"><i class="ph ph-upload-simple"></i> ${tr('Import ZIP')}</button><input id="backup-import-input" type="file" accept=".zip,application/zip" hidden /></div></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Local snapshots')}</strong><span>${tr('Five automatic copies, at most once every five minutes after saving. Restore one item with its files and history.')}</span></div><button class="btn btn-secondary" type="button" data-action="open-local-snapshots">${tr('Browse snapshots')}</button></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Persistent storage')}</strong><span data-storage-persistence="${esc(persistence.state)}">${esc(persistenceText)}${esc(usage)}</span></div>${persistence.state === 'denied' ? `<button class="btn btn-secondary" type="button" data-action="request-storage-persistence">${tr('Request')}</button>` : ''}</div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Populate demo workspace')}</strong><span>${tr('Add missing editable examples from everyday life: habits, goals, a bucket list, a camping packing list, recurring chores, tags, notes, resources and templates. Existing items and edits stay intact.')}</span></div><button class="btn btn-secondary" type="button" data-action="add-starter-examples">${tr('Populate workspace')}</button></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Reset app data')}</strong><span>${tr('A safety ZIP is created first, then local tasks, projects, tags, attachments and preferences are cleared.')}</span></div><button class="btn btn-ghost is-danger" type="button" data-action="reset-app">${tr('Reset')}</button></div>
      </section>
      <section class="settings-card" data-settings-about>
        <h2>${tr('Help')}</h2>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Guide')}</strong><span>${tr('How to install Dailo, keep backups and report problems.')}</span></div><a class="btn btn-secondary" href="uputstvo.html" target="_blank" rel="noopener" data-beta-guide>${tr('Open guide')}</a></div>
        ${reportHref ? `<div class="settings-row"><div class="settings-label"><strong>${tr('Report a problem')}</strong><span>${tr('Opens an e-mail with the app version and device details. Your data is not attached.')}</span></div><a class="btn btn-secondary" href="${esc(reportHref)}" data-report-problem>${tr('Report a problem')}</a></div>` : ''}
        ${installed ? '' : `<div class="settings-row"><div class="settings-label"><strong>${tr('Install app')}</strong><span data-install-status="browser">${installText}</span></div>${installButton}</div>`}
        <div class="settings-row"><div class="settings-label"><strong>${tr('Privacy')}</strong><span data-privacy-note>${privacy}</span></div></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('About')}</strong><span>Dailo ${esc(release.APP_VERSION || '')}</span></div></div>
      </section>
      <section class="settings-card settings-desktop" data-settings-desktop>
        <h2>${tr('Computer')}</h2>
        <p class="area-empty-copy">${tr('Use a letter or digit with optional Ctrl/Cmd, Alt and Shift. Leave disabled commands unassigned.')}</p>
        ${shortcutError()?`<p class="validation" role="alert">${esc(shortcutError())}</p>`:''}
        ${SHORTCUT_ROWS(ctx)}
        <button class="btn btn-secondary" data-action="reset-shortcuts">${tr('Reset to defaults')}</button>
        <div class="settings-row settings-wide-only"><label class="settings-label" for="preference-density"><strong>${tr('Compact density')}</strong><span>${tr('Keep task rows and controls tight.')}</span></label><input id="preference-density" type="checkbox" ${state.settings.compactDensity !== false ? 'checked' : ''}></div>
      </section>`;
  }

  // R42: "Proveri server" — what is set up on the server for sign-in and sync, and what is missing.
  function serverCheckHtml(esc, check) {
    const icons = { ok: 'check-circle', bad: 'warning-circle', info: 'info' };
    const item = (kind, text) => `<li class="is-${kind}"><i class="ph ph-${icons[kind]}" aria-hidden="true"></i><span>${tr(text)}</span></li>`;
    const result = check?.result;
    const items = !result ? [] : [
      result.key ? item('ok', msg('The server accepts the app key.')) : item('bad', msg('The server does not accept the app key.')),
      result.tables === 'ok' ? item('ok', msg('The sync tables are in place.')) : result.tables === 'missing' ? item('bad', msg('The sync tables are missing on the server. Run 0001_sync.sql and 0002_journal.sql in Supabase.')) : item('info', msg('The sync tables could not be checked.')),
      ...(result.key ? [
        result.signup ? item('ok', msg('Registration is on.')) : item('bad', msg('Registration is turned off on the server.')),
        item('info', result.confirm ? msg('New accounts confirm their e-mail address with a code.') : msg('New accounts are confirmed without an e-mail.')),
        result.google ? item('ok', msg('Sign-in with Google is on.')) : item('info', msg('Sign-in with Google is not turned on yet.')),
        result.apple ? item('ok', msg('Sign-in with Apple is on.')) : item('info', msg('Sign-in with Apple is not turned on yet.')),
      ] : []),
      item('info', msg('The e-mail templates and SMTP cannot be checked from the app; the setup guide lists them.')),
    ];
    const running = Boolean(check?.running);
    const error = check?.error ? `<p class="validation" role="alert">${esc(trMessage(check.error))}</p>` : '';
    return `<div class="server-check" data-server-check><div class="settings-row"><div class="settings-label"><strong>${tr('Server')}</strong><span>${tr('Check that the server is ready for sign-in and sync.')}</span></div><button class="btn btn-secondary" type="button" data-action="sync-check-server"${running ? ' disabled' : ''}>${running ? tr('Checking…') : tr('Check the server')}</button></div>${error}${items.length ? `<ul class="server-check-list">${items.join('')}</ul>` : ''}</div>`;
  }

  // R15 (M5 amended): the Nalog screen, opened from its tile in Još. With sync set up it holds the sign-in, the last
  // sync and the account actions that used to sit in Podešavanja; without it, it says the data stays on this device.
  function renderAccount(ctx) {
    const { pageHeader, esc } = ctx;
    const sync = ctx.syncView?.() || { configured: false };
    const statusTime = value => statusTimeHtml(esc, value);
    const subtitle = sync.configured && sync.signedIn ? sync.email : sync.configured ? '' : tr('Data is on this device only');
    const card = !sync.configured ? `
      <section class="settings-card" data-account-local>
        <h2>${tr('This device')}</h2>
        <p class="area-empty-copy">${tr('Sync is not set up yet, so there is no account to sign in to.')} ${tr('Everything stays only on this device. Backups are in Settings → Data.')}</p>
        <div class="sync-actions"><button class="btn btn-secondary" type="button" data-route="settings">${tr('Settings')}</button></div>
      </section>` : `
      <section class="settings-card" data-settings-sync>
        <h2>${tr('Account')}</h2>
        ${sync.signedIn ? `<div class="settings-row"><div class="settings-label"><strong>${tr('Account')}</strong><span>${sync.name ? `${esc(sync.name)} · ` : ''}${esc(sync.email)}</span></div></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Password')}</strong><span>${tr('Changing it signs out your other devices.')}</span></div><button class="btn btn-secondary" type="button" data-action="account-change-password">${tr('Change')}</button></div><div class="settings-row"><div class="settings-label"><strong>${tr('E-mail address')}</strong><span>${esc(sync.email)}</span></div><button class="btn btn-secondary" type="button" data-action="account-change-email">${tr('Change')}</button></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Last sync')}</strong><span data-sync-status>${sync.running ? tr('Syncing…') : statusTime(sync.lastSyncAt)}${sync.lastError ? `<br><span class="validation" role="alert">${esc(trMessage(sync.lastError))}</span>` : ''}</span></div><button class="btn btn-secondary" type="button" data-action="sync-now"${sync.running ? ' disabled' : ''}><i class="ph ph-arrows-clockwise"></i> ${tr('Sync now')}</button></div>
        <p class="area-empty-copy">${tr('Tasks, projects, goals, habits, notes and settings sync between your devices. Attachments stay on the device where they were added.')}</p>
        <div class="sync-actions"><button class="btn btn-secondary" type="button" data-action="sync-sign-out">${tr('Sign out')}</button><button class="btn btn-ghost is-danger" type="button" data-action="sync-delete-account">${tr('Delete account')}</button></div>`
        : `<p class="area-empty-copy">${tr('Sign in to have your tasks, habits and goals on all your devices. Without an account, everything stays only on this device.')}</p>
        <div class="sync-actions"><button class="btn btn-primary" type="button" data-action="open-welcome" data-mode="sign-in">${tr('Log in')}</button><button class="btn btn-secondary" type="button" data-action="open-welcome" data-mode="sign-up">${tr('Create account')}</button></div>`}
        ${serverCheckHtml(esc, sync.serverCheck)}
      </section>`;
    return `${pageHeader(tr('Account'), subtitle, { add: false })}${card}`;
  }

  // R40: the first screen and "Prijavi se" / "Napravi nalog" on Nalog, after the user's two mockups. One window in
  // five steps: sign-in, sign-up, the code that confirms an account, and a new password (e-mail, then code).
  const WELCOME_TEXT = {
    'sign-in': [msg('A more organized day'), msg('Turn your goals into daily progress.'), msg('Log in')],
    'sign-up': [msg('Create your account'), msg('A more organized day starts here.'), msg('Create account')],
    confirm: [msg('Confirm your e-mail address'), '', msg('Confirm')],
    reset: [msg('New password'), msg('Enter your e-mail address and we will send you a code.'), msg('Send code')],
    'reset-code': [msg('New password'), '', msg('Save the password')],
  };
  // Brand names, the same in every language.
  const PROVIDER_NAMES = { apple: 'Apple', google: 'Google' };
  function renderWelcome(ctx) {
    const { esc, modalState: welcome } = ctx;
    const mode = WELCOME_TEXT[welcome.mode] ? welcome.mode : 'sign-in';
    const [title, lead, submit] = WELCOME_TEXT[mode];
    const sentLead = tr('We sent a code to {email}.', { email: esc(welcome.email) });
    const shown = Boolean(welcome.showPassword);
    const field = (id, icon, label, attrs, value, extra = '') => `<div class="welcome-field"><i class="ph ph-${icon}" aria-hidden="true"></i><label class="sr-only" for="${id}">${label}</label><input class="welcome-input" id="${id}" ${attrs} placeholder="${label}" value="${esc(value)}" />${extra}</div>`;
    const eye = `<button class="welcome-eye" type="button" data-action="welcome-toggle-password" aria-label="${shown ? tr('Hide password') : tr('Show password')}" aria-pressed="${shown}"><i class="ph ph-${shown ? 'eye-slash' : 'eye'}" aria-hidden="true"></i></button>`;
    const passwordType = `type="${shown ? 'text' : 'password'}"`;
    const email = field('welcome-email', 'envelope-simple', tr('E-mail address'), 'type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false"', welcome.email);
    const code = field('welcome-code', 'key', tr('Code from the e-mail'), 'inputmode="numeric" autocomplete="one-time-code" maxlength="10"', welcome.code);
    const newPassword = label => `${field('welcome-password', 'lock-simple', label, `${passwordType} autocomplete="new-password" aria-describedby="welcome-password-hint"`, welcome.password, eye)}<p class="welcome-hint" id="welcome-password-hint">${tr('At least 8 characters, with a digit and a letter')}</p>${field('welcome-password-confirm', 'lock-simple', tr('Confirm password'), `${passwordType} autocomplete="new-password"`, welcome.confirm, eye)}`;
    const fields = {
      'sign-in': `${email}${field('welcome-password', 'lock-simple', tr('Password'), `${passwordType} autocomplete="current-password"`, welcome.password, eye)}<button class="welcome-link" type="button" data-action="welcome-mode" data-mode="reset">${tr('Forgot password?')}</button>`,
      'sign-up': `${field('welcome-name', 'user', tr('Full name'), 'type="text" autocomplete="name"', welcome.name)}${email}${newPassword(tr('Password'))}<label class="welcome-terms"><input id="welcome-terms" type="checkbox"${welcome.terms ? ' checked' : ''} /><span>${tr('I accept {terms} and {privacy}', { terms: `<a href="uslovi.html" target="_blank" rel="noopener">${tr('the Terms of Use')}</a>`, privacy: `<a href="privatnost.html" target="_blank" rel="noopener">${tr('the Privacy Policy')}</a>` })}</span></label>`,
      confirm: code,
      reset: email,
      'reset-code': `${code}${newPassword(tr('New password'))}`,
    }[mode];
    const error = welcome.error ? `<p class="validation" role="alert">${esc(trMessage(welcome.error))}</p>` : '';
    const provider = (name, label, icon, wide) => `<button class="welcome-provider${wide ? ' is-wide' : ''}" type="button" data-action="welcome-provider" data-provider="${name}" aria-label="${label}">${icon}${wide ? `<span>${PROVIDER_NAMES[name]}</span>` : ''}</button>`;
    const providers = wide => `<p class="welcome-divider">${tr('or continue with')}</p><div class="welcome-providers">${provider('apple', tr('Continue with Apple'), '<i class="ph-fill ph-apple-logo" aria-hidden="true"></i>', wide)}${provider('google', tr('Continue with Google'), '<img src="icons/google.svg" alt="" width="24" height="24" />', wide)}</div>`;
    const resend = `<button class="welcome-link is-centered" type="button" data-action="welcome-resend">${tr('Send a new code')}</button>`;
    const after = {
      'sign-in': `${providers(false)}<button class="welcome-switch" type="button" data-action="welcome-mode" data-mode="sign-up"><span>${tr('No account yet?')}</span> <strong>${tr('Sign up')}</strong></button><button class="welcome-skip" type="button" data-action="welcome-skip">${tr('Continue without an account')}</button><p class="welcome-note">${tr('Without an account, everything stays only on this device.')}</p>`,
      'sign-up': `${providers(true)}<button class="welcome-switch" type="button" data-action="welcome-mode" data-mode="sign-in"><span>${tr('Already have an account?')}</span> <strong>${tr('Log in')}</strong></button>`,
      confirm: `${resend}<p class="welcome-note">${tr('The link in the message confirms the account too; then sign in.')}</p>`,
      reset: '',
      'reset-code': resend,
    }[mode];
    const back = mode === 'sign-in' ? '' : `<button class="welcome-back" type="button" data-action="welcome-mode" data-mode="sign-in" aria-label="${tr('Back to sign-in')}"><i class="ph ph-caret-left" aria-hidden="true"></i></button>`;
    const intro = `<div class="welcome-intro${mode === 'sign-in' ? '' : ' is-left'}"><h2 class="welcome-title" id="welcome-title">${tr(title)}</h2><p class="welcome-lead">${['confirm', 'reset-code'].includes(mode) ? sentLead : tr(lead)}</p></div>`;
    return ctx.modalFrame(`<div class="welcome-waves" aria-hidden="true"></div><div class="welcome-column">${back}<div class="welcome-brand"><img class="welcome-logo" src="icons/icon.svg" alt="" width="72" height="72" /><p class="welcome-wordmark">Dailo</p><p class="welcome-tagline">${tr('Plan. Focus. Do more.')}</p></div>${intro}<form class="welcome-form" data-welcome-form novalidate>${fields}${error}<button class="btn btn-primary welcome-submit" type="submit"${welcome.busy ? ' disabled' : ''}>${tr(submit)}</button></form>${after}</div>`, 'welcome-screen', 'aria-labelledby="welcome-title"');
  }

  // R43: "Promeni lozinku" and "Promeni e-adresu" as sheets with a form (Enter sends it, password managers see it).
  function renderAccountWindow(ctx) {
    const { esc, modalState: win } = ctx;
    const field = (id, icon, label, attrs, value) => `<label class="sheet-field"><i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span><input id="${id}" class="input" ${attrs} value="${esc(value)}" /></label>`;
    const code = field('account-code', 'key', tr('Code from the e-mail'), 'inputmode="numeric" autocomplete="one-time-code" maxlength="10"', win.code);
    const error = win.error ? `<p class="validation" role="alert">${esc(trMessage(win.error))}</p>` : '';
    const isPassword = win.type === 'account-password';
    let copy; let fields; let submit;
    if (isPassword) {
      copy = tr('Other devices will need to sign in again.');
      fields = `${win.step === 'current' ? field('account-current', 'lock-simple', tr('Current password'), 'type="password" autocomplete="current-password"', win.current) : ''}${field('account-password', 'lock-simple', tr('New password'), 'type="password" autocomplete="new-password" aria-describedby="account-password-hint"', win.password)}<p class="sheet-note" id="account-password-hint">${tr('At least 8 characters, with a digit and a letter')}</p>${field('account-password-confirm', 'lock-simple', tr('Confirm password'), 'type="password" autocomplete="new-password"', win.confirm)}${win.step === 'nonce' ? `<p class="sheet-note">${tr('We sent a code to {email} to confirm the change.', { email: esc(win.currentEmail) })}</p>${code}` : ''}`;
      submit = tr('Save the password');
    } else if (win.step === 'email') {
      copy = tr('Current address: {email}', { email: esc(win.currentEmail) });
      fields = field('account-email', 'envelope-simple', tr('New e-mail address'), 'type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false"', win.email);
      submit = tr('Send code');
    } else {
      copy = win.pending ? tr('One address is confirmed. Enter the code from the other message.') : tr('We sent a code to {email}. If the server also asks to confirm the current address, a code arrives there too.', { email: esc(win.email) });
      fields = code;
      submit = tr('Confirm');
    }
    const title = isPassword ? tr('Change the password') : tr('Change the e-mail address');
    return ctx.modalFrame(`<div class="modal-inner quick-sheet"><div class="modal-header"><h2 class="modal-title">${title}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><p class="dialog-copy">${copy}</p><form class="account-form" data-account-form novalidate>${fields}${error}<div class="quick-sheet-footer"><button class="btn btn-primary habit-window-save" type="submit"${win.busy ? ' disabled' : ''}>${submit}</button></div></form></div>`, 'quick');
  }

  window.TodoDomainModules?.register({
    name: 'settings',
    renderRoute(route, ctx) {
      if (route.type === 'settings') return renderSettings(ctx);
      if (route.type === 'account') return renderAccount(ctx);
      if (route.type === 'modal' && route.modalType === 'welcome') return renderWelcome(ctx);
      if (route.type === 'modal' && ['account-password', 'account-email'].includes(route.modalType)) return renderAccountWindow(ctx);
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
