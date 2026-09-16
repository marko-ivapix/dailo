(function () {
  'use strict';

  const TYPES = [
    { id: 'task', label: 'Task', icon: 'check-square' },
    { id: 'project', label: 'Project', icon: 'folder-simple' },
    { id: 'habit', label: 'Habit', icon: 'repeat' },
    { id: 'goal', label: 'Goal', icon: 'target' },
  ];

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

  function offsetLabel(offset, { today = 'Today', before = false } = {}) {
    const days = Number(offset);
    if (!Number.isFinite(days)) return '';
    if (days === 0) return today;
    const amount = Math.abs(days);
    const label = `${amount} ${amount === 1 ? 'day' : 'days'}`;
    return before || days < 0 ? `${label} before` : `+${label}`;
  }

  function relativeDateSummary(data) {
    const parts = [];
    if (Number.isFinite(Number(data.plannedOffsetDays))) parts.push(`Planned ${offsetLabel(data.plannedOffsetDays)}`);
    if (Number.isFinite(Number(data.dueOffsetDays))) parts.push(`Due ${offsetLabel(data.dueOffsetDays)}`);
    if (Number.isFinite(Number(data.targetOffsetDays))) parts.push(`Target ${offsetLabel(data.targetOffsetDays)}`);
    return parts;
  }

  function valueOrFallback(value, fallback) {
    return value === undefined || value === null || value === '' ? fallback : value;
  }

  function templateDetails(template) {
    const data = template.data || {};
    const dates = relativeDateSummary(data);
    const details = [];

    if (template.type === 'task') {
      if (data.priority && data.priority !== 'none') details.push(`${data.priority[0].toUpperCase()}${data.priority.slice(1)} priority`);
      if (Array.isArray(data.subtasks) && data.subtasks.length) details.push(plural(data.subtasks.length, 'subtask'));
    } else if (template.type === 'project') {
      const tasks = data.tasks || data.predefinedTasks || [];
      if (Array.isArray(tasks) && tasks.length) details.push(plural(tasks.length, 'predefined task'));
    } else if (template.type === 'habit') {
      if (data.frequency) details.push(String(data.frequency).replace(/([A-Z])/g, ' $1'));
      if (data.trackingType) details.push(`${data.trackingType} tracking`);
      if (data.targetValue) details.push(`${data.targetValue}${data.unit ? ` ${data.unit}` : ''} target`);
    } else if (template.type === 'goal') {
      if (data.progressMode) details.push(String(data.progressMode).replace(/([A-Z])/g, ' $1'));
      if (data.targetValue) details.push(`${data.targetValue}${data.unit ? ` ${data.unit}` : ''} target`);
      if (Array.isArray(data.milestones) && data.milestones.length) details.push(plural(data.milestones.length, 'milestone'));
    }

    return [...dates, ...details].filter(Boolean);
  }

  function titleFor(template) {
    const data = template.data || {};
    return valueOrFallback(template.name, valueOrFallback(data.title, valueOrFallback(data.name, 'Untitled template')));
  }

  function renderTemplateCard(template) {
    const type = TYPES.find(item => item.id === template.type) || TYPES[0];
    const details = templateDetails(template);
    const title = titleFor(template);
    const id = esc(template.id);
    const typeLabel = esc(type.label);

    return `<article class="template-card" data-template-id="${id}" data-template-type="${esc(type.id)}">
      <div class="template-card-main">
        <span class="template-card-icon" aria-hidden="true"><i class="ph ph-${type.icon}"></i></span>
        <div class="template-card-copy">
          <div class="template-card-heading"><h3>${esc(title)}</h3><span class="template-type-badge">${typeLabel}</span></div>
          <p class="template-card-summary">${details.length ? esc(details.join(' · ')) : 'Reusable setup'}</p>
        </div>
      </div>
      <div class="template-card-actions" aria-label="${typeLabel} template actions">
        <button class="btn btn-secondary" type="button" data-action="instantiate-template" data-template-id="${id}"><i class="ph ph-plus"></i> Use</button>
        <button class="btn-icon" type="button" data-action="edit-template" data-template-id="${id}" aria-label="Edit ${esc(title)}"><i class="ph ph-pencil-simple"></i></button>
        <button class="btn-icon" type="button" data-action="duplicate-template" data-template-id="${id}" aria-label="Duplicate ${esc(title)}"><i class="ph ph-copy"></i></button>
        <button class="btn-icon" type="button" data-action="delete-template" data-template-id="${id}" aria-label="Delete ${esc(title)}"><i class="ph ph-trash"></i></button>
      </div>
    </article>`;
  }

  function renderTemplates(templates, activeType = 'task') {
    const items = Array.isArray(templates) ? templates : [];
    const type = TYPES.some(item => item.id === activeType) ? activeType : 'task';
    const counts = Object.fromEntries(TYPES.map(item => [item.id, items.filter(template => template.type === item.id).length]));
    const visible = items.filter(template => template.type === type);
    const typeLabel = TYPES.find(item => item.id === type).label;
    const tabs = TYPES.map(item => `<button class="filter-chip ${item.id === type ? 'is-active' : ''}" type="button" data-action="select-template-type" data-template-type="${item.id}" aria-pressed="${item.id === type}">${item.label}<span>${counts[item.id]}</span></button>`).join('');
    const empty = `<div class="empty-state"><h3>No ${typeLabel.toLowerCase()} templates yet</h3><p>Save an existing ${typeLabel.toLowerCase()} or start a reusable setup from scratch.</p><button class="btn btn-primary" type="button" data-action="new-template" data-template-type="${type}"><i class="ph ph-plus"></i> New ${typeLabel} template</button></div>`;

    return `<header class="page-header"><div><h1>Templates</h1><p>Reusable setups with dates that adapt when you use them.</p></div><div class="page-actions"><button class="btn btn-primary" type="button" data-action="new-template" data-template-type="${type}"><i class="ph ph-plus"></i> New template</button></div></header>
      <section class="template-library" aria-label="Template library">
        <div class="filter-bar template-type-tabs" role="tablist" aria-label="Template type">${tabs}</div>
        <div class="template-list" role="list">${visible.length ? visible.map(renderTemplateCard).join('') : empty}</div>
      </section>`;
  }

  function renderSaveAsTemplate(type, id, label = 'Save as template') {
    const safeType = TYPES.some(item => item.id === type) ? type : 'task';
    return `<button class="popover-option" type="button" data-action="save-as-template" data-entity-type="${safeType}" data-entity-id="${esc(id)}"><i class="ph ph-bookmark-simple"></i>${esc(label)}</button>`;
  }

  window.TodoTemplatesUI = Object.freeze({
    TYPES,
    offsetLabel,
    relativeDateSummary,
    renderTemplateCard,
    renderTemplates,
    renderSaveAsTemplate,
  });
}());
