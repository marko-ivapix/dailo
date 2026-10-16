(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, msg } = I18n;

  // Drag, swipe and long press, a module since R110 (plan part 1): task swipes, touch reordering, the calendar's
  // hold-and-drag, the Navike week swipe, mouse drag and drop with its drops on the sidebar and on calendar days, and
  // the long press. They are event handlers, so the module answers no route or action: attach(ctx) wires its listeners
  // once from app.js's attachEvents, and isDragging() tells app.js to hold a pulled sync while a drag is under way.
  let dragState = null;
  let taskSwipeState = null;
  // R44: a horizontal swipe over the week bar or the rings on Navike (start point), and the click it must swallow.
  let weekSwipe = null;
  let suppressWeekSwipeClick = false;
  let suppressTaskSwipeClick = false;
  let touchReorder = null;

  // The app's helpers, from the domain context that attach() receives; the handlers call them as they did in app.js.
  let Core, $$, getTask, getProject, currentRoute, haptic, toggleComplete, openPlanPicker, reorderTasks, reorderSubtasks, dropGroup;
  let receiveAttachmentFiles, addTaskToToday, moveTaskToTomorrow, requestTaskEdit, setUndo, nowIso, saveState, render;
  let quickAddDirect, setMobileQuickAddOpen, routeQuickAddContext, openQuickAdd, setToastMessage, callDomainHook;

  function resetTaskSwipe(row, originalStyle) {
    if (!row) return;
    row.style.background = originalStyle.background;
    row.style.borderColor = originalStyle.borderColor;
    row.style.touchAction = originalStyle.touchAction;
  }

  function handleTaskSwipeStart(event) {
    if (window.innerWidth > 700 || event.pointerType === 'mouse' || !event.isPrimary || event.button !== 0) return;
    const row = event.target.closest('.task-row');
    if (!row || row.classList.contains('is-completed') || event.target.closest('button, input, textarea, select, [contenteditable]')) return;
    taskSwipeState = {
      row,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      distance: 0,
      swiping: false,
      originalStyle: { background: row.style.background, borderColor: row.style.borderColor, touchAction: row.style.touchAction }
    };
    row.style.touchAction = 'pan-y';
    row.setPointerCapture?.(event.pointerId);
  }

  function handleTaskSwipeMove(event) {
    if (touchReorder?.active) return;
    const swipe = taskSwipeState;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const horizontal = event.clientX - swipe.startX;
    const vertical = event.clientY - swipe.startY;
    if (Math.abs(vertical) > Math.abs(horizontal) && Math.abs(vertical) > 8) {
      resetTaskSwipe(swipe.row, swipe.originalStyle);
      taskSwipeState = null;
      return;
    }
    if (Math.abs(horizontal) <= Math.abs(vertical)) return;
    event.preventDefault();
    swipe.distance = horizontal;
    swipe.swiping = true;
    // R23: a light tick when the swipe passes the point where releasing acts. R25 (D): to the right it completes
    // the task (green), to the left it opens the date sheet (blue).
    const reach = Math.abs(horizontal);
    if (!swipe.armed && reach >= 96) { swipe.armed = true; haptic('tick'); }
    else if (swipe.armed && reach < 96) swipe.armed = false;
    const progress = Math.min(1, reach / 96);
    const tint = horizontal < 0 ? '83, 98, 255' : '48, 203, 173';
    swipe.row.style.background = `rgba(${tint}, ${0.14 + progress * 0.22})`;
    swipe.row.style.borderColor = `rgba(${tint}, ${0.3 + progress * 0.5})`;
  }

  function finishTaskSwipe(event) {
    const swipe = taskSwipeState;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    taskSwipeState = null;
    swipe.row.releasePointerCapture?.(event.pointerId);
    resetTaskSwipe(swipe.row, swipe.originalStyle);
    if (!swipe.swiping) return;
    suppressTaskSwipeClick = true;
    setTimeout(() => { suppressTaskSwipeClick = false; }, 0);
    if (event.type === 'pointercancel') return;
    if (swipe.distance >= 96) toggleComplete(swipe.row.dataset.taskId);
    else if (swipe.distance <= -96) openPlanPicker(swipe.row, { type: 'task', taskId: swipe.row.dataset.taskId });
  }

  // R25 (E): touch reordering — hold a row for a moment, then drag it up or down within its own list. Moving before
  // the hold ends scrolls or swipes as before; while a row is dragged the page does not scroll.
  // R33 (findings 35, 36): subtasks reorder the same way, and an Inbox row stays within its capture group.
  const REORDER_ROWS = '.task-row[draggable="true"], .subtask-row[draggable="true"]';
  function sameReorderList(reorder, over) {
    if (reorder.subtask) return over.classList.contains('subtask-row') && over.dataset.parentTaskId === reorder.context;
    return !over.classList.contains('subtask-row') && over.dataset.listContext === reorder.context && dropGroup(over) === reorder.group;
  }
  function handleTouchReorderStart(event) {
    if (event.pointerType === 'mouse' || !event.isPrimary || touchReorder) return;
    const row = event.target.closest?.(REORDER_ROWS);
    if (!row || event.target.closest('button, input, textarea, select, a, [contenteditable]')) return;
    const subtask = row.classList.contains('subtask-row');
    const reorder = { row, subtask, id: subtask ? row.dataset.subtaskId : row.dataset.taskId, context: subtask ? row.dataset.parentTaskId : row.dataset.listContext, group: dropGroup(row), pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false, target: null };
    reorder.timer = setTimeout(() => startTouchReorder(reorder), 350);
    touchReorder = reorder;
  }

  function startTouchReorder(reorder) {
    if (touchReorder !== reorder) return;
    reorder.active = true; reorder.timer = null;
    // R62: the swipe waits, so a clear move to the side after the hold still completes the task or picks its date.
    if (taskSwipeState?.row === reorder.row) { resetTaskSwipe(taskSwipeState.row, taskSwipeState.originalStyle); reorder.swipe = taskSwipeState; taskSwipeState = null; }
    reorder.row.releasePointerCapture?.(reorder.pointerId);
    reorder.row.classList.add('is-dragging', 'is-touch-dragging');
    document.body.classList.add('task-drag-active');
    haptic('tick');
  }

  function handleTouchReorderMove(event) {
    const reorder = touchReorder;
    if (!reorder || reorder.pointerId !== event.pointerId) return;
    const dx = event.clientX - reorder.startX, dy = event.clientY - reorder.startY;
    if (!reorder.active) { if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelTouchReorder(); return; }
    // R62: until the lifted row has moved up or down, a clear move to the side puts it down and swipes instead.
    if (!reorder.vertical && reorder.swipe && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      const swipe = reorder.swipe;
      cancelTouchReorder();
      taskSwipeState = swipe;
      handleTaskSwipeMove(event);
      return;
    }
    if (Math.abs(dy) > 12) reorder.vertical = true;
    event.preventDefault();
    reorder.row.style.transform = `translateY(${dy}px)`;
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(REORDER_ROWS);
    const target = over && over !== reorder.row && sameReorderList(reorder, over) ? over : null;
    if (target !== reorder.target) { reorder.target?.classList.remove('is-drop-target'); target?.classList.add('is-drop-target'); reorder.target = target; }
  }

  function finishTouchReorder(event) {
    const reorder = touchReorder;
    if (!reorder || reorder.pointerId !== event.pointerId) return;
    const target = reorder.active && event.type !== 'pointercancel' ? reorder.target : null;
    const wasActive = reorder.active;
    cancelTouchReorder();
    if (wasActive) { suppressTaskSwipeClick = true; setTimeout(() => { suppressTaskSwipeClick = false; }, 0); }
    if (target && reorder.subtask) reorderSubtasks(reorder.context, reorder.id, target.dataset.subtaskId);
    else if (target) reorderTasks(reorder.context, reorder.id, target.dataset.taskId);
  }

  function cancelTouchReorder() {
    const reorder = touchReorder;
    if (!reorder) return;
    clearTimeout(reorder.timer);
    reorder.row.style.transform = '';
    reorder.row.classList.remove('is-dragging', 'is-touch-dragging');
    reorder.target?.classList.remove('is-drop-target');
    document.body.classList.remove('task-drag-active');
    touchReorder = null;
  }

  // R62: nor while a row is swiped to the side, so a slight slant does not turn the swipe into a scroll.
  // R91: nor while a calendar task is dragged.
  function blockTouchScroll(event) {
    if ((touchReorder?.active || taskSwipeState?.swiping || calendarTouch?.active) && event.cancelable !== false) event.preventDefault();
  }

  // R91: on a touch screen, hold a calendar task (a card, a row of the day's list, a Raspored block or a task without
  // a time) and drag it onto a day (the week strip, a 3-day column, a month day) or an hour of Raspored; it is planned
  // there like a mouse drop (dropTaskOnDay, with Poništi and the repeat question).
  const CALENDAR_TOUCH_SOURCES = '[data-calendar-drag="task"], .task-row[data-list-context="calendar"]';
  const CALENDAR_TOUCH_TARGETS = '[data-calendar-time], [data-calendar-date]';
  let calendarTouch = null;
  function handleCalendarTouchStart(event) {
    if (event.pointerType === 'mouse' || !event.isPrimary || calendarTouch || touchReorder || currentRoute().type !== 'calendar') return;
    const source = event.target.closest?.(CALENDAR_TOUCH_SOURCES);
    if (!source || source.classList.contains('is-completed') || event.target.closest('input, textarea, select, .complete-control')) return;
    const id = source.dataset.calendarItemId || source.dataset.taskId;
    if (!getTask(id)) return;
    const drag = { source, id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false, target: null };
    drag.timer = setTimeout(() => startCalendarTouch(drag), 400);
    calendarTouch = drag;
  }
  function startCalendarTouch(drag) {
    if (calendarTouch !== drag) return;
    drag.active = true; drag.timer = null;
    if (taskSwipeState?.row === drag.source) { resetTaskSwipe(taskSwipeState.row, taskSwipeState.originalStyle); taskSwipeState = null; }
    drag.source.releasePointerCapture?.(drag.pointerId);
    drag.source.classList.add('is-touch-dragging');
    document.body.classList.add('task-drag-active');
    haptic('tick');
  }
  function handleCalendarTouchMove(event) {
    const drag = calendarTouch;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (!drag.active) { if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelCalendarTouch(); return; }
    event.preventDefault();
    drag.source.style.transform = `translate(${dx}px, ${dy}px)`;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(CALENDAR_TOUCH_TARGETS) || null;
    if (target !== drag.target) { drag.target?.classList.remove('is-drop-target'); target?.classList.add('is-drop-target'); drag.target = target; }
  }
  function finishCalendarTouch(event) {
    const drag = calendarTouch;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = drag.active && event.type !== 'pointercancel' ? drag.target : null;
    const wasActive = drag.active;
    cancelCalendarTouch();
    if (wasActive) { suppressTaskSwipeClick = true; setTimeout(() => { suppressTaskSwipeClick = false; }, 0); }
    const date = target?.closest('[data-calendar-date]')?.dataset.calendarDate;
    if (Core.parseDateOnly(date)) dropTaskOnDay(drag.id, date, Core.normalizeTime(target.dataset.calendarTime));
  }
  function cancelCalendarTouch() {
    const drag = calendarTouch;
    if (!drag) return;
    clearTimeout(drag.timer);
    drag.source.style.transform = '';
    drag.source.classList.remove('is-touch-dragging');
    drag.target?.classList.remove('is-drop-target');
    document.body.classList.remove('task-drag-active');
    calendarTouch = null;
  }

  // R44: on Navike a horizontal swipe over the week bar or the rings pages the week, like ‹ and ›: to the left is
  // the next week, to the right the previous one. It presses the arrow, so its limits and disabled state apply.
  function handleWeekSwipeStart(event) {
    weekSwipe = null;
    if (!['touch', 'pen'].includes(event.pointerType) || event.isPrimary === false) return;
    if (!event.target?.closest?.('.habit-rings, .habits-week-nav')) return;
    weekSwipe = { x: event.clientX, y: event.clientY };
  }
  function finishWeekSwipe(event) {
    const start = weekSwipe;
    weekSwipe = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const arrow = document.querySelector(`#main [data-action="habits-week"][data-shift="${dx < 0 ? '1' : '-1'}"]`);
    if (arrow && !arrow.disabled) arrow.click();
    // Then the click the browser sends after the swipe must not open the ring under the finger (pressing the arrow
    // first keeps that guard off its own click); a swipe that ends without a click clears it shortly.
    suppressWeekSwipeClick = true;
    setTimeout(() => { suppressWeekSwipeClick = false; }, 400);
  }
  function handleWeekSwipeClick(event) {
    if (!suppressWeekSwipeClick) return;
    suppressWeekSwipeClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function handleTaskSwipeClick(event) {
    if (!suppressTaskSwipeClick) return;
    suppressTaskSwipeClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function handleDragStart(event) {
    if (touchReorder) { event.preventDefault(); return; }
    const calendar = event.target.closest('[data-calendar-drag][draggable="true"]');
    if (calendar) { dragState = { type: `calendar-${calendar.dataset.calendarDrag}`, id: calendar.dataset.calendarItemId }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragState.id); calendar.classList.add('is-dragging'); document.body.classList.add('task-drag-active'); return; }
    const sub = event.target.closest('.subtask-row[draggable="true"]');
    if (sub) { dragState = { type: 'subtask', id: sub.dataset.subtaskId, parentId: sub.dataset.parentTaskId }; event.dataTransfer.effectAllowed = 'move'; sub.classList.add('is-dragging'); return; }
    const row = event.target.closest('.task-row[draggable="true"]');
    if (row) { dragState = { type: 'task', id: row.dataset.taskId, context: row.dataset.listContext, group: dropGroup(row) }; event.dataTransfer.effectAllowed = 'move'; row.classList.add('is-dragging'); document.body.classList.add('task-drag-active'); }
  }

  function handleDragOver(event) {
    const dropZone = event.target.closest?.('.attachment-drop-zone');
    if (dropZone && event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); dropZone.classList.add('is-dragover'); return; }
    if (!dragState) return;
    // R47d (K9): a task row or a calendar card can land on Danas, "Sutra" or a project in the sidebar.
    const sidebarTarget = ['task', 'calendar-task'].includes(dragState.type) && sidebarDropTarget(event.target);
    if (sidebarTarget) { event.preventDefault(); sidebarTarget.element.classList.add('is-drop-target'); return; }
    const calendarTarget = event.target.closest('[data-calendar-time], [data-calendar-date]');
    if (calendarTarget && ['calendar-task'].includes(dragState.type)) { event.preventDefault(); calendarTarget.classList.add('is-drop-target'); return; }
    if (dragState.type.startsWith('calendar-')) return;
    if (dragState.type === 'subtask') {
      const target = event.target.closest('.subtask-row[draggable="true"]'); if (!target || target.dataset.parentTaskId !== dragState.parentId || target.dataset.subtaskId === dragState.id) return; event.preventDefault(); target.classList.add('is-drop-target'); return;
    }
    const target = event.target.closest('.task-row[draggable="true"]');
    if (!target || target.dataset.listContext !== dragState.context || dropGroup(target) !== dragState.group || target.dataset.taskId === dragState.id) return;
    event.preventDefault(); target.classList.add('is-drop-target');
  }

  function handleDragLeave(event) {
    const dz=event.target.closest?.('.attachment-drop-zone'); if(dz) dz.classList.remove('is-dragover');
    event.target.closest('.is-drop-target')?.classList.remove('is-drop-target');
  }

  function handleDrop(event) {
    const dropZone = event.target.closest?.('.attachment-drop-zone');
    if (dropZone && event.dataTransfer?.files?.length) { event.preventDefault(); dropZone.classList.remove('is-dragover'); receiveAttachmentFiles(dropZone.dataset, [...event.dataTransfer.files]); return; }
    if (!dragState) return;
    event.preventDefault();
    const sidebarTarget = ['task', 'calendar-task'].includes(dragState.type) && sidebarDropTarget(event.target);
    if (sidebarTarget) dropTaskOnSidebar(dragState.id, sidebarTarget);
    else if (dragState.type.startsWith('calendar-')) {
      const target = event.target.closest('[data-calendar-time], [data-calendar-date]');
      if (target) {
        const date = target.closest('[data-calendar-date]')?.dataset.calendarDate;
        const time = Core.normalizeTime(target.dataset.calendarTime);
        if (Core.parseDateOnly(date) && dragState.type === 'calendar-task') dropTaskOnDay(dragState.id, date, time);
      }
    } else if (dragState.type === 'subtask') {
      const target = event.target.closest('.subtask-row[draggable="true"]'); if (target && target.dataset.parentTaskId === dragState.parentId) reorderSubtasks(dragState.parentId, dragState.id, target.dataset.subtaskId);
    } else {
      const target = event.target.closest('.task-row[draggable="true"]'); if (target && target.dataset.listContext === dragState.context && dropGroup(target) === dragState.group) reorderTasks(dragState.context, dragState.id, target.dataset.taskId);
    }
    cleanupDrag();
  }

  // R47d (K9): the sidebar's drop targets: Danas, "Prevuci ovde za sutra" and the projects.
  function sidebarDropTarget(element) {
    const target = element?.closest?.('#desktop-sidebar [data-sidebar-drop], #desktop-sidebar [data-route="today"], #desktop-sidebar [data-route^="project/"]');
    if (!target) return null;
    if (target.dataset.sidebarDrop === 'tomorrow') return { element: target, kind: 'tomorrow' };
    if (target.dataset.route === 'today') return { element: target, kind: 'today' };
    return { element: target, kind: 'project', projectId: decodeURIComponent(target.dataset.route.slice('project/'.length)) };
  }

  // Each move says what it did and offers Poništi; a repeating task's date asks "Samo ovo / Ovo i buduća" first (S14).
  function dropTaskOnSidebar(taskId, target) {
    if (target.kind === 'today') addTaskToToday(taskId);
    else if (target.kind === 'tomorrow') moveTaskToTomorrow(taskId);
    else moveTaskToProject(taskId, target.projectId);
  }

  function moveTaskToProject(taskId, projectId) {
    const task = getTask(taskId);
    if (!task || !getProject(projectId) || (task.projectId === projectId && !task.isInbox)) return;
    const previous = { projectId: task.projectId ?? null, areaId: task.areaId ?? null, isInbox: task.isInbox };
    if (requestTaskEdit(taskId, { projectId, areaId: null, isInbox: false })) return;
    setUndo(msg('Task moved to project'), () => { const current = getTask(taskId); if (!current) return; Object.assign(current, previous, { updatedAt: nowIso() }); saveState(); render(); });
  }

  // R47d (K9): a task dropped on a calendar day (or an hour of Raspored) is planned there, with Poništi; the
  // "Samo ovo / Ovo i buduća" question of a repeating task has its own.
  function dropTaskOnDay(taskId, date, time) {
    const task = getTask(taskId);
    if (!task || (task.plannedDate === date && (!time || task.plannedTime === time) && !task.isInbox)) return;
    const previous = { plannedDate: task.plannedDate ?? null, plannedTime: task.plannedTime ?? null, isInbox: task.isInbox, todayOrder: task.todayOrder ?? null };
    if (requestTaskEdit(taskId, { plannedDate: date, ...(time ? { plannedTime: time } : {}), isInbox: false })) return;
    const today = Core.dateOnly();
    setUndo(date === today ? msg('Task moved to Today') : date === Core.addDays(today, 1) ? msg('Task moved to Tomorrow') : msg('Task moved to another day'), () => {
      const current = getTask(taskId); if (!current) return;
      Object.assign(current, previous, { updatedAt: nowIso() }); saveState(); render();
    });
  }

  function handleDragEnd() { cleanupDrag(); }
  function cleanupDrag() { $$('.is-dragging, .is-drop-target').forEach(el => el.classList.remove('is-dragging', 'is-drop-target')); document.body.classList.remove('task-drag-active'); dragState = null; }

  // Redesign R2 (T5): a long press on an element with data-long-press runs that action (the habit menu on
  // Today), and the click that follows the press is swallowed. The menu is also reachable by a tap or keyboard.
  let longPressTimer = null, longPressFired = false;
  function handleLongPressStart(event) {
    if (!event.isPrimary || event.button > 0) return;
    const el = event.target.closest?.('[data-long-press]');
    if (!el) return;
    clearTimeout(longPressTimer); longPressFired = false;
    longPressTimer = setTimeout(() => { longPressTimer = null; longPressFired = true; runLongPress(el); }, 500);
  }
  // R36 (C): holding the "+" opens a new task at once where a tap opens the menu. R59: where a tap adds directly,
  // holding it opens the menu, so every type stays one hold away.
  function runLongPress(el) {
    if (el.dataset.longPress === 'quick-add-task') { haptic('tick'); if (quickAddDirect()) { setMobileQuickAddOpen(true); return; } setMobileQuickAddOpen(false); const context = routeQuickAddContext(); if (context) openQuickAdd(context); else setToastMessage(tr('Restore the project to add tasks.')); return; }
    callDomainHook('handleAction', el.dataset.longPress, { target: el });
  }
  function cancelLongPress() {
    clearTimeout(longPressTimer); longPressTimer = null;
  }
  function handleLongPressClick(event) {
    if (!longPressFired) return;
    longPressFired = false; event.preventDefault(); event.stopPropagation();
  }

  function attach(ctx) {
    ({ Core, $$, getTask, getProject, currentRoute, haptic, toggleComplete, openPlanPicker, reorderTasks, reorderSubtasks, dropGroup, receiveAttachmentFiles, addTaskToToday, moveTaskToTomorrow, requestTaskEdit, setUndo, nowIso, saveState, render, quickAddDirect, setMobileQuickAddOpen, routeQuickAddContext, openQuickAdd, setToastMessage, callDomainHook } = ctx);
    document.addEventListener('pointerdown', handleLongPressStart);
    document.addEventListener('pointerup', cancelLongPress);
    document.addEventListener('pointercancel', cancelLongPress);
    document.addEventListener('pointermove', event => { if (longPressTimer && (Math.abs(event.movementX) > 4 || Math.abs(event.movementY) > 4)) cancelLongPress(); });
    document.addEventListener('click', handleLongPressClick, true);
    document.addEventListener('contextmenu', event => { if (event.target.closest?.('[data-long-press]')) event.preventDefault(); });
    document.addEventListener('pointerdown', handleTaskSwipeStart);
    document.addEventListener('pointermove', handleTaskSwipeMove, { passive: false });
    document.addEventListener('pointerup', finishTaskSwipe);
    document.addEventListener('pointercancel', finishTaskSwipe);
    document.addEventListener('click', handleTaskSwipeClick, true);
    document.addEventListener('pointerdown', handleWeekSwipeStart);
    document.addEventListener('pointerup', finishWeekSwipe);
    document.addEventListener('pointercancel', () => { weekSwipe = null; });
    document.addEventListener('click', handleWeekSwipeClick, true);
    document.addEventListener('pointerdown', handleTouchReorderStart);
    document.addEventListener('pointermove', handleTouchReorderMove, { passive: false });
    document.addEventListener('pointerup', finishTouchReorder);
    document.addEventListener('pointercancel', finishTouchReorder);
    document.addEventListener('pointerdown', handleCalendarTouchStart);
    document.addEventListener('pointermove', handleCalendarTouchMove, { passive: false });
    document.addEventListener('pointerup', finishCalendarTouch);
    document.addEventListener('pointercancel', finishCalendarTouch);
    document.addEventListener('touchmove', blockTouchScroll, { passive: false });
    document.addEventListener('contextmenu', event => { if (touchReorder || taskSwipeState || calendarTouch) event.preventDefault(); });
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);
  }

  window.TodoDomainModules?.register({
    name: 'drag',
    attach,
    isDragging: () => Boolean(dragState),
  });
})();
