(function () {
  'use strict';
  const { tr, msg } = window.TodoI18n;

  // R102: the command palette (Ctrl/Cmd+K). Actions and screens are found by typing, folded like every search
  // (Core.searchFold: case, diacritics, Cyrillic); with words typed it also offers Pretraga for them, so global Search
  // keeps its own ranking and scope. ↑ ↓ choose, Enter runs, Escape closes (as every window).
  const ACTIONS = [
    ['new-task', msg('New task'), 'ph-plus'], ['new-project', msg('New project'), 'ph-folder-plus'],
    ['new-habit', msg('New habit'), 'ph-repeat'], ['new-note', msg('New note'), 'ph-note-pencil'],
  ];
  const SCREENS = [
    ['today', msg('Today'), 'ph-sun'], ['inbox', msg('Inbox'), 'ph-tray'], ['tasks', msg('Tasks'), 'ph-list-checks'], ['calendar', msg('Calendar'), 'ph-calendar-blank'],
    ['habits', msg('Habits'), 'ph-repeat'], ['upcoming', msg('Upcoming'), 'ph-calendar-dots'], ['anytime', msg('Anytime'), 'ph-stack'], ['projects', msg('Projects'), 'ph-folder'],
    ['goals', msg('Goals'), 'ph-target'], ['areas', msg('Areas'), 'ph-squares-four'], ['cleaning', msg('Recurring tasks'), 'ph-arrows-clockwise'], ['notes', msg('Notes'), 'ph-note'],
    ['resources', msg('Resources'), 'ph-link'], ['journal', msg('Journal'), 'ph-book-open'], ['tags', msg('Tags'), 'ph-tag'], ['saved-views', msg('Saved Views'), 'ph-funnel'],
    ['review', msg('Weekly review'), 'ph-clipboard-text'], ['completed', msg('Completed tasks'), 'ph-check-circle'], ['archived', msg('Archived Projects'), 'ph-archive'],
    ['settings', msg('Settings'), 'ph-gear'], ['account', msg('Account'), 'ph-user-circle'],
  ];
  const KINDS = { action: msg('Action'), screen: msg('Screen'), search: msg('Search') };

  function commands(ctx) {
    const query = String(ctx.modalState?.query || '');
    const fold = ctx.Core.searchFold;
    const words = fold(query).split(/\s+/).filter(Boolean);
    const all = [...ACTIONS.map(([id, label, icon]) => ({ kind: 'action', id, label: tr(label), icon })), ...SCREENS.map(([id, label, icon]) => ({ kind: 'screen', id, label: tr(label), icon }))];
    const found = all.filter(item => words.every(word => fold(item.label).includes(word)));
    return query.trim() ? [...found, { kind: 'search', id: 'search', label: tr('Search for “{query}”', { query: query.trim() }), icon: 'ph-magnifying-glass' }] : found;
  }

  const selectedIndex = (ctx, count) => Math.max(0, Math.min(Number(ctx.modalState?.selected) || 0, count - 1));

  function listHtml(ctx) {
    const items = commands(ctx);
    const selected = selectedIndex(ctx, items.length);
    return items.map((item, index) => `<button class="palette-row${index === selected ? ' is-active' : ''}" type="button" id="palette-item-${index}" role="option" aria-selected="${index === selected}" data-action="palette-run" data-index="${index}"><i class="ph ${item.icon}" aria-hidden="true"></i><span class="palette-label">${ctx.esc(item.label)}</span><span class="palette-kind">${tr(KINDS[item.kind])}</span></button>`).join('');
  }

  function renderPalette(ctx) {
    const selected = selectedIndex(ctx, commands(ctx).length);
    return ctx.modalFrame(`<div class="modal-inner quick-sheet palette-window"><label class="search-box"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input id="palette-query" class="search-input" type="text" autocomplete="off" placeholder="${tr('Type a screen or an action')}" value="${ctx.esc(ctx.modalState.query || '')}" aria-label="${tr('Command palette')}" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant="palette-item-${selected}"></label><div id="palette-list" class="palette-list" role="listbox" aria-label="${tr('Command palette')}">${listHtml(ctx)}</div><p class="sheet-note palette-hint">${tr('↑ ↓ to choose, Enter to open, Esc to close.')}</p></div>`, 'quick');
  }

  // Typing and the arrows redraw only the list, so the field keeps its focus and caret.
  function refresh(ctx) {
    const list = ctx.$('#palette-list');
    if (!list) { ctx.renderModal(); return; }
    list.innerHTML = listHtml(ctx);
    ctx.$('#palette-query')?.setAttribute('aria-activedescendant', `palette-item-${selectedIndex(ctx, commands(ctx).length)}`);
    ctx.$('#palette-list .is-active')?.scrollIntoView?.({ block: 'nearest' });
  }

  function run(ctx, index) {
    const items = commands(ctx);
    const item = items[Number.isInteger(index) ? index : selectedIndex(ctx, items.length)];
    if (!item) return;
    const query = String(ctx.modalState.query || '').trim();
    ctx.closeModal();
    if (item.kind === 'screen') ctx.navigate(item.id);
    else if (item.kind === 'search') ctx.openSearch(query);
    else if (item.id === 'new-task') ctx.openQuickAdd();
    else if (item.id === 'new-project') ctx.openProjectModal();
    else if (item.id === 'new-habit') ctx.openHabitModal();
    else if (item.id === 'new-note') ctx.openKnowledgeWindow('note');
  }

  window.TodoDomainModules?.register({
    name: 'palette',
    renderRoute(route, ctx) {
      if (route.type === 'modal' && route.modalType === 'palette') return renderPalette(ctx);
    },
    handleInput(event, ctx) {
      if (ctx.modalState?.type !== 'palette' || event.target?.id !== 'palette-query') return false;
      if (event.type === 'input') { ctx.modalState.query = event.target.value; ctx.modalState.selected = 0; refresh(ctx); return true; }
      if (event.type !== 'keydown') return false;
      const count = commands(ctx).length;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        ctx.modalState.selected = (selectedIndex(ctx, count) + (event.key === 'ArrowDown' ? 1 : count - 1)) % Math.max(count, 1);
        refresh(ctx);
        return true;
      }
      if (event.key === 'Enter') { event.preventDefault(); run(ctx); return true; }
      return false;
    },
    handleAction(action, event, ctx) {
      if (action !== 'palette-run' || ctx.modalState?.type !== 'palette') return false;
      run(ctx, Number(event.target.closest('[data-action]')?.dataset.index));
      return true;
    }
  });
})();
