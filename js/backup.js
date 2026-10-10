(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Marks a user-visible error text as a translation key (see js/i18n.js); the app translates it where it is shown.
  const msg = text => text;

  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  const MAX_ATTACHMENTS_PER_OWNER = 10;
  // ZIP limits protect the local-first app from malformed archives and
  // decompression bombs before any replacement or IndexedDB write is attempted.
  // The export checks the same limits (audit E-1), so every backup Dailo writes
  // can be imported again. Callers may pass smaller limits in tests.
  const LIMITS = Object.freeze({
    maxZipEntries: 2000,
    maxAttachments: 1000,
    maxAttachmentBytes: 250 * 1024 * 1024,
    maxDecompressedBytes: 300 * 1024 * 1024,
  });
  // V1.3/V1.4 share the ZIP format. The app/schema version is tracked
  // separately in the manifest data (`data.version === 3`).
  const BACKUP_VERSION = 2;

  function requireZip() {
    if (!root.JSZip) throw new Error(msg('ZIP support unavailable'));
    return root.JSZip;
  }

  function safeName(name) {
    const cleaned = String(name || 'attachment').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').trim();
    return cleaned || 'attachment';
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ownerDirectory(owner) {
    return `attachments/${owner.type}_${owner.type === 'task' ? safeName(owner.item.id) : encodeURIComponent(owner.item.id)}`;
  }

  function uniquePath(owner, fileName, used) {
    const cleaned = safeName(fileName);
    const base = ['.', '..'].includes(cleaned) ? 'attachment' : cleaned;
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    let index = 1;
    let path = `${ownerDirectory(owner)}/${base}`;
    while (used.has(path)) { index += 1; path = `${ownerDirectory(owner)}/${stem}-${index}${ext}`; }
    used.add(path);
    return path;
  }

  async function exportBackup(state, attachmentApi, nowIso) {
    return exportBackupV3(state, { attachments: attachmentApi, habitLogs: root.TodoStorage.habitLogs, goalHistory: root.TodoStorage.goalHistory }, nowIso);
  }

  async function exportBackupV3(state, storage, nowIso, options = {}) {
    const limits = { ...LIMITS, ...(options.limits || {}) };
    const source = state;
    const sourceText = JSON.stringify(state);
    state = deepClone(state);
    delete state.habitLogCache; delete state.habitMetrics;
    const JSZip = requireZip();
    const zip = new JSZip();
    const used = new Set();
    const metadata = [];
    const referenced = new Set();
    const owners = root.TodoStorage.attachmentOwners(state);
    for (const owner of owners) for (const id of owner.item.attachmentIds || []) referenced.add(id);
    const records = await storage.attachments.getMany([...referenced]);
    const habitLogs = await storage.habitLogs.listAll(), goalHistory = await storage.goalHistory.listAll();
    validateDomain(state, habitLogs, goalHistory);
    validateIds(state, records);
    root.TodoStorage.verifyAttachmentReferences(state, records);
    // The import would refuse anything over these limits, so the export stops first (audit E-1).
    const attachmentBytes = records.reduce((sum, record) => sum + (Number(record.blob?.size ?? record.size) || 0), 0);
    if (records.length + 1 > limits.maxZipEntries) throw new Error(`${msg('Backup exceeds ZIP entry limit')}: ${limits.maxZipEntries}`);
    if (records.length > limits.maxAttachments) throw new Error(`${msg('Backup exceeds attachment count limit')}: ${limits.maxAttachments}`);
    if (attachmentBytes > limits.maxAttachmentBytes) throw new Error(`${msg('Backup exceeds attachment bytes limit (bytes)')}: ${limits.maxAttachmentBytes}`);
    const byId = new Map(records.map(record => [record.id, record]));
    for (const owner of owners) {
      for (const id of owner.item.attachmentIds || []) {
        const record = byId.get(id);
        const path = uniquePath(owner, record.fileName, used);
        zip.file(path, await record.blob.arrayBuffer());
        const item = { ...record, blobType: record.blob.type, path }; delete item.blob;
        metadata.push(item);
      }
    }
    const manifest = { backupVersion: BACKUP_VERSION, appVersion: '1.3', releaseVersion: root.DailoRelease?.APP_VERSION || null, exportedAt: nowIso, data: state, attachments: metadata, habitLogs, goalHistory };
    if (JSON.stringify(source) !== sourceText) throw new Error(msg('Source changed during export. Retry.'));
    const dataText = JSON.stringify(manifest, null, 2);
    if (attachmentBytes + new TextEncoder().encode(dataText).length > limits.maxDecompressedBytes) throw new Error(`${msg('Backup exceeds decompressed size limit (bytes)')}: ${limits.maxDecompressedBytes}`);
    zip.file('data.json', dataText);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    if (JSON.stringify(source) !== sourceText) throw new Error(msg('Source changed during export. Retry.'));
    return blob;
  }

  function validateDomain(state, logs, history) {
    const fail = label => { throw new Error(`${msg('Invalid backup')}: ${label}`); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const name = value => typeof value === 'string' && value.trim();
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && root.TodoCore.parseDateOnly(value) && root.TodoCore.dateOnly(root.TodoCore.parseDateOnly(value)) === value;
    const enumField = (item, key, values) => { if (item[key] != null && !values.includes(item[key])) fail(key); };
    const dateField = (item, key) => { if (item[key] != null && !date(item[key])) fail(key); };
    const numberField = (item, key, min = 0) => { if (item[key] != null && (typeof item[key] !== 'number' || !Number.isFinite(item[key]) || item[key] < min)) fail(key); };
    const booleanField = (item, key) => { if (item[key] != null && typeof item[key] !== 'boolean') fail(key); };
    const positiveInteger = value => Number.isInteger(value) && value > 0;
    const positiveField = (item, key) => { numberField(item,key); if (item[key] != null && item[key] <= 0) fail(key); };
    // R11a: weekly weekdays, monthly by day or nth weekday; each only with its own frequency and mode.
    const recurrenceDays = item => {
      const weekday = value => Number.isInteger(value) && value >= 0 && value <= 6;
      if (item.weekdays != null && (item.frequency !== 'weekly' || !Array.isArray(item.weekdays) || !item.weekdays.length || !item.weekdays.every(weekday) || new Set(item.weekdays).size !== item.weekdays.length)) fail('recurrence');
      if (item.monthMode != null && (item.frequency !== 'monthly' || !['day','weekday'].includes(item.monthMode))) fail('recurrence');
      if (item.monthMode === 'day' ? !(item.monthDay === 'last' || Number.isInteger(item.monthDay) && item.monthDay >= 1 && item.monthDay <= 31) : item.monthDay != null) fail('recurrence');
      if (item.monthMode === 'weekday' ? !(item.weekOfMonth === 'last' || Number.isInteger(item.weekOfMonth) && item.weekOfMonth >= 1 && item.weekOfMonth <= 4) || !weekday(item.weekday) : item.weekOfMonth != null || item.weekday != null) fail('recurrence');
    };
    const recurrence = item => {
      if (item == null) return;
      if (!object(item) || !['daily','weekly','monthly','yearly'].includes(item.frequency) || !positiveInteger(item.interval)) fail('recurrence');
      recurrenceDays(item);
      enumField(item,'status',['active','paused','ended']);enumField(item,'endType',['never','date','afterOccurrences']);dateField(item,'endDate');
      if (item.endType === 'date' && !date(item.endDate) || item.endType === 'afterOccurrences' && !positiveInteger(item.endAfterOccurrences)) fail('recurrence end');
      numberField(item,'occurrencesCreated');booleanField(item,'skipNext');
    };
    // Pre-extension V3 ZIPs omitted both knowledge collections.
    state = { notes: [], resources: [], ...state };
    const ids = {};
    const allIds = new Set();
    for (const collection of ['tasks','projects','tags','areas','goals','habits','notes','resources','templates','savedViews']) {
      if (!Array.isArray(state[collection])) fail(collection);
      ids[collection] = new Set();
      for (const item of state[collection]) {
        if (!object(item) || !name(item.id) || ids[collection].has(item.id) || allIds.has(item.id) || !name(item[['tasks','goals','notes','resources'].includes(collection) ? 'title' : 'name'])) fail(allIds.has(item.id) ? 'duplicate-id' : collection);
        ids[collection].add(item.id);
        allIds.add(item.id);
      }
    }
    const ref = (value, collection) => { if (value != null && !ids[collection].has(value)) fail(`${collection} reference`); };
    const refs = (item, key, collection) => { if (item[key] != null) { if (!Array.isArray(item[key]) || new Set(item[key]).size !== item[key].length) fail(key); item[key].forEach(id => ref(id, collection)); } };
    const nested = (items, label) => { if (!Array.isArray(items) || items.some(item => !object(item) || !name(item.id)) || new Set(items.map(item => item.id)).size !== items.length) fail(label); };
    const entityTimestamps = (item, label) => { if (!root.TodoCore.validEntityTimestamps(item)) fail(`${label} timestamp`); };
    const taskFields = (task, baseline = false) => {
      if (!object(task) || !name(task.title)) fail(baseline ? 'recurrence baseline' : 'task');
      entityTimestamps(task, baseline ? 'recurrence baseline' : 'task');
      for (const key of ['notes']) if (task[key] != null && typeof task[key] !== 'string') fail(key);
      for (const key of ['id','projectId','areaId','recurrenceSuccessorId']) if (task[key] != null && !name(task[key])) fail(key);
      for (const key of ['goalIds','tagIds','attachmentIds']) if (task[key] != null
        && (!Array.isArray(task[key]) || task[key].some(id => !name(id)) || new Set(task[key]).size !== task[key].length)) fail(key);
      enumField(task,'priority',['none','low','medium','high']);
      booleanField(task,'isCompleted');booleanField(task,'isInbox');recurrence(task.recurrence);
      for (const key of ['plannedDate','dueDate']) dateField(task,key);
      booleanField(task,'isImportant'); booleanField(task,'isUrgent');
      for (const key of ['plannedTime','dueTime']) if (task[key] != null && root.TodoCore.normalizeTime(task[key]) !== task[key]) fail(key);
      for (const key of ['reminderAt','reminderFiredAt','completedAt']) if (task[key] != null
        && (typeof task[key] !== 'string' || !Number.isFinite(Date.parse(task[key])))) fail(key);
      for (const key of ['todayOrder','projectOrder','inboxOrder']) numberField(task,key,-Infinity);
      if (task.durationMinutes != null && !positiveInteger(task.durationMinutes)) fail('durationMinutes');
      if (task.subtasks != null) {
        nested(task.subtasks,'subtasks');
        for (const sub of task.subtasks) {
          if (!name(sub.title) || sub.subtasks != null && (!Array.isArray(sub.subtasks) || sub.subtasks.length)) fail('subtask');
          booleanField(sub,'isCompleted');numberField(sub,'order');
        }
      }
      // A baseline is the actual source of the next occurrence. Its references
      // may be stale and are pruned by generation, but its values must be usable.
      if (task.recurrenceBaseline != null) taskFields(task.recurrenceBaseline, true);
    };
    for (const item of [...state.tasks, ...state.projects, ...state.goals, ...state.habits, ...state.notes, ...state.resources]) ref(item.areaId, 'areas');
    for (const collection of ['notes', 'resources']) for (const item of state[collection]) {
      booleanField(item, 'favorite');
      if (item.clip != null && typeof item.clip !== 'string') fail('clip');
      for (const field of [collection === 'notes' ? 'body' : 'description', 'createdAt', 'updatedAt'])
        if (typeof item[field] !== 'string') fail(`${collection} ${field}`);
      if (item.createdAt !== '' && !root.TodoCore.isIsoTimestamp(item.createdAt)
        || item.updatedAt !== '' && !root.TodoCore.isIsoTimestamp(item.updatedAt)) fail(`${collection} timestamp`);
      if (item.areaId != null && !name(item.areaId)) fail(`${collection} Area`);
      if (!Array.isArray(item.linkUrls) || item.linkUrls.some(url => typeof url !== 'string')) fail(`${collection} links`);
      refs(item, 'tagIds', 'tags');
      if (!Array.isArray(item.attachmentIds) || item.attachmentIds.some(id => !name(id))
        || new Set(item.attachmentIds).size !== item.attachmentIds.length) fail(`${collection} attachments`);
      if (collection === 'resources') for (const [field, target] of Object.entries({ relatedTaskIds: 'tasks', relatedProjectIds: 'projects', relatedGoalIds: 'goals', relatedHabitIds: 'habits' })) {
        if (!Array.isArray(item[field]) || item[field].some(id => !name(id))) fail(field);
        refs(item, field, target);
      }
      if (collection === 'resources') {
        enumField(item, 'type', ['book', 'video', 'article', 'course', 'document', 'other']);
        enumField(item, 'status', ['unread', 'reading', 'completed']);
        if (item.author != null && typeof item.author !== 'string') fail('author');
        dateField(item, 'reviewedAt');
      }
    }
    for (const item of [...state.tasks, ...state.projects, ...state.habits]) refs(item, 'goalIds', 'goals');
    for (const task of state.tasks) {
      ref(task.projectId,'projects'); refs(task,'tagIds','tags');
      taskFields(task);
    }
    for (const area of state.areas) enumField(area,'status',['active','archived']);
    for (const item of state.projects) for (const field of ['createdAt', 'updatedAt']) if (item[field] != null && item[field] !== '' && !root.TodoCore.isIsoTimestamp(item[field])) fail(`project ${field} timestamp`);
    for (const goal of state.goals) {
      entityTimestamps(goal, 'Goal');
      enumField(goal,'horizon',['short','mid','long']);
      enumField(goal,'status',['active','paused','completed','archived']); enumField(goal,'progressMode',['manual','linkedTasks','linkedHabits']); enumField(goal,'progressType',['percentage','numeric']);
      numberField(goal,'currentValue');positiveField(goal,'targetValue');dateField(goal,'targetDate');refs(goal,'taskIds','tasks');
      if (goal.unit != null && typeof goal.unit !== 'string') fail('Goal unit');
      if (goal.projectLinks != null) { if (!Array.isArray(goal.projectLinks) || new Set(goal.projectLinks.map(link=>link?.projectId)).size !== goal.projectLinks.length) fail('project links'); for (const link of goal.projectLinks) { if (!object(link) || !link.projectId || !['allTasks','selectedTasks'].includes(link.contributionMode)) fail('project link');ref(link.projectId,'projects');refs(link,'selectedTaskIds','tasks');if ((link.selectedTaskIds || []).some(id => state.tasks.find(task => task.id === id)?.projectId !== link.projectId)) fail('selected project Task'); } }
      if (goal.habitLinks != null) { if (!Array.isArray(goal.habitLinks) || new Set(goal.habitLinks.map(link=>link?.habitId)).size !== goal.habitLinks.length) fail('habit links');for (const link of goal.habitLinks) { if (!object(link) || !link.habitId || !['totalCheckins','streak','successfulPeriods','totalValue','currentStreak','longestStreak','completionRate'].includes(link.metric) || !(link.target > 0)) fail('habit link');ref(link.habitId,'habits');positiveField(link,'target'); } }
      if (goal.milestones != null) { nested(goal.milestones,'milestones');for (const item of goal.milestones) { if (!name(item.title)) fail('milestone');dateField(item,'date'); } }
      if (goal.reminders != null && (!object(goal.reminders) || goal.reminders.time != null && root.TodoCore.normalizeTime(goal.reminders.time) !== goal.reminders.time)) fail('Goal reminders');
    }
    for (const habit of state.habits) {
      entityTimestamps(habit, 'Habit');
      enumField(habit,'routine',['morning','daily','night']);
      enumField(habit,'status',['active','paused','archived']);enumField(habit,'trackingType',['checkbox','numeric']);enumField(habit,'frequencyType',['daily','weekdays','timesPerWeek','everyNDays']);enumField(habit,'continuation',['automatic','askEachPeriod','onePeriod']);enumField(habit,'endType',['never','date','successfulPeriods']);
      for (const key of ['startDate','endDate']) dateField(habit,key);
      for (const key of ['targetValue','timesPerWeek','everyNDays','successfulPeriodsTarget']) positiveField(habit,key);
      for (const key of ['minimumTarget','idealTarget']) {
        if (habit.trackingType === 'numeric' && habit.frequencyType !== 'timesPerWeek') positiveField(habit, key);
        else if (habit[key] != null && !positiveInteger(habit[key])) fail(key);
      }
      if (habit.idealTarget != null && habit.minimumTarget != null && habit.idealTarget < habit.minimumTarget) fail('idealTarget');
      if (habit.targetHistory != null && (!Array.isArray(habit.targetHistory) || habit.targetHistory.length > 104
        || habit.targetHistory.some(entry => !object(entry) || !date(entry.before) || !Number.isInteger(entry.timesPerWeek) || entry.timesPerWeek < 1 || entry.timesPerWeek > 7))) fail('targetHistory');
      if (habit.graceDays != null && (!Number.isInteger(habit.graceDays) || habit.graceDays < 0)) fail('graceDays');
      if (habit.trackingType === 'numeric' && !(habit.targetValue > 0)
        || habit.frequencyType === 'timesPerWeek' && (!positiveInteger(habit.timesPerWeek) || habit.timesPerWeek > 7)
        || habit.frequencyType === 'everyNDays' && !positiveInteger(habit.everyNDays)
        || habit.frequencyType === 'weekdays' && !habit.weekdays?.length
        || habit.endType === 'date' && !date(habit.endDate)
        || habit.endType === 'successfulPeriods' && !positiveInteger(habit.successfulPeriodsTarget)) fail('Habit configuration');
      if (habit.weekdays != null && (!Array.isArray(habit.weekdays) || habit.weekdays.some(n => !Number.isInteger(n) || n < 0 || n > 6))) fail('weekdays');
      if (habit.quickValues != null && (!Array.isArray(habit.quickValues) || habit.quickValues.some(n => typeof n !== 'number' || !Number.isFinite(n) || n <= 0))) fail('quick values');
      if (habit.reminders != null) { nested(habit.reminders,'Habit reminders');for (const item of habit.reminders) if (root.TodoCore.normalizeTime(item.time) !== item.time) fail('Habit reminder time'); }
    }
    const templateData = data => {
      if (!object(data)) fail('Template data');
      if (data.durationMinutes != null && !positiveInteger(data.durationMinutes)) fail('Template durationMinutes');
      for (const key of ['minimumTarget','idealTarget']) {
        if (data.trackingType === 'numeric' && data.frequencyType !== 'timesPerWeek') positiveField(data,key);
        else if (data[key] != null && !positiveInteger(data[key])) fail('Template ' + key);
      }
      if (data.minimumTarget != null && data.idealTarget != null && data.idealTarget < data.minimumTarget) fail('Template idealTarget');
      if (data.graceDays != null && (!Number.isInteger(data.graceDays) || data.graceDays < 0)) fail('Template graceDays');
      for (const key of ['goalIds','tagIds']) if (data[key] != null && (!Array.isArray(data[key]) || data[key].some(id => !name(id)))) fail(`Template ${key}`);
      for (const key of ['projectId','areaId','goalId']) if (data[key] != null && !name(data[key])) fail(`Template ${key}`);
      for (const key of ['plannedOffsetDays','dueOffsetDays','reminderOffsetDays','targetOffsetDays','endOffsetDays','dateOffsetDays']) if (data[key] != null && !Number.isInteger(data[key])) fail(`Template ${key}`);
      for (const key of ['plannedTime','dueTime','reminderTime','time']) if (data[key] != null && root.TodoCore.normalizeTime(data[key]) !== data[key]) fail(`Template ${key}`);
      for (const key of ['targetValue','target','timesPerWeek','everyNDays','successfulPeriodsTarget','interval','endAfterOccurrences']) positiveField(data,key);
      enumField(data,'priority',['none','low','medium','high']);enumField(data,'frequencyType',['daily','weekdays','timesPerWeek','everyNDays']);enumField(data,'trackingType',['checkbox','numeric']);enumField(data,'progressMode',['manual','linkedTasks','linkedHabits']);enumField(data,'progressType',['percentage','numeric']);enumField(data,'frequency',['daily','weekly','monthly','yearly']);
      for (const key of ['tasks','subtasks','milestones','goalLinkConfigs']) if (data[key] != null) { if (!Array.isArray(data[key])) fail(`Template ${key}`);data[key].forEach(templateData); }
      if (data.reminders != null) { if (Array.isArray(data.reminders)) data.reminders.forEach(templateData);else templateData(data.reminders); }
      if (data.recurrence != null) { templateData(data.recurrence);recurrenceDays(data.recurrence); }
      if (data.selectedTaskIndices != null && (!Array.isArray(data.selectedTaskIndices) || data.selectedTaskIndices.some(index=>!Number.isInteger(index) || index<0))) fail('Template selected tasks');
    };
    for (const item of state.templates) { if (!['task','project','goal','habit'].includes(item.type)) fail('Template type');templateData(item.data); }
    for (const item of state.savedViews) {
      if (!['tasks','goals','habits'].includes(item.type) || !object(item.filters)) fail('Saved View filters');
      for (const key of ['projectId','areaId','tagId']) if (item.filters[key] != null && !name(item.filters[key])) fail('Saved View reference');
      enumField(item.filters,'priority',['none','low','medium','high']);
      enumField(item.filters,'status',item.type==='goals'?['active','paused','completed','archived']:['active','paused','archived']);
      for (const key of ['plannedDate','dueDate','targetDate']) dateField(item.filters,key);
    }
    if (state.settings?.focusTaskIds != null) {
      if (!Array.isArray(state.settings.focusTaskIds) || new Set(state.settings.focusTaskIds).size !== state.settings.focusTaskIds.length) fail('focusTaskIds');
      state.settings.focusTaskIds.forEach(id => ref(id, 'tasks'));
    }
    if (state.settings?.dashboard != null) {
      const dashboard = state.settings.dashboard;
      if (!object(dashboard) || dashboard.focusedMode != null && typeof dashboard.focusedMode !== 'boolean') fail('dashboard');
      for (const key of ['sectionOrder', 'pinnedSectionIds']) if (dashboard[key] != null && (!Array.isArray(dashboard[key]) || dashboard[key].some(value => !name(value)) || new Set(dashboard[key]).size !== dashboard[key].length)) fail('dashboard');
    }
    // R12a: the journal — one entry per day, its id taken from the day; the evening reminder time or null.
    if (state.journal != null) {
      if (!Array.isArray(state.journal)) fail('journal');
      const days = new Set();
      for (const item of state.journal) {
        if (!object(item) || !date(item.date) || item.id !== root.TodoCore.journalEntryId(item.date) || days.has(item.date) || typeof item.text !== 'string'
          || item.mood != null && !(Number.isInteger(item.mood) && item.mood >= 1 && item.mood <= 5)) fail('journal');
        days.add(item.date);
        entityTimestamps(item, 'journal');
      }
    }
    if (state.settings?.journalReminderTime != null && root.TodoCore.normalizeTime(state.settings.journalReminderTime) !== state.settings.journalReminderTime) fail('journalReminderTime');
    if (state.settings != null) {
      if (!object(state.settings)) fail('settings');
      enumField(state.settings, 'todayFocusFilter', ['all', 'open', 'completed', 'important', 'dueToday']);
      for (const key of ['todayFocusStrip', 'compactDensity']) booleanField(state.settings, key);
      if (state.settings.todayVisibleSections != null && (!Array.isArray(state.settings.todayVisibleSections)
        || state.settings.todayVisibleSections.some(section => !['focus', 'review', 'actions'].includes(section))
        || new Set(state.settings.todayVisibleSections).size !== state.settings.todayVisibleSections.length)) fail('todayVisibleSections');
      if (state.settings.weekStartsOn != null && ![0, 1, 'monday', 'sunday'].includes(state.settings.weekStartsOn)) fail('weekStartsOn');
      if (state.settings.weekStartHistory != null && (!Array.isArray(state.settings.weekStartHistory) || state.settings.weekStartHistory.length > 52
        || state.settings.weekStartHistory.some(entry => !object(entry) || !date(entry.before) || !['monday', 'sunday'].includes(entry.weekStartsOn) || entry.changedOn != null && !date(entry.changedOn)))) fail('weekStartHistory');
      if (state.settings.backupReminderDays != null && !(Number.isInteger(state.settings.backupReminderDays) && state.settings.backupReminderDays >= 0 && state.settings.backupReminderDays <= 90)) fail('backupReminderDays');
      if (state.settings.dailyCapacityMinutes != null && !(Number.isInteger(state.settings.dailyCapacityMinutes) && state.settings.dailyCapacityMinutes >= 0 && state.settings.dailyCapacityMinutes <= 1440)) fail('dailyCapacityMinutes');
      if (state.settings.weeklyReviews != null && (!Array.isArray(state.settings.weeklyReviews) || state.settings.weeklyReviews.length > 52
        || state.settings.weeklyReviews.some(entry => !object(entry) || !date(entry.weekStart) || !root.TodoCore.isIsoTimestamp(entry.completedAt)))) fail('weeklyReviews');
    }
    nested(logs,'Habit logs');nested(history,'Goal history');const days = new Set();
    for (const log of logs) { ref(log.habitId,'habits');if (!log.habitId || !date(log.date) || days.has(`${log.habitId}:${log.date}`) || !['done','skipped','missed'].includes(log.status)) fail('Habit log');days.add(`${log.habitId}:${log.date}`);numberField(log,'value'); }
    for (const event of history) { ref(event.goalId,'goals');if (!event.goalId || !['created','progressChanged','statusChanged','targetDateChanged','projectLinked','projectUnlinked','manualProgress'].includes(event.type) || !object(event.data) || typeof event.createdAt !== 'string' || !event.createdAt || !root.TodoCore.isIsoTimestamp(event.createdAt)) fail('Goal history timestamp'); }
  }

  function validateIds(state, attachments) {
    const owners = new Map();
    for (const owner of root.TodoStorage.attachmentOwners(state)) {
      const ids = owner.item.attachmentIds || [];
      if (ids.length > MAX_ATTACHMENTS_PER_OWNER) throw new Error(msg('An item has more than 10 attachments'));
      for (const id of ids) {
        if (typeof id !== 'string' || !id.trim() || owners.has(id)) throw new Error(msg('Invalid or reused attachment ID'));
        owners.set(id, owner);
      }
    }
    const attachmentIds = new Set();
    for (const item of attachments || []) {
      const owner = owners.get(item?.id);
      if (!owner || attachmentIds.has(item.id) || !root.TodoStorage.attachmentBelongsTo(item, owner)
        || typeof item.fileName !== 'string' || typeof item.mimeType !== 'string' || item.pendingDeleteUntil || item.pendingDeleteToken)
        throw new Error(msg('Invalid attachment metadata or ownership'));
      attachmentIds.add(item.id);
      if (!Number.isInteger(item.size) || item.size < 0 || item.size > MAX_ATTACHMENT_BYTES) throw new Error(msg('Invalid attachment size'));
    }
    for (const id of owners.keys()) if (!attachmentIds.has(id)) throw new Error(`${msg('Missing attachment metadata')}: ${id}`);
    return owners;
  }

  async function inspectBackup(fileOrBlob) {
    return inspectBackupV3(fileOrBlob);
  }

  function limitOptions(options = {}) {
    return { ...LIMITS, ...(options.limits || {}) };
  }

  function preflightZip(zip, limits) {
    const entries = Object.values(zip.files || {});
    if (entries.length > limits.maxZipEntries) throw new Error(`${msg('Backup exceeds ZIP entry limit')}: ${limits.maxZipEntries}`);
    const estimated = entries.reduce((total, entry) => total + Number(entry._data?.uncompressedSize || 0), 0);
    if (estimated > limits.maxDecompressedBytes) throw new Error(`${msg('Backup exceeds decompressed size limit (bytes)')}: ${limits.maxDecompressedBytes}`);
    return { entries, estimated };
  }

  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < table.length; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
      table[index] = value >>> 0;
    }
    return table;
  })();

  function updateCrc32(crc, bytes) {
    let value = crc;
    for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ value >>> 8;
    return value >>> 0;
  }

  function readZipEntryBounded(entry, maxBytes, label) {
    if (!Number.isFinite(maxBytes) || maxBytes < 0) return Promise.reject(new Error(`${msg('Backup exceeds decompressed size limit while reading')}: ${label}`));
    let stream;
    try { stream = entry.internalStream('uint8array'); }
    catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0, crc = 0xffffffff, settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        try { stream.pause(); } catch (_) { /* stream already ended */ }
        reject(error);
      };
      stream.on('data', chunk => {
        if (settled) return;
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        if (size + bytes.byteLength > maxBytes) {
          fail(new Error(`${msg('Backup exceeds decompressed size limit while reading')}: ${label}`));
          return;
        }
        chunks.push(bytes); size += bytes.byteLength; crc = updateCrc32(crc, bytes);
      });
      stream.on('error', fail);
      stream.on('end', () => {
        if (settled) return;
        const expected = entry._data?.crc32;
        const actual = (crc ^ 0xffffffff) | 0;
        if (!Number.isFinite(expected) || actual !== (Number(expected) | 0)) {
          fail(new Error(`${msg('Corrupt ZIP entry (CRC32 mismatch)')}: ${label}`));
          return;
        }
        settled = true;
        const output = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
        resolve(output);
      });
      stream.resume();
    });
  }

  async function inspectBackupV3(fileOrBlob, options = {}) {
    const limits = limitOptions(options);
    const JSZip = requireZip();
    const input = await fileOrBlob;
    // JSZip's CRC option inflates every entry during load, before callers can
    // inspect central-directory sizes. Keep loading metadata-only so preflight
    // limits always run before any entry is decompressed.
    const zip = await JSZip.loadAsync(input instanceof root.Blob ? await input.arrayBuffer() : input, { checkCRC32: false });
    const preflight = preflightZip(zip, limits);
    const dataEntry = zip.file('data.json');
    if (!dataEntry) throw new Error(msg('Backup is missing data.json'));
    let extractedSize = 0;
    let manifest;
    try {
      const dataBytes = await readZipEntryBounded(dataEntry, limits.maxDecompressedBytes - extractedSize, 'data.json');
      extractedSize += dataBytes.byteLength;
      manifest = JSON.parse(new root.TextDecoder().decode(dataBytes));
    } catch (error) {
      if (/decompressed size limit|CRC32|corrupt/i.test(String(error?.message))) throw error;
      throw new Error(msg('Invalid data.json'));
    }
    if (!manifest || ![1, 2, BACKUP_VERSION].includes(manifest.backupVersion)) throw new Error(msg('Unsupported backup version'));
    if (manifest.backupVersion >= 2 && manifest.data?.version !== 3) throw new Error(msg('Invalid V3 backup state'));
    if (manifest.backupVersion >= 2) validateDomain(manifest.data, manifest.habitLogs, manifest.goalHistory);
    if (!Array.isArray(manifest.attachments)) throw new Error(msg('Invalid attachment manifest'));
    if (manifest.attachments.length > limits.maxAttachments) throw new Error(`${msg('Backup exceeds attachment count limit')}: ${limits.maxAttachments}`);
    const declaredAttachmentBytes = manifest.attachments.reduce((total, item) => total + Number(item?.size || 0), 0);
    if (!Number.isFinite(declaredAttachmentBytes) || declaredAttachmentBytes > limits.maxAttachmentBytes)
      throw new Error(`${msg('Backup exceeds attachment bytes limit (bytes)')}: ${limits.maxAttachmentBytes}`);
    // Check references before migration can normalize a malformed ID array.
    validateIds(manifest.data, manifest.attachments);
    const migration = root.TodoCore?.migrateStateV3(manifest.data);
    if (!migration?.ok) throw new Error(msg('Invalid app data'));
    const repair = root.TodoCore.repairGoalLinks ? root.TodoCore.repairGoalLinks(migration.state, { report: true, strict: true }) : { state: migration.state, warnings: [] };
    const state = repair.state;
    const goalLinkError = root.TodoCore.validateGoalLinks?.(state);
    if (goalLinkError) throw new Error(`${msg('Invalid backup')}: ${goalLinkError}`);
    const attachments = manifest.attachments;
    const habitLogs = manifest.backupVersion === 1 ? [] : manifest.habitLogs;
    const goalHistory = manifest.backupVersion === 1 ? [] : manifest.goalHistory;
    validateDomain(state, habitLogs, goalHistory);
    const owners = validateIds(state, attachments);
    const records = [];
    let totalSize = 0;
    const paths = new Set();
    for (const item of attachments) {
      const owner = owners.get(item.id), parts = typeof item.path === 'string' ? item.path.split('/') : [];
      // V1.2 packages (backupVersion 1) only knew about task attachments.
      // V1.3 packages (backupVersion 2) may also contain Note/Resource files.
      if (manifest.backupVersion === 1 && owner.type !== 'task'
        || parts.length !== 3 || `${parts[0]}/${parts[1]}` !== ownerDirectory(owner)
        || !parts[2] || ['.', '..'].includes(parts[2]) || /[\\:*?"<>|\x00-\x1f]/.test(parts[2]) || paths.has(item.path)
        || item.blobType != null && typeof item.blobType !== 'string') throw new Error(msg('Invalid attachment path or metadata'));
      paths.add(item.path);
      const entry = zip.file(item.path);
      if (!entry) throw new Error(`${msg('Missing attachment file')}: ${item.fileName}`);
      if (entry.unsafeOriginalName && entry.unsafeOriginalName !== item.path) throw new Error(`${msg('Unsafe attachment file')}: ${item.fileName}`);
      const bytes = await readZipEntryBounded(entry, limits.maxDecompressedBytes - extractedSize, item.path);
      extractedSize += bytes.byteLength;
      const blob = new root.Blob([bytes], { type: item.blobType ?? item.mimeType });
      if (blob.size !== Number(item.size)) throw new Error(`${msg('Attachment size mismatch')}: ${item.fileName}`);
      if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error(`${msg('Attachment exceeds 10 MB')}: ${item.fileName}`);
      totalSize += blob.size;
      if (totalSize > limits.maxAttachmentBytes) throw new Error(`${msg('Backup exceeds attachment bytes limit (bytes)')}: ${limits.maxAttachmentBytes}`);
      const record = { ...item, blob }; delete record.path; delete record.blobType;
      records.push(record);
    }
    root.TodoStorage.verifyAttachmentReferences(state, records);
    return {
      manifest,
      state,
      attachmentRecords: records,
      habitLogs,
      goalHistory,
      summary: { exportedAt: manifest.exportedAt, tasks: state.tasks.length, projects: state.projects.length, tags: state.tags.length, goals: state.goals.length, habits: state.habits.length, notes: state.notes.length, resources: state.resources.length, attachments: records.length, habitLogs: habitLogs.length, goalHistory: goalHistory.length, totalSize, ...(repair.warnings.length ? { warnings: repair.warnings } : {}) }
    };
  }

  function prepareSelectiveRestore(current, snapshot, collection, id) {
    const collections = ['tasks', 'projects', 'areas', 'tags', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews'];
    if (!collections.includes(collection)) throw new Error(msg('Choose a supported entity type.'));
    const migration = root.TodoCore.migrateStateV3(snapshot.appData);
    if (!migration.ok) throw new Error(`${msg('Snapshot validation failed')}: ${migration.reason}`);
    validateDomain(migration.state, snapshot.habitLogs || [], snapshot.goalHistory || []);
    let source;
    try { source = root.TodoCore.normalizeState(migration.state); }
    catch (error) { if (/Goal-link repair required/.test(error.message)) throw new Error(msg('Cannot restore reciprocal Goal link: saved contribution settings are missing.')); throw error; }
    const record = source[collection].find(item => item.id === id);
    if (!record) throw new Error(msg('The selected entity is not in this snapshot.'));
    validateDomain(source, snapshot.habitLogs || [], snapshot.goalHistory || []);
    root.TodoStorage.verifyAttachmentReferences(source, snapshot.attachments || []);
    const next = structuredClone(current);
    next.state = root.TodoCore.normalizeState(next.state);
    const index = next.state[collection].findIndex(item => item.id === id);
    if (index < 0) next.state[collection].push(structuredClone(record));
    else next.state[collection][index] = structuredClone(record);
    if (collection === 'goals') {
      for (const [owners, field, ownerField] of [['tasks', 'taskIds', null], ['projects', 'projectLinks', 'projectId'], ['habits', 'habitLinks', 'habitId']]) {
        const linked = new Set((record[field] || []).map(link => ownerField ? link[ownerField] : link));
        for (const owner of next.state[owners]) {
          if (!linked.has(owner.id) && !(owner.goalIds || []).includes(id)) continue;
          const goalIds = new Set(owner.goalIds || []);
          if (linked.has(owner.id)) goalIds.add(id); else goalIds.delete(id);
          owner.goalIds = [...goalIds];
        }
      }
    }
    const goalLink = { tasks: ['taskIds', null], projects: ['projectLinks', 'projectId'], habits: ['habitLinks', 'habitId'] }[collection];
    if (goalLink) {
      const [field, ownerField] = goalLink;
      const belongs = link => ownerField ? link[ownerField] === id : link === id;
      for (const goal of next.state.goals) {
        const linked = (record.goalIds || []).includes(goal.id);
        if (!linked && !(goal[field] || []).some(belongs)) continue;
        // Only the selected entity's reciprocal link changes. Never replace the
        // current Goal or invent Project/Habit contribution settings.
        let restored = id;
        if (linked && ownerField) {
          restored = source.goals.find(item => item.id === goal.id)?.[field]?.find(belongs);
          if (!restored) throw new Error(msg('Cannot restore reciprocal Goal link: saved contribution settings are missing.'));
        }
        goal[field] = (goal[field] || []).filter(link => !belongs(link));
        if (linked) goal[field].push(structuredClone(restored));
      }
    }
    const ownerType = { tasks: 'task', notes: 'note', resources: 'resource' }[collection];
    if (ownerType) {
      const belongs = file => ownerType === 'task' ? file.taskId === id : file.ownerType === ownerType && file.ownerId === id;
      const restored = (snapshot.attachments || []).filter(file => (record.attachmentIds || []).includes(file.id));
      const retained = next.attachmentRecords.filter(file => !belongs(file));
      if (restored.some(file => retained.some(other => other.id === file.id))) throw new Error(msg('Attachment ownership changed. Restore cannot replace another entity\'s file.'));
      next.attachmentRecords = [...retained, ...structuredClone(restored)];
    }
    for (const [name, entityCollection, ownerField] of [['habitLogs', 'habits', 'habitId'], ['goalHistory', 'goals', 'goalId']]) {
      if (collection !== entityCollection) continue;
      const restored = (snapshot[name] || []).filter(entry => entry[ownerField] === id);
      const retained = (next[name] || []).filter(entry => entry[ownerField] !== id);
      if (restored.some(entry => retained.some(other => other.id === entry.id))) throw new Error(msg('History ownership changed.'));
      next[name] = [...retained, ...structuredClone(restored)];
    }
    // Dependencies are deliberately not resurrected as extra entities. Missing
    // references reject the candidate; users can restore those entities first.
    const validation = root.TodoCore.validateStateV3(next.state);
    if (!validation.ok) throw new Error(`${msg('Restore linked items first')}: ${validation.reason}`);
    validateDomain(next.state, next.habitLogs || [], next.goalHistory || []);
    root.TodoStorage.verifyAttachmentReferences(next.state, next.attachmentRecords);
    const referencedIds = new Set(root.TodoStorage.attachmentOwners(next.state).flatMap(owner => owner.item.attachmentIds || []));
    validateIds(next.state, next.attachmentRecords.filter(file => referencedIds.has(file.id)));
    return next;
  }

  async function restoreBackup(validated, options = {}) {
    validated = structuredClone(validated);
    validated.state = root.TodoCore.repairGoalLinks(validated.state);
    validateDomain(validated.state, validated.habitLogs || [], validated.goalHistory || []);
    validateIds(validated.state, validated.attachmentRecords);
    root.TodoStorage.verifyAttachmentReferences(validated.state, validated.attachmentRecords);
    // Production callers use Storage.restoreValidatedBackup so restore always
    // follows the recovery-backed transaction. The injected adapter branch is
    // retained only for legacy integrations/tests that supply their own stores.
    const { attachmentApi, readState, writeState } = options;
    if (!attachmentApi && !readState && !writeState && root.TodoStorage.restoreValidatedBackup)
      return root.TodoStorage.restoreValidatedBackup(validated);
    const oldState = deepClone(await readState());
    const oldAttachments = await attachmentApi.listAll();
    const oldLogs = await root.TodoStorage.habitLogs.listAll(), oldHistory = await root.TodoStorage.goalHistory.listAll();
    const replaceGrowing = async (name, records) => { await root.TodoStorage[name].clearAll(); for (const record of records) await root.TodoStorage[name].put(record); };
    try {
      await attachmentApi.replaceAll(validated.attachmentRecords);
      await replaceGrowing('habitLogs', validated.habitLogs || []);await replaceGrowing('goalHistory', validated.goalHistory || []);
      await writeState(deepClone(validated.state));
    } catch (error) {
      const failures = [];
      for (const restore of [()=>attachmentApi.replaceAll(oldAttachments),()=>replaceGrowing('habitLogs',oldLogs),()=>replaceGrowing('goalHistory',oldHistory),()=>writeState(oldState)])
        try { await restore(); } catch (failure) { failures.push(failure); }
      if (failures.length) throw new AggregateError([error,...failures], `${msg('Restore and rollback failed. Keep the safety backup and retry recovery.')}: ${[error, ...failures].map(item => item.message).join('; ')}`);
      throw error;
    }
  }

  return { BACKUP_VERSION, LIMITS, exportBackup, inspectBackup, exportBackupV3, inspectBackupV3, prepareSelectiveRestore, restoreBackup, validateDomain, safeName };
});
