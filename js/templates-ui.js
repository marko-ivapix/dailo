(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  // Display labels only; the template type, row kind and option values stay persisted English ids.
  const TYPE_LABELS = { task: msg('Task'), project: msg('Project'), habit: msg('Habit'), goal: msg('Goal') };
  const ROW_LABELS = { subtasks: msg('Subtasks'), tasks: msg('Tasks'), reminders: msg('Reminders'), milestones: msg('Milestones') };
  const ROW_ACTIONS = {
    subtask: [msg('Add subtask'), msg('Remove subtask')],
    task: [msg('Add task'), msg('Remove task')],
    reminder: [msg('Add reminder'), msg('Remove reminder')],
    milestone: [msg('Add milestone'), msg('Remove milestone')]
  };
  const EDITOR_TITLES = {
    task: [msg('New task template'), msg('Edit task template')],
    project: [msg('New project template'), msg('Edit project template')],
    habit: [msg('New habit template'), msg('Edit habit template')],
    goal: [msg('New goal template'), msg('Edit goal template')]
  };
  const typeLabel = (ctx, type) => (TYPE_LABELS[type] ? tr(TYPE_LABELS[type]) : ctx.templateLabel(type));

  // Redesign R10d (S7): templates grouped by type; a tap opens a sheet with "Upotrebi šablon" and the actions.
  const GROUP_LABELS = { task: msg('Tasks'), project: msg('Projects'), habit: msg('Habits'), goal: msg('Goals') };
  const GROUP_ICONS = { task: 'ph-check-square', project: 'ph-folder', habit: 'ph-repeat', goal: 'ph-target' };
  function templateDetail(template) {
    const data = template.data || {};
    const count = template.type === 'task' && data.subtasks?.length ? trn(data.subtasks.length, '{count} subtask', '{count} subtasks')
      : template.type === 'project' && data.tasks?.length ? trn(data.tasks.length, '{count} task', '{count} tasks')
        : template.type === 'goal' && data.milestones?.length ? trn(data.milestones.length, '{count} milestone', '{count} milestones') : '';
    return [data.title || data.name || '', count].filter(Boolean).join(' · ');
  }

  function renderTemplates(ctx) {
    const { state, templateTypes, pageHeader, esc } = ctx;
    let html = pageHeader(tr('Templates'), tr('Reusable items with dates relative to the day you make them.'), { add: false });
    for (const type of templateTypes) {
      const rows = state.templates.filter(template => template.type === type);
      if (!rows.length) continue;
      html += `<section class="section templates-group"><div class="section-header"><h2 class="section-label"><i class="ph ${GROUP_ICONS[type] || 'ph-copy'}" aria-hidden="true"></i> ${GROUP_LABELS[type] ? tr(GROUP_LABELS[type]) : typeLabel(ctx, type)} · ${rows.length}</h2></div><div class="today-card templates-list">${rows.map(template => `<button class="template-list-row" type="button" data-action="template-open" data-template-id="${esc(template.id)}"><span class="template-list-main"><span class="task-title">${esc(template.name)}</span><span class="task-meta">${esc(templateDetail(template))}</span></span></button>`).join('')}</div></section>`;
    }
    if (!state.templates.length) html += `<p class="today-empty">${tr('No templates yet. Create one or save an existing item as a template.')}</p>`;
    return `${html}<div class="today-card templates-add"><button class="inline-add" type="button" data-action="new-template"><i class="ph ph-plus" aria-hidden="true"></i> ${tr('New template')}</button></div><p class="sheet-note templates-note">${tr('“Save as template” in the menu of a task, project, habit or goal also makes one.')}</p>`;
  }

  function openTemplateSheet(ctx, anchor, templateId) {
    const { state, esc } = ctx;
    const template = state.templates.find(item => item.id === templateId); if (!template) return;
    const id = esc(template.id);
    ctx.openPopover(anchor, `<div class="popover-title">${esc(template.name)}</div><p class="sheet-subtitle">${esc(templateDetail(template))}</p><button class="btn btn-primary sheet-primary" type="button" data-pop-action="use-template" data-template-id="${id}">${tr('Use template')}</button><div class="sheet-card"><button class="popover-option" type="button" data-pop-action="edit-template" data-template-id="${id}"><i class="ph ph-pencil-simple"></i>${tr('Edit template')}</button><button class="popover-option" type="button" data-pop-action="duplicate-template" data-template-id="${id}"><i class="ph ph-copy"></i>${tr('Duplicate template')}</button><button class="popover-option" type="button" style="color:var(--danger)" data-pop-action="delete-template" data-template-id="${id}"><i class="ph ph-trash"></i>${tr('Delete template')}</button></div>`, { type: 'template-sheet', templateId });
  }

  function openTypeSheet(ctx, anchor) {
    ctx.openPopover(anchor, `<div class="popover-title">${tr('New template')}</div><div class="sheet-card">${ctx.templateTypes.map(type => `<button class="popover-option" type="button" data-pop-action="new-template-type" data-template-type="${type}"><i class="ph ${GROUP_ICONS[type] || 'ph-copy'}" aria-hidden="true"></i>${EDITOR_TITLES[type] ? tr(EDITOR_TITLES[type][0]) : typeLabel(ctx, type)}</button>`).join('')}</div>`, { type: 'template-type' });
  }

  function openEditor(ctx, templateId = null, type = 'task', snapshot = null) {
    const { state, Core, copyTemplate, closePopover, captureModalReturnFocus, setModalState, renderModal, $ } = ctx;
    captureModalReturnFocus();
    closePopover();
    const existing = state.templates.find(template => template.id === templateId);
    const empty = type === 'task' ? { title: '', subtasks: [] } : type === 'project' ? { name: '', tasks: [] } : type === 'goal' ? { title: '', milestones: [], targetValue: 100 } : { name: '', targetValue: 1, reminders: [] };
    const draft = existing ? copyTemplate(existing) : { name: '', ...(snapshot || Core.templateFromEntity(type, empty, {}, Core.dateOnly())) };
    setModalState({ type: 'template', templateId, draft, error: '' });
    renderModal(); requestAnimationFrame(() => $('#template-name')?.focus());
  }

  function templateField(ctx, data, key, label, kind = 'text', options = null, prefix = '') {
    const { esc } = ctx;
    const path = `${prefix}${key}`, value = data[key];
    const attrs = `class="input" data-template-field="${path}" data-template-kind="${kind}"`;
    let input;
    if (options) input = `<select ${attrs} ${kind === 'ids' || kind === 'indices' ? 'multiple' : ''}>${options.map(([valueOption, text]) => `<option value="${esc(valueOption)}" ${kind === 'ids' || kind === 'indices' ? (value || []).includes(valueOption) ? 'selected' : '' : String(value ?? '') === String(valueOption) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
    else if (kind === 'boolean') input = `<input ${attrs} type="checkbox" ${value ? 'checked' : ''}>`;
    else if (kind === 'notes') input = `<textarea ${attrs}>${esc(value || '')}</textarea>`;
    else input = `<input ${attrs} type="${['number', 'time', 'color', 'date'].includes(kind) ? kind : 'text'}" ${kind === 'number' ? 'step="any"' : ''} value="${esc(Array.isArray(value) ? value.join(',') : value ?? '')}">`;
    return `<label class="field-label">${label}${input}</label>`;
  }

  function templateFields(ctx, type, data, prefix = '') {
    const { state, getGoal, esc } = ctx;
    const field = (key, label, kind, options) => templateField(ctx, data, key, label, kind, options, prefix);
    const choices = key => [['', tr('None')], ...state[key].map(item => [item.id, item.name || item.title])];
    let html = field(type === 'task' || type === 'goal' ? 'title' : 'name', type === 'task' || type === 'goal' ? tr('Title') : tr('Name')) + field('areaId', tr('Area'), 'text', choices('areas'));
    if (type !== 'goal') html += field('goalIds', tr('Goal links (select multiple)'), 'ids', state.goals.map(goal => [goal.id, goal.title]));
    if (type === 'task') {
      html += field('notes', tr('Notes'), 'notes') + field('projectId', tr('Project'), 'text', choices('projects')) + field('tagIds', tr('Tags (select multiple)'), 'ids', state.tags.map(tag => [tag.id, tag.name])) + field('priority', tr('Priority'), 'text', [['none', tr('None')], ['low', tr('Low')], ['medium', tr('Medium')], ['high', tr('High')]]) + field('plannedOffsetDays', tr('Planned day offset (blank = none)'), 'number') + field('plannedTime', tr('Planned time'), 'time') + field('dueOffsetDays', tr('Due day offset (blank = none)'), 'number') + field('dueTime', tr('Due time'), 'time') + field('reminderOffsetDays', tr('Reminder day offset (blank = none)'), 'number') + field('reminderTime', tr('Reminder local time'), 'time') + field('scheduleEnabled', tr('Create automatically on date'), 'boolean') + field('scheduleDate', tr('Automatic creation date'), 'date');
      html += field('durationMinutes', tr('Duration in minutes (blank = none)'), 'number');
      const recurrence = data.recurrence || {};
      html += templateField(ctx, recurrence, 'frequency', tr('Repeat'), 'text', [['', tr('Does not repeat')], ['daily', tr('Daily')], ['weekly', tr('Weekly')], ['monthly', tr('Monthly')], ['yearly', tr('Yearly')]], `${prefix}recurrence.`) + templateField(ctx, recurrence, 'interval', tr('Repeat interval'), 'number', null, `${prefix}recurrence.`);
      html += templateField(ctx, recurrence, 'endType', tr('Repeat end condition'), 'text', [['never', tr('Never')], ['date', tr('On relative date')], ['afterOccurrences', tr('After N occurrences')]], `${prefix}recurrence.`) + templateField(ctx, recurrence, 'endOffsetDays', tr('Repeat end day offset'), 'number', null, `${prefix}recurrence.`) + templateField(ctx, recurrence, 'endAfterOccurrences', tr('Repeat total occurrences'), 'number', null, `${prefix}recurrence.`);
      html += templateRows(ctx, 'subtasks', data.subtasks || [], prefix, 'subtask');
    } else if (type === 'project') html += field('color', tr('Color'), 'color') + templateRows(ctx, 'tasks', data.tasks || [], prefix, 'task');
    else if (type === 'habit') {
      html += field('minimumTarget', tr('Minimum target (blank = default)'), 'number') + field('idealTarget', tr('Ideal target (blank = default)'), 'number') + field('graceDays', tr('Grace days'), 'number');
      html += field('trackingType', tr('Tracking'), 'text', [['checkbox', tr('Checkbox')], ['numeric', tr('Numeric')]]) + field('targetValue', tr('Target value'), 'number') + field('unit', tr('Unit')) + field('quickValues', tr('Quick values (comma separated)'), 'numbers') + field('frequencyType', tr('Frequency'), 'text', [['daily', tr('Daily')], ['weekdays', tr('Selected weekdays')], ['timesPerWeek', tr('X times per week')], ['everyNDays', tr('Every N days')]]) + field('weekdays', tr('Weekdays (0 = Sun, 1 = Mon … 6 = Sat)'), 'numbers') + field('timesPerWeek', tr('Times per week'), 'number') + field('everyNDays', tr('Every N days'), 'number') + field('continuation', tr('Continuation'), 'text', [['automatic', tr('Repeat automatically')], ['askEachPeriod', tr('Ask each period')], ['onePeriod', tr('One period only')]]) + field('endType', tr('End condition'), 'text', [['never', tr('Never')], ['date', tr('On relative date')], ['successfulPeriods', tr('After successful periods')]]) + field('endOffsetDays', tr('End day offset (blank = none)'), 'number') + field('successfulPeriodsTarget', tr('Successful periods'), 'number') + templateRows(ctx, 'reminders', data.reminders || [], prefix, 'reminder');
    } else {
      html += field('progressMode', tr('Progress source'), 'text', [['manual', tr('Manual')], ['linkedTasks', tr('Linked tasks')], ['linkedHabits', tr('Linked habits')]]) + field('progressType', tr('Progress type'), 'text', [['percentage', tr('Percentage')], ['numeric', tr('Numeric target')]]) + field('targetValue', tr('Target value'), 'number') + field('unit', tr('Unit')) + field('targetOffsetDays', tr('Target day offset (blank = none)'), 'number') + templateRows(ctx, 'milestones', data.milestones || [], prefix, 'milestone');
      const reminders = data.reminders || {};
      const reminderLabels = [trn(7, '{count} day before', '{count} days before'), trn(3, '{count} day before', '{count} days before'), trn(1, '{count} day before', '{count} days before'), tr('On target date')];
      html += ['sevenDaysBefore', 'threeDaysBefore', 'oneDayBefore', 'onTargetDate'].map((key, index) => templateField(ctx, reminders, key, reminderLabels[index], 'boolean', null, `${prefix}reminders.`)).join('') + templateField(ctx, reminders, 'time', tr('Reminder time'), 'time', null, `${prefix}reminders.`);
    }
    if (type === 'project' || type === 'habit') {
      data.goalLinkConfigs = (data.goalIds || []).map(goalId => (data.goalLinkConfigs || []).find(config => config.goalId === goalId) || (type === 'project' ? { goalId, contributionMode: 'allTasks', selectedTaskIndices: [] } : { goalId, metric: 'totalCheckins', target: type === 'habit' && data.trackingType === 'numeric' ? data.targetValue || 1 : 1 }));
      html += data.goalLinkConfigs.map((config, index) => `<fieldset class="template-rows"><legend>${esc(getGoal(config.goalId)?.title || tr('Linked Goal'))}</legend>${type === 'project' ? templateField(ctx, config, 'contributionMode', tr('Project contribution'), 'text', [['allTasks', tr('All predefined tasks')], ['selectedTasks', tr('Selected predefined tasks')]], `${prefix}goalLinkConfigs.${index}.`) + templateField(ctx, config, 'selectedTaskIndices', tr('Contributing tasks (select multiple)'), 'indices', (data.tasks || []).map((task, taskIndex) => [taskIndex, task.title || tr('Task {number}', { number: taskIndex + 1 })]), `${prefix}goalLinkConfigs.${index}.`) : templateField(ctx, config, 'metric', tr('Habit metric'), 'text', [['totalCheckins', tr('Check-ins')], ['streak', tr('Streak')], ['successfulPeriods', tr('Successful periods')]], `${prefix}goalLinkConfigs.${index}.`) + templateField(ctx, config, 'target', tr('Goal contribution target'), 'number', null, `${prefix}goalLinkConfigs.${index}.`)}</fieldset>`).join('');
    }
    return html;
  }

  function templateRows(ctx, key, rows, prefix, kind) {
    const path = prefix + key;
    const [addLabel, removeLabel] = (ROW_ACTIONS[kind] || []).map(text => tr(text));
    return `<fieldset class="template-rows"><legend>${ROW_LABELS[key] ? tr(ROW_LABELS[key]) : ctx.templateLabel(key)}</legend>${rows.map((row, index) => `<div class="template-row">${kind === 'task' ? templateFields(ctx, 'task', row, `${path}.${index}.`) : kind === 'reminder' ? templateField(ctx, row, 'time', tr('Time'), 'time', null, `${path}.${index}.`) + templateField(ctx, row, 'enabled', tr('Enabled'), 'boolean', null, `${path}.${index}.`) : templateField(ctx, row, 'title', tr('Title'), 'text', null, `${path}.${index}.`) + (kind === 'milestone' ? templateField(ctx, row, 'dateOffsetDays', tr('Day offset (blank = none)'), 'number', null, `${path}.${index}.`) : '')}<button class="btn btn-ghost" type="button" data-action="template-remove-row" data-path="${path}" data-index="${index}">${removeLabel}</button></div>`).join('')}<button class="btn btn-ghost" type="button" data-action="template-add-row" data-path="${path}" data-kind="${kind}">${addLabel}</button></fieldset>`;
  }

  function renderTemplateModal(ctx) {
    const { modalState, modalFrame, esc } = ctx, draft = modalState.draft;
    const titles = EDITOR_TITLES[draft.type] || [msg('New template'), msg('Edit template')];
    const hint = tr('Use {date}, {today} or {tomorrow} in titles and notes. Day offsets are relative to the day you create an item.', { date: '{{date}}', today: '{{today}}', tomorrow: '{{tomorrow}}' });
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr(titles[modalState.templateId ? 1 : 0])}</h2><button class="btn-icon" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">${tr('Template name')}<input id="template-name" class="input" value="${esc(draft.name)}"></label><p class="area-empty-copy">${hint}</p>${templateFields(ctx, draft.type, draft.data)}${modalState.error ? `<p class="validation" role="alert">${esc(modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><button class="btn btn-primary" type="button" data-action="save-template">${tr('Save template')}</button></div></div>`, 'quick');
  }

  function templatePath(data, path, create = false) {
    const keys = path.split('.'), last = keys.pop(); let parent = data;
    for (const key of keys) { if (parent[key] == null && create) parent[key] = {}; parent = parent[key]; }
    return { parent, last };
  }

  function readDraft(ctx) {
    const { modalState, $, $$ } = ctx;
    if (modalState?.type !== 'template') return;
    modalState.draft.name = $('#template-name')?.value || '';
    $$('[data-template-field]').forEach(input => {
      const { parent, last } = templatePath(modalState.draft.data, input.dataset.templateField, true), kind = input.dataset.templateKind;
      parent[last] = kind === 'boolean' ? input.checked : kind === 'number' ? (input.value === '' ? null : Number(input.value)) : kind === 'numbers' ? input.value.split(',').filter(value => value.trim()).map(Number) : kind === 'ids' || kind === 'indices' ? [...input.selectedOptions].map(option => kind === 'indices' ? Number(option.value) : option.value) : input.value || null;
    });
  }

  function templateDataProblem(type, data) {
    if (type === 'task' && data.durationMinutes != null && (!Number.isInteger(data.durationMinutes) || data.durationMinutes <= 0)) return tr('Duration must be a positive whole number of minutes.');
    if (type === 'habit') {
      const fractional = data.trackingType === 'numeric' && data.frequencyType !== 'timesPerWeek';
      for (const key of ['minimumTarget', 'idealTarget']) if (data[key] != null && (!Number.isFinite(data[key]) || data[key] <= 0 || (!fractional && !Number.isInteger(data[key])))) return tr('Habit targets must be positive numbers; count targets must be whole numbers.');
      if (data.minimumTarget != null && data.idealTarget != null && data.idealTarget < data.minimumTarget) return tr('Ideal target must be at least the minimum target.');
      if (data.graceDays != null && (!Number.isInteger(data.graceDays) || data.graceDays < 0)) return tr('Grace days must be zero or a positive whole number.');
    }
    const relativeProblem = value => value && typeof value === 'object' && Object.entries(value).some(([key, item]) => key.endsWith('OffsetDays') ? item !== null && !Number.isInteger(item) : typeof item === 'object' && relativeProblem(item));
    if (relativeProblem(data)) return tr('Day offsets must be whole numbers.');
    const schedule = String(data.scheduleDate || ''), parsedSchedule = /^\d{4}-\d{2}-\d{2}$/.test(schedule) ? new Date(`${schedule}T00:00:00Z`) : null;
    if (type === 'task' && data.scheduleEnabled && (!parsedSchedule || Number.isNaN(parsedSchedule.getTime()) || parsedSchedule.toISOString().slice(0, 10) !== schedule)) return tr('Automatic creation needs a valid date.');
    if (type === 'task' && data.recurrence?.frequency && (!Number.isInteger(data.recurrence.interval) || data.recurrence.interval < 1 || data.recurrence.endType === 'afterOccurrences' && (!Number.isInteger(data.recurrence.endAfterOccurrences) || data.recurrence.endAfterOccurrences < 1))) return tr('Repeat interval and occurrence count must be positive whole numbers.');
    if (type === 'task' && data.recurrence?.frequency && data.recurrence.endType === 'date' && !Number.isInteger(data.recurrence.endOffsetDays)) return tr('Provide a whole-number repeat end day offset.');
    if (type === 'task' && (data.subtasks || []).some(subtask => !String(subtask.title || '').trim())) return tr('Subtasks need a title.');
    if (type === 'project') for (const task of data.tasks || []) { if (!String(task.title || '').trim()) return tr('Predefined tasks need a title.'); const error = templateDataProblem('task', task); if (error) return error; }
    if (type === 'goal' && (data.milestones || []).some(milestone => !String(milestone.title || '').trim())) return tr('Milestones need a title.');
    if ((type === 'habit' && data.trackingType === 'numeric' || type === 'goal' && data.progressType === 'numeric') && !(data.targetValue > 0)) return tr('Numeric targets must be above zero.');
    if (type === 'habit' && data.frequencyType === 'weekdays' && (!(data.weekdays || []).length || data.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6))) return tr('Select valid weekdays from 0 to 6.');
    if (type === 'habit' && data.frequencyType === 'timesPerWeek' && (!Number.isInteger(data.timesPerWeek) || data.timesPerWeek < 1 || data.timesPerWeek > 7)) return tr('Times per week must be a positive whole number up to 7.');
    if (type === 'habit' && data.frequencyType === 'everyNDays' && (!Number.isInteger(data.everyNDays) || data.everyNDays < 1)) return tr('Every N days must be a positive whole number.');
    if (type === 'habit' && data.endType === 'successfulPeriods' && (!Number.isInteger(data.successfulPeriodsTarget) || data.successfulPeriodsTarget < 1)) return tr('Successful periods must be a positive whole number.');
    if (type === 'habit' && data.endType === 'date' && !Number.isInteger(data.endOffsetDays)) return tr('Provide a whole-number end day offset.');
    if (type === 'habit' && (data.goalLinkConfigs || []).some(config => !(config.target > 0))) return tr('Goal contribution targets must be above zero.');
    return null;
  }

  function save(ctx) {
    readDraft(ctx); const { modalState, renderModal, saveTemplateRecord } = ctx, draft = modalState.draft;
    if (!draft.name.trim() || !String(draft.data.title || draft.data.name || '').trim()) { modalState.error = tr('Template and item need a name.'); renderModal(); return; }
    const problem = templateDataProblem(draft.type, draft.data);
    if (problem) { modalState.error = problem; renderModal(); return; }
    if (!saveTemplateRecord(modalState.templateId, draft)) { modalState.error = tr('This template was changed or deleted. Reopen it and try again.'); renderModal(); }
  }

  function editRow(ctx, button, remove = false) {
    readDraft(ctx); const editor = ctx.modalState, { parent, last } = templatePath(editor.draft.data, button.dataset.path, true); parent[last] ||= [];
    if (!remove) { const kind = button.dataset.kind; parent[last].push(kind === 'task' ? ctx.Core.templateFromEntity('task', { title: '', subtasks: [] }).data : kind === 'reminder' ? { time: '09:00', enabled: true } : { title: '', dateOffsetDays: null, isCompleted: false, completedAt: null }); ctx.renderModal(); return; }
    const index = Number(button.dataset.index), snapshot = ctx.copyTemplate(parent[last][index]);
    const removedSelections = button.dataset.path === 'tasks' ? (editor.draft.data.goalLinkConfigs || []).filter(config => (config.selectedTaskIndices || []).includes(index)).map(config => config.goalId) : [];
    const adjustSelections = (data, inserting = false) => {
      if (button.dataset.path !== 'tasks') return;
      for (const config of data.goalLinkConfigs || []) {
        config.selectedTaskIndices = (config.selectedTaskIndices || []).filter(item => inserting || item !== index).map(item => inserting ? (item >= index ? item + 1 : item) : (item > index ? item - 1 : item));
        if (inserting && removedSelections.includes(config.goalId)) config.selectedTaskIndices.push(index);
        config.selectedTaskIndices.sort((left, right) => left - right);
      }
    };
    const focusPath = ctx.$('[data-template-field]:focus')?.dataset.templateField;
    const restoreEditor = () => { ctx.setModalState(editor); ctx.renderModal(); requestAnimationFrame(() => ctx.$(`[data-template-field="${focusPath || button.dataset.path + '.' + index + '.title'}"]`)?.focus()); };
    ctx.openConfirm({ title: tr('Remove template row?'), message: tr('This changes only the template draft.'), onConfirm: () => { parent[last].splice(index, 1); adjustSelections(editor.draft.data); restoreEditor(); ctx.setUndo(tr('Template row removed'), () => {
      if (ctx.modalState === editor) readDraft(ctx);
      parent[last].splice(Math.min(index, parent[last].length), 0, ctx.copyTemplate(snapshot)); adjustSelections(editor.draft.data, true);
      const saved = ctx.state.templates.find(template => template.id === editor.savedTemplateId);
      if (saved) { const target = templatePath(saved.data, button.dataset.path, true); target.parent[target.last] ||= []; target.parent[target.last].splice(Math.min(index, target.parent[target.last].length), 0, ctx.copyTemplate(snapshot)); adjustSelections(saved.data, true); saved.updatedAt = ctx.nowIso(); ctx.saveAndRender(); }
      if (ctx.modalState === editor) restoreEditor();
    }); }, onCancel: restoreEditor });
  }

  window.TodoDomainModules?.register({
    name: 'templates',
    renderRoute(route, ctx) {
      if (route.type === 'templates') return renderTemplates(ctx);
      if (route.type === 'modal' && route.modalType === 'template') return renderTemplateModal(ctx);
    },
    handleAction(action, event, ctx) {
      if (action === 'open-template-editor') { openEditor(ctx, null, event.templateType, event.snapshot); return true; }
      const element = event?.target?.closest?.('[data-action], [data-pop-action]');
      if (!element) return false;
      if (action === 'template-open') openTemplateSheet(ctx, element, element.dataset.templateId);
      else if (action === 'new-template') openTypeSheet(ctx, element);
      else if (action === 'new-template-type') openEditor(ctx, null, ctx.templateTypes.includes(element.dataset.templateType) ? element.dataset.templateType : 'task');
      else if (action === 'use-template' && element.dataset.popAction) { ctx.closePopover(); ctx.useTemplate(element.dataset.templateId); }
      else if (action === 'edit-template') openEditor(ctx, element.dataset.templateId);
      else if (action === 'save-template' && !element.dataset.popAction) save(ctx);
      else if (action === 'delete-template') { ctx.closePopover(); ctx.requestDeleteEntity('template', element.dataset.templateId); }
      else if (action === 'duplicate-template') { ctx.closePopover(); ctx.duplicateTemplateRecord(element.dataset.templateId); }
      else if (action === 'template-add-row' || action === 'template-remove-row') editRow(ctx, element, action === 'template-remove-row');
      else if (action === 'save-template' && element.dataset.popAction) ctx.openTemplateEditorFromSource(element.dataset.templateSourceType, element.dataset.templateSourceId);
      else return false;
      return true;
    },
    handleInput(event, ctx) {
      if (ctx.modalState?.type !== 'template' || event.type !== 'change' || !event.target.dataset.templateField?.endsWith('goalIds')) return false;
      readDraft(ctx); ctx.renderModal(); return true;
    }
  });
})();
