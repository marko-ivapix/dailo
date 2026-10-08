(function () {
  'use strict';

  const I18n = window.TodoI18n;
  const { tr, trn, trMessage, msg } = I18n;

  function renderSettings(ctx) {
    const { state, pageHeader, shortcutLabels, shortcutError, notificationButtonLabel, esc } = ctx;
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
    }[persistence.state] || tr('Checking…');
    const megabytes = bytes => `${new Intl.NumberFormat(I18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1048576)} MB`;
    const usage = Number.isFinite(persistence.usage) && Number.isFinite(persistence.quota) ? ` ${tr('{used} of {total} used.', { used: megabytes(persistence.usage), total: megabytes(persistence.quota) })}` : '';
    const reminderDays = ctx.Core?.backupReminderDays ? ctx.Core.backupReminderDays(state.settings) : 7;
    const reminderOptions = [...new Set([0, 3, 7, 14, 30, reminderDays])].sort((a, b) => a - b)
      .map(days => `<option value="${days}"${days === reminderDays ? ' selected' : ''}>${days === 1 ? tr('Every day') : days ? trn(days, 'Every {count} day', 'Every {count} days') : tr('Off')}</option>`).join('');
    const release = ctx.release || {};
    const installed = Boolean(ctx.environmentInfo?.().standalone);
    const reportHref = release.problemReportMailto?.({ email: release.REPORT_EMAIL, version: release.APP_VERSION, ...(ctx.environmentInfo?.() || {}) }) || null;
    const todayFilters = [['all', msg('All')], ['open', msg('Open')], ['completed', msg('Completed')], ['important', msg('Important')], ['dueToday', msg('Due today')]];
    const todayCards = [['focus', msg('Daily focus')], ['review', msg('Daily review')], ['actions', msg('Daily actions')]];
    const sundayFirst = state.settings.weekStartsOn === 0 || state.settings.weekStartsOn === 'sunday';
    return `${pageHeader(tr('Settings'), tr('Preferences and local data'), { add: false })}
      <section class="settings-card">
        <h2>${tr('General')}</h2>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Install app')}</strong>${installed
          ? `<span data-install-status="installed">${tr('Installed. Dailo opens from your Home Screen like an app.')}</span>`
          : `<span data-install-status="browser">${tr('On iPhone, in Safari tap Share, then Add to Home Screen, then Add. Install first and then start using Dailo: data in Safari and in the installed app are kept separately.')}</span>`}</div></div>
        <div class="settings-row">
          <div class="settings-label"><strong>${tr('Theme')}</strong><span>${tr('The dark theme is currently the only one.')}</span></div>
          <button class="btn btn-secondary" type="button" disabled aria-disabled="true">${tr('Dark')}</button>
        </div>
      </section>
      <section class="settings-card">
        <h2>${tr('Keyboard shortcuts')}</h2>
        <p class="area-empty-copy">${tr('Use a letter or digit with optional Ctrl/Cmd, Alt and Shift. Leave disabled commands unassigned.')}</p>
        ${shortcutError()?`<p class="validation" role="alert">${esc(shortcutError())}</p>`:''}
        ${Object.entries(shortcutLabels).map(([key,label])=>`<div class="settings-row shortcut-row"><label class="settings-label" for="shortcut-${key}"><strong>${esc(tr(label))}</strong></label><input class="input shortcut-input" id="shortcut-${key}" data-shortcut="${key}" aria-label="${esc(tr('{command} shortcut', { command: tr(label) }))}" placeholder="${tr('Disabled')}" value="${esc(state.settings.shortcuts[key] || '')}" /><button class="btn btn-secondary" data-action="save-shortcut" data-command="${key}">${tr('Save')}</button><button class="btn btn-ghost" data-action="disable-shortcut" data-command="${key}">${tr('Disable')}</button></div>`).join('')}
        <button class="btn btn-secondary" data-action="reset-shortcuts">${tr('Reset to defaults')}</button>
      </section>
      <section class="settings-card">
        <h2>${tr('Personalization')}</h2>
        <div class="settings-row"><label class="settings-label" for="preference-density"><strong>${tr('Compact density')}</strong><span>${tr('Keep task rows and controls tight.')}</span></label><input id="preference-density" type="checkbox" ${state.settings.compactDensity !== false ? 'checked' : ''}></div>
        <div class="settings-row"><label class="settings-label" for="preference-today-filter"><strong>${tr('Default Today filter')}</strong><span>${tr('Choose what Today shows when you return.')}</span></label><select class="input" id="preference-today-filter">${todayFilters.map(([value, label]) => `<option value="${value}"${state.settings.todayFocusFilter === value ? ' selected' : ''}>${tr(label)}</option>`).join('')}</select></div>
        <div class="settings-row"><label class="settings-label" for="preference-week-start"><strong>${tr('Week starts on')}</strong><span>${tr('Used by weekly views and habit periods.')}</span></label><select class="input" id="preference-week-start"><option value="monday"${!sundayFirst ? ' selected' : ''}>${tr('Monday')}</option><option value="sunday"${sundayFirst ? ' selected' : ''}>${tr('Sunday')}</option></select></div>
        <fieldset class="settings-row"><legend class="settings-label"><strong>${tr('Today cards')}</strong><span>${tr('Choose the dashboard cards you want to see.')}</span></legend>${todayCards.map(([value, label]) => `<label><input type="checkbox" data-preference-today-section value="${value}" ${(state.settings.todayVisibleSections || []).includes(value) ? 'checked' : ''}> ${tr(label)}</label>`).join('')}</fieldset>
        <div class="settings-row"><label class="settings-label" for="preference-focus-strip"><strong>${tr('Today summary')}</strong><span>${tr('Show the compact open, completed and planned summary.')}</span></label><input id="preference-focus-strip" type="checkbox" ${state.settings.todayFocusStrip !== false ? 'checked' : ''}></div>
        <button class="btn btn-secondary" type="button" data-action="save-personalization">${tr('Save preferences')}</button> <button class="btn btn-ghost" type="button" data-action="reset-personalization">${tr('Reset personalization')}</button>
      </section>
      <section class="settings-card">
        <h2>${tr('Notifications')}</h2>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Browser reminders')}</strong><span>${tr('Reminders appear while Dailo is open. Browser notifications are optional, and nothing arrives while the app is closed.')}</span></div><button class="btn btn-secondary" type="button" data-action="enable-notifications">${notificationButtonLabel()}</button></div>
      </section>
      <section class="settings-card">
        <h2>${tr('Data')}</h2>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Backup status')}</strong><span>${tr('Last export:')} ${statusTime(backupStatus.lastExport)}<br>${tr('Last import:')} ${statusTime(backupStatus.lastImport)}<br>${tr('Recovery snapshot:')} ${backupStatus.snapshotAvailable ? tr('Available') : tr('None pending')}<br>${tr('Validation:')} ${esc(trMessage(backupStatus.validationResult || msg('Not yet validated')))}</span></div></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Persistent storage')}</strong><span data-storage-persistence="${esc(persistence.state)}">${esc(persistenceText)}${esc(usage)}</span></div>${persistence.state === 'denied' ? `<button class="btn btn-secondary" type="button" data-action="request-storage-persistence">${tr('Request')}</button>` : ''}</div>
        <div class="settings-row"><label class="settings-label" for="backup-reminder-days"><strong>${tr('Backup reminder')}</strong><span>${tr('Today reminds you to export a backup when the last one is older than this.')}</span></label><select class="input" id="backup-reminder-days">${reminderOptions}</select></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Local snapshots')}</strong><span>${tr('Five automatic copies, at most once every five minutes after saving. Restore one item with its files and history.')}</span></div><button class="btn btn-secondary" type="button" data-action="open-local-snapshots">${tr('Browse snapshots')}</button></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Export backup')}</strong><span>${tr('Download a portable ZIP with all local data, including Notes, Resources and files.')}</span></div><button class="btn btn-secondary" type="button" data-action="export-backup"><i class="ph ph-download-simple"></i> ${tr('Export ZIP')}</button></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Import backup')}</strong><span>${tr('Validate a ZIP first, then replace current data only after you confirm.')}</span></div><div><button class="btn btn-secondary" type="button" data-action="import-backup"><i class="ph ph-upload-simple"></i> ${tr('Import ZIP')}</button><input id="backup-import-input" type="file" accept=".zip,application/zip" hidden /></div></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Populate demo workspace')}</strong><span>${tr('Add missing editable examples across Areas, Projects, Tasks, Goals, Habits, Cleaning, Tags, Notes and Resources. Existing items and edits stay intact.')}</span></div><button class="btn btn-secondary" type="button" data-action="add-starter-examples">${tr('Populate workspace')}</button></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Clear completed tasks')}</strong><span>${tr('Permanently delete all completed tasks and their attachments.')}</span></div><button class="btn btn-secondary" type="button" data-action="clear-completed">${tr('Clear')}</button></div>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Reset app data')}</strong><span>${tr('A safety ZIP is created first, then local tasks, projects, tags, attachments and preferences are cleared.')}</span></div><button class="btn btn-ghost" type="button" data-action="reset-app" style="color:var(--danger)">${tr('Reset')}</button></div>
      </section>
      <section class="settings-card" data-settings-about>
        <h2>${tr('About')}</h2>
        <div class="settings-row"><div class="settings-label"><strong>${tr('Version')}</strong><span>Dailo ${esc(release.APP_VERSION || '')}</span></div></div>
        ${reportHref ? `<div class="settings-row"><div class="settings-label"><strong>${tr('Report a problem')}</strong><span>${tr('Opens an e-mail with the app version and device details. Your data is not attached.')}</span></div><a class="btn btn-secondary" href="${esc(reportHref)}" data-report-problem>${tr('Report a problem')}</a></div>` : ''}
        <div class="settings-row"><div class="settings-label"><strong>${tr('Privacy')}</strong><span data-privacy-note>${tr('Your data stays only on this device. Dailo has no server or account.')}</span></div></div>
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
      else if (action === 'save-personalization') ctx.savePersonalization();
      else if (action === 'reset-personalization') ctx.resetPersonalization();
      else return false;
      return true;
    }
  });
})();
