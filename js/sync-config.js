/* Dailo sync configuration (V2.0-a). Sync stays off while these are empty.
   Fill in only the two public values from Supabase Project Settings → API: the project URL and the
   anon/publishable key (docs/v2/podesavanje-supabase.md). Never put the service_role/secret key here. */
(function (root) {
  'use strict';

  root.DailoSyncConfig = Object.freeze({ url: '', anonKey: '' });
})(typeof globalThis !== 'undefined' ? globalThis : this);
