(function () {
  'use strict';

  function renderSettings(ctx) {
    const { state, pageHeader, shortcutLabels, shortcutError, notificationButtonLabel, esc } = ctx;
    return `${pageHeader('Settings', 'Prototype preferences and local data', { add: false })}
      <section class="settings-card">
        <h2>General</h2>
        <div class="settings-row">
          <div class="settings-label"><strong>Week starts on</strong><span>Used for date grouping and future calendar behavior.</span></div>
          <button class="btn btn-secondary" type="button" disabled aria-disabled="true">Monday</button>
        </div>
        <div class="settings-row">
          <div class="settings-label"><strong>Theme</strong><span>Dark is the approved MVP theme.</span></div>
          <button class="btn btn-secondary" type="button" disabled aria-disabled="true">Dark</button>
        </div>
      </section>
      <section class="settings-card">
        <h2>Keyboard shortcuts</h2>
        <p class="area-empty-copy">Use a letter or digit with optional Ctrl/Cmd, Alt and Shift. Leave disabled commands unassigned.</p>
        ${shortcutError()?`<p class="validation" role="alert">${esc(shortcutError())}</p>`:''}
        ${Object.entries(shortcutLabels).map(([key,label])=>`<div class="settings-row shortcut-row"><label class="settings-label" for="shortcut-${key}"><strong>${label}</strong></label><input class="input shortcut-input" id="shortcut-${key}" data-shortcut="${key}" aria-label="${label} shortcut" placeholder="Disabled" value="${esc(state.settings.shortcuts[key] || '')}" /><button class="btn btn-secondary" data-action="save-shortcut" data-command="${key}">Save</button><button class="btn btn-ghost" data-action="disable-shortcut" data-command="${key}">Disable</button></div>`).join('')}
        <button class="btn btn-secondary" data-action="reset-shortcuts">Reset to defaults</button>
      </section>
      <section class="settings-card">
        <h2>Notifications</h2>
        <div class="settings-row"><div class="settings-label"><strong>Browser reminders</strong><span>In-app reminders always work while the prototype is open. Browser notifications are optional.</span></div><button class="btn btn-secondary" type="button" data-action="enable-notifications">${notificationButtonLabel()}</button></div>
      </section>
      <section class="settings-card">
        <h2>Data</h2>
        <div class="settings-row"><div class="settings-label"><strong>Export backup</strong><span>Download a portable ZIP with all local data, including Notes, Resources and files.</span></div><button class="btn btn-secondary" type="button" data-action="export-backup"><i class="ph ph-download-simple"></i> Export ZIP</button></div>
        <div class="settings-row"><div class="settings-label"><strong>Import backup</strong><span>Validate a ZIP first, then replace current data only after you confirm.</span></div><div><button class="btn btn-secondary" type="button" data-action="import-backup"><i class="ph ph-upload-simple"></i> Import ZIP</button><input id="backup-import-input" type="file" accept=".zip,application/zip" hidden /></div></div>
        <div class="settings-row"><div class="settings-label"><strong>Populate demo workspace</strong><span>Add missing editable examples across Areas, Projects, Tasks, Goals, Habits, Cleaning, Tags, Notes and Resources. Existing items and edits stay intact.</span></div><button class="btn btn-secondary" type="button" data-action="add-starter-examples">Populate workspace</button></div>
        <div class="settings-row"><div class="settings-label"><strong>Clear completed tasks</strong><span>Permanently delete all completed tasks and their attachments.</span></div><button class="btn btn-secondary" type="button" data-action="clear-completed">Clear</button></div>
        <div class="settings-row"><div class="settings-label"><strong>Reset app data</strong><span>A safety ZIP is created first, then local tasks, projects, tags, attachments and preferences are cleared.</span></div><button class="btn btn-ghost" type="button" data-action="reset-app" style="color:var(--danger)">Reset</button></div>
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
