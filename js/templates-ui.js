(function () {
  'use strict';

  function renderTemplates(ctx) {
    const { state, templateTypes, templateLabel, pageHeader, esc } = ctx;
    const type = templateTypes.includes(state.ui.templateType) ? state.ui.templateType : 'task';
    const rows = state.templates.filter(template => template.type === type);
    return pageHeader('Templates', 'Reusable snapshots with relative dates.', { add: false, actionHtml: '<button class="btn btn-primary" type="button" data-action="new-template"><i class="ph ph-plus"></i> New template</button>' }) + `<div class="view-tabs">${templateTypes.map(templateType => `<button class="btn ${templateType === type ? 'btn-secondary' : 'btn-ghost'}" type="button" data-template-type="${templateType}">${templateLabel(templateType)}</button>`).join('')}</div><section class="section">${rows.length ? rows.map(template => `<article class="goal-row" data-template-row="${esc(template.id)}"><div class="goal-open"><strong>${esc(template.name)}</strong><small>${esc(template.data.title || template.data.name || '')}</small></div><div class="modal-footer-actions"><button class="btn-icon" data-action="use-template" data-template-id="${esc(template.id)}" aria-label="Use template"><i class="ph ph-plus"></i></button><button class="btn-icon" data-action="edit-template" data-template-id="${esc(template.id)}" aria-label="Edit template"><i class="ph ph-pencil-simple"></i></button><button class="btn-icon" data-action="duplicate-template" data-template-id="${esc(template.id)}" aria-label="Duplicate template"><i class="ph ph-copy"></i></button><button class="btn-icon" data-action="delete-template" data-template-id="${esc(template.id)}" aria-label="Delete template"><i class="ph ph-trash"></i></button></div></article>`).join('') : '<p class="area-empty-copy">No templates yet. Create one or save an existing item as a template.</p>'}</section>`;
  }

  function openEditor(ctx, templateId = null, type = ctx.state.ui.templateType || 'task', snapshot = null) {
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
    const choices = key => [['', 'None'], ...state[key].map(item => [item.id, item.name || item.title])];
    let html = field(type === 'task' || type === 'goal' ? 'title' : 'name', type === 'task' || type === 'goal' ? 'Title' : 'Name') + field('areaId', 'Area', 'text', choices('areas'));
    if (type !== 'goal') html += field('goalIds', 'Goal links (select multiple)', 'ids', state.goals.map(goal => [goal.id, goal.title]));
    if (type === 'task') {
      html += field('notes', 'Notes', 'notes') + field('projectId', 'Project', 'text', choices('projects')) + field('tagIds', 'Tags (select multiple)', 'ids', state.tags.map(tag => [tag.id, tag.name])) + field('priority', 'Priority', 'text', [['none', 'None'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]) + field('plannedOffsetDays', 'Planned day offset (blank = none)', 'number') + field('plannedTime', 'Planned time', 'time') + field('dueOffsetDays', 'Due day offset (blank = none)', 'number') + field('dueTime', 'Due time', 'time') + field('reminderOffsetDays', 'Reminder day offset (blank = none)', 'number') + field('reminderTime', 'Reminder local time', 'time') + field('scheduleEnabled', 'Create automatically on date', 'boolean') + field('scheduleDate', 'Automatic creation date', 'date');
      const recurrence = data.recurrence || {};
      html += templateField(ctx, recurrence, 'frequency', 'Repeat', 'text', [['', 'Does not repeat'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']], `${prefix}recurrence.`) + templateField(ctx, recurrence, 'interval', 'Repeat interval', 'number', null, `${prefix}recurrence.`);
      html += templateField(ctx, recurrence, 'endType', 'Repeat end condition', 'text', [['never', 'Never'], ['date', 'On relative date'], ['afterOccurrences', 'After N occurrences']], `${prefix}recurrence.`) + templateField(ctx, recurrence, 'endOffsetDays', 'Repeat end day offset', 'number', null, `${prefix}recurrence.`) + templateField(ctx, recurrence, 'endAfterOccurrences', 'Repeat total occurrences', 'number', null, `${prefix}recurrence.`);
      html += templateRows(ctx, 'subtasks', data.subtasks || [], prefix, 'subtask');
    } else if (type === 'project') html += field('color', 'Color', 'color') + templateRows(ctx, 'tasks', data.tasks || [], prefix, 'task');
    else if (type === 'habit') {
      html += field('trackingType', 'Tracking', 'text', [['checkbox', 'Checkbox'], ['numeric', 'Numeric']]) + field('targetValue', 'Target', 'number') + field('unit', 'Unit') + field('quickValues', 'Quick values (comma separated)', 'numbers') + field('frequencyType', 'Frequency', 'text', [['daily', 'Daily'], ['weekdays', 'Selected weekdays'], ['timesPerWeek', 'X times per week'], ['everyNDays', 'Every N days']]) + field('weekdays', 'Weekdays (0 = Sun, 1 = Mon … 6 = Sat)', 'numbers') + field('timesPerWeek', 'Times per week', 'number') + field('everyNDays', 'Every N days', 'number') + field('continuation', 'Continuation', 'text', [['automatic', 'Repeat automatically'], ['askEachPeriod', 'Ask each period'], ['onePeriod', 'One period only']]) + field('endType', 'End condition', 'text', [['never', 'Never'], ['date', 'On relative date'], ['successfulPeriods', 'After successful periods']]) + field('endOffsetDays', 'End day offset (blank = none)', 'number') + field('successfulPeriodsTarget', 'Successful periods', 'number') + templateRows(ctx, 'reminders', data.reminders || [], prefix, 'reminder');
    } else {
      html += field('progressMode', 'Progress source', 'text', [['manual', 'Manual'], ['linkedTasks', 'Linked tasks'], ['linkedHabits', 'Linked habits']]) + field('progressType', 'Progress type', 'text', [['percentage', 'Percentage'], ['numeric', 'Numeric target']]) + field('targetValue', 'Target value', 'number') + field('unit', 'Unit') + field('targetOffsetDays', 'Target day offset (blank = none)', 'number') + templateRows(ctx, 'milestones', data.milestones || [], prefix, 'milestone');
      const reminders = data.reminders || {};
      html += ['sevenDaysBefore', 'threeDaysBefore', 'oneDayBefore', 'onTargetDate'].map((key, index) => templateField(ctx, reminders, key, ['7 days before', '3 days before', '1 day before', 'On target date'][index], 'boolean', null, `${prefix}reminders.`)).join('') + templateField(ctx, reminders, 'time', 'Reminder time', 'time', null, `${prefix}reminders.`);
    }
    if (type === 'project' || type === 'habit') {
      data.goalLinkConfigs = (data.goalIds || []).map(goalId => (data.goalLinkConfigs || []).find(config => config.goalId === goalId) || (type === 'project' ? { goalId, contributionMode: 'allTasks', selectedTaskIndices: [] } : { goalId, metric: 'totalCheckins', target: type === 'habit' && data.trackingType === 'numeric' ? data.targetValue || 1 : 1 }));
      html += data.goalLinkConfigs.map((config, index) => `<fieldset class="template-rows"><legend>${esc(getGoal(config.goalId)?.title || 'Linked Goal')}</legend>${type === 'project' ? templateField(ctx, config, 'contributionMode', 'Project contribution', 'text', [['allTasks', 'All predefined tasks'], ['selectedTasks', 'Selected predefined tasks']], `${prefix}goalLinkConfigs.${index}.`) + templateField(ctx, config, 'selectedTaskIndices', 'Contributing tasks (select multiple)', 'indices', (data.tasks || []).map((task, taskIndex) => [taskIndex, task.title || `Task ${taskIndex + 1}`]), `${prefix}goalLinkConfigs.${index}.`) : templateField(ctx, config, 'metric', 'Habit metric', 'text', [['totalCheckins', 'Check-ins'], ['streak', 'Streak'], ['successfulPeriods', 'Successful periods']], `${prefix}goalLinkConfigs.${index}.`) + templateField(ctx, config, 'target', 'Goal contribution target', 'number', null, `${prefix}goalLinkConfigs.${index}.`)}</fieldset>`).join('');
    }
    return html;
  }

  function templateRows(ctx, key, rows, prefix, kind) {
    const path = prefix + key;
    return `<fieldset class="template-rows"><legend>${ctx.templateLabel(key)}</legend>${rows.map((row, index) => `<div class="template-row">${kind === 'task' ? templateFields(ctx, 'task', row, `${path}.${index}.`) : kind === 'reminder' ? templateField(ctx, row, 'time', 'Time', 'time', null, `${path}.${index}.`) + templateField(ctx, row, 'enabled', 'Enabled', 'boolean', null, `${path}.${index}.`) : templateField(ctx, row, 'title', 'Title', 'text', null, `${path}.${index}.`) + (kind === 'milestone' ? templateField(ctx, row, 'dateOffsetDays', 'Day offset (blank = none)', 'number', null, `${path}.${index}.`) : '')}<button class="btn btn-ghost" type="button" data-action="template-remove-row" data-path="${path}" data-index="${index}">Remove ${kind}</button></div>`).join('')}<button class="btn btn-ghost" type="button" data-action="template-add-row" data-path="${path}" data-kind="${kind}">Add ${kind}</button></fieldset>`;
  }

  function renderTemplateModal(ctx) {
    const { modalState, modalFrame, templateLabel, esc } = ctx, draft = modalState.draft;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${modalState.templateId ? 'Edit' : 'New'} ${templateLabel(draft.type)} template</h2><button class="btn-icon" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">Template name<input id="template-name" class="input" value="${esc(draft.name)}"></label><p class="area-empty-copy">Use {{date}}, {{today}} or {{tomorrow}} in titles and notes. Day offsets are relative to the day you create an item.</p>${templateFields(ctx, draft.type, draft.data)}${modalState.error ? `<p class="validation" role="alert">${esc(modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><button class="btn btn-primary" type="button" data-action="save-template">Save template</button></div></div>`, 'quick');
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
    const relativeProblem = value => value && typeof value === 'object' && Object.entries(value).some(([key, item]) => key.endsWith('OffsetDays') ? item !== null && !Number.isInteger(item) : typeof item === 'object' && relativeProblem(item));
    if (relativeProblem(data)) return 'Day offsets must be whole numbers.';
    if (type === 'task' && data.recurrence?.frequency && (!Number.isInteger(data.recurrence.interval) || data.recurrence.interval < 1 || data.recurrence.endType === 'afterOccurrences' && (!Number.isInteger(data.recurrence.endAfterOccurrences) || data.recurrence.endAfterOccurrences < 1))) return 'Repeat interval and occurrence count must be positive whole numbers.';
    if (type === 'task' && data.recurrence?.frequency && data.recurrence.endType === 'date' && !Number.isInteger(data.recurrence.endOffsetDays)) return 'Provide a whole-number repeat end day offset.';
    if (type === 'task' && (data.subtasks || []).some(subtask => !String(subtask.title || '').trim())) return 'Subtasks need a title.';
    if (type === 'project') for (const task of data.tasks || []) { if (!String(task.title || '').trim()) return 'Predefined tasks need a title.'; const error = templateDataProblem('task', task); if (error) return error; }
    if (type === 'goal' && (data.milestones || []).some(milestone => !String(milestone.title || '').trim())) return 'Milestones need a title.';
    if ((type === 'habit' && data.trackingType === 'numeric' || type === 'goal' && data.progressType === 'numeric') && !(data.targetValue > 0)) return 'Numeric targets must be above zero.';
    if (type === 'habit' && data.frequencyType === 'weekdays' && (!(data.weekdays || []).length || data.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6))) return 'Select valid weekdays from 0 to 6.';
    if (type === 'habit' && data.frequencyType === 'timesPerWeek' && (!Number.isInteger(data.timesPerWeek) || data.timesPerWeek < 1 || data.timesPerWeek > 7)) return 'Times per week must be a positive whole number up to 7.';
    if (type === 'habit' && data.frequencyType === 'everyNDays' && (!Number.isInteger(data.everyNDays) || data.everyNDays < 1)) return 'Every N days must be a positive whole number.';
    if (type === 'habit' && data.endType === 'successfulPeriods' && (!Number.isInteger(data.successfulPeriodsTarget) || data.successfulPeriodsTarget < 1)) return 'Successful periods must be a positive whole number.';
    if (type === 'habit' && data.endType === 'date' && !Number.isInteger(data.endOffsetDays)) return 'Provide a whole-number end day offset.';
    if (type === 'habit' && (data.goalLinkConfigs || []).some(config => !(config.target > 0))) return 'Goal contribution targets must be above zero.';
    return null;
  }

  function save(ctx) {
    readDraft(ctx); const { modalState, renderModal, saveTemplateRecord } = ctx, draft = modalState.draft;
    if (!draft.name.trim() || !String(draft.data.title || draft.data.name || '').trim()) { modalState.error = 'Template and item need a name.'; renderModal(); return; }
    const problem = templateDataProblem(draft.type, draft.data);
    if (problem) { modalState.error = problem; renderModal(); return; }
    if (!saveTemplateRecord(modalState.templateId, draft)) { modalState.error = 'This template was changed or deleted. Reopen it and try again.'; renderModal(); }
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
    ctx.openConfirm({ title: 'Remove template row?', message: 'This changes only the template draft.', onConfirm: () => { parent[last].splice(index, 1); adjustSelections(editor.draft.data); restoreEditor(); ctx.setUndo('Template row removed', () => {
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
      if (action === 'template-type') { ctx.state.ui.templateType = element.dataset.templateType; ctx.saveAndRender(); }
      else if (action === 'new-template') openEditor(ctx);
      else if (action === 'edit-template') openEditor(ctx, element.dataset.templateId);
      else if (action === 'save-template' && !element.dataset.popAction) save(ctx);
      else if (action === 'delete-template') ctx.requestDeleteEntity('template', element.dataset.templateId);
      else if (action === 'duplicate-template') ctx.duplicateTemplateRecord(element.dataset.templateId);
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
