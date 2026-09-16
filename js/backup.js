(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  const MAX_ATTACHMENTS_PER_TASK = 10;
  const BACKUP_VERSION = 2;

  function requireZip() {
    if (!root.JSZip) throw new Error('ZIP support unavailable');
    return root.JSZip;
  }

  function safeName(name) {
    const cleaned = String(name || 'attachment').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').trim();
    return cleaned || 'attachment';
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uniquePath(taskId, fileName, used) {
    const base = safeName(fileName);
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    let index = 1;
    let path = `attachments/task_${safeName(taskId)}/${base}`;
    while (used.has(path)) { index += 1; path = `attachments/task_${safeName(taskId)}/${stem}-${index}${ext}`; }
    used.add(path);
    return path;
  }

  async function exportBackup(state, attachmentApi, nowIso) {
    return exportBackupV3(state, { attachments: attachmentApi, habitLogs: root.TodoStorage.habitLogs, goalHistory: root.TodoStorage.goalHistory }, nowIso);
  }

  async function exportBackupV3(state, storage, nowIso) {
    const source = state;
    const sourceText = JSON.stringify(state);
    state = deepClone(state);
    delete state.habitLogCache; delete state.habitMetrics;
    const JSZip = requireZip();
    const zip = new JSZip();
    const used = new Set();
    const metadata = [];
    const referenced = new Set();
    for (const task of state.tasks || []) for (const id of task.attachmentIds || []) referenced.add(id);
    const records = await storage.attachments.getMany([...referenced]);
    const habitLogs = await storage.habitLogs.listAll(), goalHistory = await storage.goalHistory.listAll();
    const byId = new Map(records.map(record => [record.id, record]));
    for (const id of referenced) if (!byId.has(id)) throw new Error(`Missing attachment: ${id}`);
    for (const task of state.tasks || []) {
      if ((task.attachmentIds || []).length > MAX_ATTACHMENTS_PER_TASK) throw new Error('A task has more than 10 attachments');
      for (const id of task.attachmentIds || []) {
        const record = byId.get(id);
        if (record.taskId !== task.id) throw new Error(`Attachment ownership mismatch: ${id}`);
        if (!(record.blob instanceof root.Blob) || record.size !== record.blob.size || record.size > MAX_ATTACHMENT_BYTES) throw new Error(`Invalid attachment: ${record.fileName}`);
        const path = uniquePath(task.id, record.fileName, used);
        zip.file(path, await record.blob.arrayBuffer());
        const item = { ...record, blobType: record.blob.type, path }; delete item.blob;
        metadata.push(item);
      }
    }
    const manifest = { backupVersion: BACKUP_VERSION, appVersion: '1.3', exportedAt: nowIso, data: state, attachments: metadata, habitLogs, goalHistory };
    validateDomain(state, habitLogs, goalHistory);
    if (JSON.stringify(source) !== sourceText) throw new Error('Source changed during export. Retry.');
    zip.file('data.json', JSON.stringify(manifest, null, 2));
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  function validateDomain(state, logs, history) {
    const fail = label => { throw new Error(`Invalid backup ${label}`); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const name = value => typeof value === 'string' && value.trim();
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && root.TodoCore.parseDateOnly(value) && root.TodoCore.dateOnly(root.TodoCore.parseDateOnly(value)) === value;
    const enumField = (item, key, values) => { if (item[key] != null && !values.includes(item[key])) fail(key); };
    const dateField = (item, key) => { if (item[key] != null && !date(item[key])) fail(key); };
    const numberField = (item, key, min = 0) => { if (item[key] != null && (typeof item[key] !== 'number' || !Number.isFinite(item[key]) || item[key] < min)) fail(key); };
    const booleanField = (item, key) => { if (item[key] != null && typeof item[key] !== 'boolean') fail(key); };
    const positiveInteger = value => Number.isInteger(value) && value > 0;
    const positiveField = (item, key) => { numberField(item,key); if (item[key] != null && item[key] <= 0) fail(key); };
    const recurrence = item => {
      if (item == null) return;
      if (!object(item) || !['daily','weekly','monthly'].includes(item.frequency) || !positiveInteger(item.interval)) fail('recurrence');
      enumField(item,'status',['active','paused','ended']);enumField(item,'endType',['never','date','afterOccurrences']);dateField(item,'endDate');
      if (item.endType === 'date' && !date(item.endDate) || item.endType === 'afterOccurrences' && !positiveInteger(item.endAfterOccurrences)) fail('recurrence end');
      numberField(item,'occurrencesCreated');booleanField(item,'skipNext');
    };
    const ids = {};
    for (const collection of ['tasks','projects','tags','areas','goals','habits','templates','savedViews']) {
      if (!Array.isArray(state[collection])) fail(collection);
      ids[collection] = new Set();
      for (const item of state[collection]) {
        if (!object(item) || !name(item.id) || ids[collection].has(item.id) || !name(item[['tasks','goals'].includes(collection) ? 'title' : 'name'])) fail(collection);
        ids[collection].add(item.id);
      }
    }
    const ref = (value, collection) => { if (value != null && !ids[collection].has(value)) fail(`${collection} reference`); };
    const refs = (item, key, collection) => { if (item[key] != null) { if (!Array.isArray(item[key]) || new Set(item[key]).size !== item[key].length) fail(key); item[key].forEach(id => ref(id, collection)); } };
    const nested = (items, label) => { if (!Array.isArray(items) || items.some(item => !object(item) || !name(item.id)) || new Set(items.map(item => item.id)).size !== items.length) fail(label); };
    const taskFields = (task, baseline = false) => {
      if (!object(task) || !name(task.title)) fail(baseline ? 'recurrence baseline' : 'task');
      for (const key of ['notes']) if (task[key] != null && typeof task[key] !== 'string') fail(key);
      for (const key of ['id','projectId','areaId','recurrenceSuccessorId']) if (task[key] != null && !name(task[key])) fail(key);
      for (const key of ['goalIds','tagIds','attachmentIds']) if (task[key] != null
        && (!Array.isArray(task[key]) || task[key].some(id => !name(id)) || new Set(task[key]).size !== task[key].length)) fail(key);
      enumField(task,'priority',['none','low','medium','high']);
      booleanField(task,'isCompleted');booleanField(task,'isInbox');recurrence(task.recurrence);
      for (const key of ['plannedDate','dueDate']) dateField(task,key);
      for (const key of ['plannedTime','dueTime']) if (task[key] != null && root.TodoCore.normalizeTime(task[key]) !== task[key]) fail(key);
      for (const key of ['reminderAt','reminderFiredAt','completedAt','createdAt','updatedAt']) if (task[key] != null
        && (typeof task[key] !== 'string' || !Number.isFinite(Date.parse(task[key])))) fail(key);
      for (const key of ['todayOrder','projectOrder','inboxOrder']) numberField(task,key,-Infinity);
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
    for (const item of [...state.tasks, ...state.projects, ...state.goals, ...state.habits]) ref(item.areaId, 'areas');
    for (const item of [...state.tasks, ...state.projects, ...state.habits]) refs(item, 'goalIds', 'goals');
    for (const task of state.tasks) {
      ref(task.projectId,'projects'); refs(task,'tagIds','tags');
      taskFields(task);
    }
    for (const area of state.areas) enumField(area,'status',['active','archived']);
    for (const goal of state.goals) {
      enumField(goal,'status',['active','paused','completed','archived']); enumField(goal,'progressMode',['manual','linkedTasks','linkedHabits']); enumField(goal,'progressType',['percentage','numeric']);
      numberField(goal,'currentValue');positiveField(goal,'targetValue');dateField(goal,'targetDate');refs(goal,'taskIds','tasks');
      if (goal.projectLinks != null) { if (!Array.isArray(goal.projectLinks) || new Set(goal.projectLinks.map(link=>link?.projectId)).size !== goal.projectLinks.length) fail('project links'); for (const link of goal.projectLinks) { if (!object(link) || !link.projectId || !['allTasks','selectedTasks'].includes(link.contributionMode)) fail('project link');ref(link.projectId,'projects');refs(link,'selectedTaskIds','tasks');if ((link.selectedTaskIds || []).some(id => state.tasks.find(task => task.id === id)?.projectId !== link.projectId)) fail('selected project Task'); } }
      if (goal.habitLinks != null) { if (!Array.isArray(goal.habitLinks) || new Set(goal.habitLinks.map(link=>link?.habitId)).size !== goal.habitLinks.length) fail('habit links');for (const link of goal.habitLinks) { if (!object(link) || !link.habitId || !['totalCheckins','streak','successfulPeriods','totalValue','currentStreak','longestStreak','completionRate'].includes(link.metric) || !(link.target > 0)) fail('habit link');ref(link.habitId,'habits');positiveField(link,'target'); } }
      if (goal.milestones != null) { nested(goal.milestones,'milestones');for (const item of goal.milestones) { if (!name(item.title)) fail('milestone');dateField(item,'date'); } }
      if (goal.reminders != null && (!object(goal.reminders) || goal.reminders.time != null && root.TodoCore.normalizeTime(goal.reminders.time) !== goal.reminders.time)) fail('Goal reminders');
    }
    for (const habit of state.habits) {
      enumField(habit,'status',['active','paused','archived']);enumField(habit,'trackingType',['checkbox','numeric']);enumField(habit,'frequencyType',['daily','weekdays','timesPerWeek','everyNDays']);enumField(habit,'continuation',['automatic','askEachPeriod','onePeriod']);enumField(habit,'endType',['never','date','successfulPeriods']);
      for (const key of ['startDate','endDate']) dateField(habit,key);
      for (const key of ['targetValue','timesPerWeek','everyNDays','successfulPeriodsTarget']) positiveField(habit,key);
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
      for (const key of ['goalIds','tagIds']) if (data[key] != null && (!Array.isArray(data[key]) || data[key].some(id => !name(id)))) fail(`Template ${key}`);
      for (const key of ['projectId','areaId','goalId']) if (data[key] != null && !name(data[key])) fail(`Template ${key}`);
      for (const key of ['plannedOffsetDays','dueOffsetDays','reminderOffsetDays','targetOffsetDays','endOffsetDays','dateOffsetDays']) if (data[key] != null && !Number.isInteger(data[key])) fail(`Template ${key}`);
      for (const key of ['plannedTime','dueTime','reminderTime','time']) if (data[key] != null && root.TodoCore.normalizeTime(data[key]) !== data[key]) fail(`Template ${key}`);
      for (const key of ['targetValue','target','timesPerWeek','everyNDays','successfulPeriodsTarget','interval','endAfterOccurrences']) positiveField(data,key);
      enumField(data,'priority',['none','low','medium','high']);enumField(data,'frequencyType',['daily','weekdays','timesPerWeek','everyNDays']);enumField(data,'trackingType',['checkbox','numeric']);enumField(data,'progressMode',['manual','linkedTasks','linkedHabits']);enumField(data,'progressType',['percentage','numeric']);enumField(data,'frequency',['daily','weekly','monthly']);
      for (const key of ['tasks','subtasks','milestones','goalLinkConfigs']) if (data[key] != null) { if (!Array.isArray(data[key])) fail(`Template ${key}`);data[key].forEach(templateData); }
      if (data.reminders != null) { if (Array.isArray(data.reminders)) data.reminders.forEach(templateData);else templateData(data.reminders); }
      if (data.recurrence != null) templateData(data.recurrence);
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
    nested(logs,'Habit logs');nested(history,'Goal history');const days = new Set();
    for (const log of logs) { ref(log.habitId,'habits');if (!log.habitId || !date(log.date) || days.has(`${log.habitId}:${log.date}`) || !['done','skipped','missed'].includes(log.status)) fail('Habit log');days.add(`${log.habitId}:${log.date}`);numberField(log,'value'); }
    for (const event of history) { ref(event.goalId,'goals');if (!event.goalId || !['created','progressChanged','statusChanged','targetDateChanged','projectLinked','projectUnlinked','manualProgress'].includes(event.type) || !object(event.data) || !Number.isFinite(Date.parse(event.createdAt))) fail('Goal history'); }
  }

  function validateIds(state, attachments) {
    const projectIds = new Set((state.projects || []).map(x => x.id));
    const tagIds = new Set((state.tags || []).map(x => x.id));
    const taskIds = new Set();
    for (const task of state.tasks || []) {
      if (!task.id || taskIds.has(task.id)) throw new Error('Invalid or duplicate task ID');
      taskIds.add(task.id);
      if (task.projectId && !projectIds.has(task.projectId)) task.projectId = null;
      task.tagIds = (task.tagIds || []).filter(id => tagIds.has(id));
      if ((task.attachmentIds || []).length > MAX_ATTACHMENTS_PER_TASK) throw new Error('A task has more than 10 attachments');
    }
    const attachmentIds = new Set();
    for (const item of attachments || []) {
      if (!item.id || attachmentIds.has(item.id) || !taskIds.has(item.taskId)) throw new Error('Invalid attachment metadata');
      attachmentIds.add(item.id);
      if (!Number.isInteger(item.size) || item.size < 0 || item.size > MAX_ATTACHMENT_BYTES) throw new Error('Invalid attachment size');
    }
    for (const task of state.tasks || []) for (const id of task.attachmentIds || []) if (!attachmentIds.has(id) || attachments.find(item => item.id === id).taskId !== task.id) throw new Error(`Missing attachment metadata or ownership: ${id}`);
  }

  async function inspectBackup(fileOrBlob) {
    return inspectBackupV3(fileOrBlob);
  }

  async function inspectBackupV3(fileOrBlob) {
    const JSZip = requireZip();
    const input = await fileOrBlob;
    const zip = await JSZip.loadAsync(input instanceof root.Blob ? await input.arrayBuffer() : input, { checkCRC32: true });
    const dataEntry = zip.file('data.json');
    if (!dataEntry) throw new Error('Backup is missing data.json');
    let manifest;
    try { manifest = JSON.parse(await dataEntry.async('string')); } catch (_) { throw new Error('Invalid data.json'); }
    if (![1, BACKUP_VERSION].includes(manifest.backupVersion)) throw new Error('Unsupported backup version');
    if (manifest.backupVersion === 2 && manifest.data?.version !== 3) throw new Error('Invalid V3 backup state');
    if (manifest.backupVersion === 2) validateDomain(manifest.data, manifest.habitLogs, manifest.goalHistory);
    const migration = root.TodoCore?.migrateStateV3(manifest.data);
    if (!migration?.ok) throw new Error('Invalid app data');
    const state = migration.state;
    if (!Array.isArray(manifest.attachments)) throw new Error('Invalid attachment manifest');
    const attachments = manifest.attachments;
    const habitLogs = manifest.backupVersion === 1 ? [] : manifest.habitLogs;
    const goalHistory = manifest.backupVersion === 1 ? [] : manifest.goalHistory;
    validateDomain(state, habitLogs, goalHistory);
    validateIds(state, attachments);
    const records = [];
    let totalSize = 0;
    const paths = new Set();
    for (const item of attachments) {
      if (typeof item.path !== 'string' || !item.path.startsWith('attachments/task_') || item.path.split('/').includes('..') || paths.has(item.path) || typeof item.fileName !== 'string' || typeof item.mimeType !== 'string' || item.blobType != null && typeof item.blobType !== 'string') throw new Error('Invalid attachment path or metadata');
      paths.add(item.path);
      const entry = zip.file(item.path);
      if (!entry) throw new Error(`Missing attachment file: ${item.fileName}`);
      const blob = new root.Blob([await entry.async('uint8array')], { type: item.blobType ?? item.mimeType });
      if (blob.size !== Number(item.size)) throw new Error(`Attachment size mismatch: ${item.fileName}`);
      if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error(`Attachment exceeds 10 MB: ${item.fileName}`);
      totalSize += blob.size;
      const record = { ...item, blob }; delete record.path; delete record.blobType;
      records.push(record);
    }
    return {
      manifest,
      state,
      attachmentRecords: records,
      habitLogs,
      goalHistory,
      summary: { exportedAt: manifest.exportedAt, tasks: state.tasks.length, projects: state.projects.length, tags: state.tags.length, attachments: records.length, totalSize }
    };
  }

  async function restoreBackup(validated, { attachmentApi, readState, writeState }) {
    validated = structuredClone(validated);
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
      if (failures.length) throw new AggregateError([error,...failures], `Restore failed: ${error.message}. Rollback failed: ${failures.map(item=>item.message).join('; ')}. Keep the safety backup and retry recovery.`);
      throw error;
    }
  }

  return { BACKUP_VERSION, exportBackup, inspectBackup, exportBackupV3, inspectBackupV3, restoreBackup, validateDomain, safeName };
});
