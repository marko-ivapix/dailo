(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  const MAX_ATTACHMENTS_PER_TASK = 10;
  const BACKUP_VERSION = 1;

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
    const JSZip = requireZip();
    const zip = new JSZip();
    const used = new Set();
    const metadata = [];
    const referenced = new Set();
    for (const task of state.tasks || []) for (const id of task.attachmentIds || []) referenced.add(id);
    const records = await attachmentApi.getMany([...referenced]);
    const byId = new Map(records.map(record => [record.id, record]));
    for (const id of referenced) if (!byId.has(id)) throw new Error(`Missing attachment: ${id}`);
    for (const task of state.tasks || []) {
      for (const id of task.attachmentIds || []) {
        const record = byId.get(id);
        if (record.taskId !== task.id) throw new Error(`Attachment ownership mismatch: ${id}`);
        if (record.size > MAX_ATTACHMENT_BYTES) throw new Error(`Attachment exceeds 10 MB: ${record.fileName}`);
        const path = uniquePath(task.id, record.fileName, used);
        zip.file(path, record.blob);
        metadata.push({ id: record.id, taskId: record.taskId, fileName: record.fileName, mimeType: record.mimeType || 'application/octet-stream', size: record.size, createdAt: record.createdAt, updatedAt: record.updatedAt, path });
      }
    }
    const manifest = { backupVersion: BACKUP_VERSION, appVersion: '1.2', exportedAt: nowIso, data: deepClone(state), attachments: metadata };
    zip.file('data.json', JSON.stringify(manifest, null, 2));
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
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
      if (Number(item.size) > MAX_ATTACHMENT_BYTES) throw new Error('Attachment exceeds 10 MB');
    }
    for (const task of state.tasks || []) for (const id of task.attachmentIds || []) if (!attachmentIds.has(id)) throw new Error(`Missing attachment metadata: ${id}`);
  }

  async function inspectBackup(fileOrBlob) {
    const JSZip = requireZip();
    const zip = await JSZip.loadAsync(fileOrBlob);
    const dataEntry = zip.file('data.json');
    if (!dataEntry) throw new Error('Backup is missing data.json');
    let manifest;
    try { manifest = JSON.parse(await dataEntry.async('string')); } catch (_) { throw new Error('Invalid data.json'); }
    if (manifest.backupVersion !== BACKUP_VERSION) throw new Error('Unsupported backup version');
    const migration = root.TodoCore?.migrateStateV3(manifest.data);
    if (!migration?.ok) throw new Error('Invalid app data');
    const state = migration.state;
    const attachments = Array.isArray(manifest.attachments) ? manifest.attachments : [];
    validateIds(state, attachments);
    const records = [];
    let totalSize = 0;
    for (const item of attachments) {
      const entry = zip.file(item.path);
      if (!entry) throw new Error(`Missing attachment file: ${item.fileName}`);
      const blob = await entry.async('blob');
      if (blob.size !== Number(item.size)) throw new Error(`Attachment size mismatch: ${item.fileName}`);
      if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error(`Attachment exceeds 10 MB: ${item.fileName}`);
      totalSize += blob.size;
      records.push({ id: item.id, taskId: item.taskId, fileName: item.fileName, mimeType: item.mimeType || blob.type || 'application/octet-stream', size: blob.size, blob, createdAt: item.createdAt || manifest.exportedAt, updatedAt: item.updatedAt || manifest.exportedAt, pendingDeleteUntil: null });
    }
    return {
      manifest,
      state,
      attachmentRecords: records,
      summary: { exportedAt: manifest.exportedAt, tasks: state.tasks.length, projects: state.projects.length, tags: state.tags.length, attachments: records.length, totalSize }
    };
  }

  async function restoreBackup(validated, { attachmentApi, readState, writeState }) {
    const oldState = deepClone(await readState());
    const oldAttachments = await attachmentApi.listAll();
    try {
      await attachmentApi.replaceAll(validated.attachmentRecords);
      await writeState(deepClone(validated.state));
    } catch (error) {
      try { await attachmentApi.replaceAll(oldAttachments); } catch (_) {}
      try { await writeState(oldState); } catch (_) {}
      throw error;
    }
  }

  return { BACKUP_VERSION, exportBackup, inspectBackup, restoreBackup, safeName };
});
