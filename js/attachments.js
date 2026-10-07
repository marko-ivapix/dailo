(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoAttachments = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const storage = root.TodoStorage;
  if (!storage || !storage.attachments) throw new Error('TodoStorage must load before TodoAttachments');

  const api = {
    DB_NAME: storage.DB_NAME,
    open: storage.open,
    async put(record) {
      await storage.attachments.put(record);
      return record;
    },
    async putOwned(record, validate) {
      let stored = false;
      try {
        await api.put(record);
        stored = true;
        validate?.();
        return { added: true, error: null };
      } catch (error) {
        if (stored) await api.deleteMany([record.id]).catch(cleanupError => console.error(cleanupError));
        return { added: false, error };
      }
    },
    get: storage.attachments.get.bind(storage.attachments),
    getMany: storage.attachments.getMany.bind(storage.attachments),
    listByTask: storage.attachments.listByTask.bind(storage.attachments),
    listAll: storage.attachments.listAll.bind(storage.attachments),
    markPending: storage.attachments.markPending.bind(storage.attachments),
    restorePending: storage.attachments.restorePending.bind(storage.attachments),
    deleteMany: storage.attachments.deleteMany.bind(storage.attachments),
    deletePending: storage.attachments.deletePending.bind(storage.attachments),
    sameRecord: storage.sameAttachmentRecord,
    cleanupExpired: storage.attachments.cleanupExpired.bind(storage.attachments),
    clearAll: storage.attachments.clearAll.bind(storage.attachments),
    replaceAll: storage.attachments.replaceAll.bind(storage.attachments)
  };
  return api;
});
