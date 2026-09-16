(function () {
  'use strict';

  const adapters = new Map();

  window.TodoDomainModules = {
    register(adapter) {
      if (!adapter || typeof adapter.name !== 'string' || !adapter.name) throw new TypeError('A domain adapter needs a name.');
      if (adapters.has(adapter.name)) throw new Error('Domain adapter already registered: ' + adapter.name);
      adapters.set(adapter.name, adapter);
    },
    getAdapters() {
      return [...adapters.values()];
    }
  };
})();
