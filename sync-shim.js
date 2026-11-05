/*
 * EduProtocol sync shim (auto-injected into index.html by server.js)
 * -----------------------------------------------------------------
 * Makes the app's browser storage talk to the server database, WITHOUT
 * changing any of the app's own code.
 *
 *  - On page load it pulls the saved data from the server and seeds
 *    localStorage, so the app boots with the permanent data.
 *  - It wraps localStorage.setItem so that every time the app saves its
 *    data document, the change is pushed to the server (debounced).
 *
 * The app stores its whole database under one key (STORE). Only that key
 * is synced; the per-device SESSION key stays local.
 */
(function () {
  var API = '/api/state';
  var STORE = 'eduprotocol_v6';
  var TOKEN = (window.EDUPROTOCOL_TOKEN || '');
  var qs = TOKEN ? ('?token=' + encodeURIComponent(TOKEN)) : '';

  // 1) Pull saved data synchronously BEFORE the app boots.
  try {
    var x = new XMLHttpRequest();
    x.open('GET', API + qs, false); // sync on purpose: must finish before app code runs
    x.send(null);
    if (x.status >= 200 && x.status < 300) {
      var j = JSON.parse(x.responseText || '{}');
      if (j && j.data != null) {
        var str = (typeof j.data === 'string') ? j.data : JSON.stringify(j.data);
        window.localStorage.setItem(STORE, str);
        window.__EDU_SYNC_LAST = str;
      }
    }
  } catch (e) {
    console.warn('[EduProtocol sync] could not load from server, using local cache.', e);
  }

  // 2) Push saves back to the server (debounced).
  var raw = window.localStorage.setItem.bind(window.localStorage);
  var timer = null, pending = null;

  window.localStorage.setItem = function (k, v) {
    raw(k, v);
    if (k === STORE && v !== window.__EDU_SYNC_LAST) {
      pending = v;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 400);
    }
  };

  function flush() {
    if (pending == null) return;
    var body = pending;
    pending = null;
    window.__EDU_SYNC_LAST = body;
    try {
      fetch(API + qs, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: body })
      }).then(function (r) {
        if (!r.ok) console.warn('[EduProtocol sync] server rejected save:', r.status);
      }).catch(function (e) {
        console.warn('[EduProtocol sync] save failed, will retry on next change.', e);
        pending = body; // keep it so the next change retries
      });
    } catch (e) {
      console.warn('[EduProtocol sync] save error.', e);
    }
  }

  // 3) Best-effort save when the tab closes.
  window.addEventListener('beforeunload', function () {
    if (pending != null && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(API + qs,
          new Blob([JSON.stringify({ data: pending })], { type: 'application/json' }));
        pending = null;
      } catch (e) {}
    }
  });

  console.log('[EduProtocol sync] active — data is stored on the server database.');
})();
