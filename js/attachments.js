(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoAttachments = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const storage = root.TodoStorage;
  if (!storage || !storage.attachments) throw new Error('TodoStorage must load before TodoAttachments');

  return {
    DB_NAME: storage.DB_NAME,
    open: storage.open,
    async put(record) {
      await storage.attachments.put(record);
      return record;
    },
    get: storage.attachments.get.bind(storage.attachments),
    getMany: storage.attachments.getMany.bind(storage.attachments),
    listByTask: storage.attachments.listByTask.bind(storage.attachments),
    listAll: storage.attachments.listAll.bind(storage.attachments),
    markPending: storage.attachments.markPending.bind(storage.attachments),
    restorePending: storage.attachments.restorePending.bind(storage.attachments),
    deleteMany: storage.attachments.deleteMany.bind(storage.attachments),
    cleanupExpired: storage.attachments.cleanupExpired.bind(storage.attachments),
    clearAll: storage.attachments.clearAll.bind(storage.attachments),
    replaceAll: storage.attachments.replaceAll.bind(storage.attachments)
  };
});
