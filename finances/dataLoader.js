/**
 * dataLoader.js
 * Reliable receipts loading across desktop/mobile and file://
 */

(function () {
  const LS_USER_KEY = 'finances_receipts_user';
  const LS_META_KEY = 'finances_receipts_meta';

  // Legacy keys used across different pages / earlier iterations
  const LEGACY_KEYS = [
    'finances_receipts',
    'finances:receipts'
  ];

  /** @type {Promise<{receipts:any[], metadata:any, source:string}>|null} */
  let readyPromise = null;

  function safeParseJSON(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadUserReceipts() {
    const raw = localStorage.getItem(LS_USER_KEY);
    const arr = safeParseJSON(raw, []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveUserReceipts(receipts) {
    try {
      localStorage.setItem(LS_USER_KEY, JSON.stringify(receipts));
      localStorage.setItem(LS_META_KEY, JSON.stringify({ updatedAt: new Date().toISOString() }));
    } catch {
      // ignore quota/private mode
    }
  }

  function syncLegacyLocalStorage(mergedReceipts, metadata) {
    try {
      for (const k of LEGACY_KEYS) {
        localStorage.setItem(k, JSON.stringify(mergedReceipts));
      }
      localStorage.setItem(LS_META_KEY, JSON.stringify(metadata || {}));
    } catch {
      // ignore quota/private mode
    }
  }

  function normalizeReceipt(r) {
    const out = Object.assign({}, r);

    // Normalize date to ISO YYYY-MM-DD when possible
    if (typeof out.date === 'string' && out.date.length >= 10) {
      out.date = out.date.slice(0, 10);
    }

    if (!out.id) {
      const store = (out.store || 'Unknown').toString().trim();
      const date = (out.date || '').toString().trim();
      const total = (out.total ?? out.totalAmount ?? '').toString();
      const items = Array.isArray(out.items) ? out.items : [];
      const itemSig = items
        .map(i => `${(i.name || i.item || '').toString().toLowerCase()}@${i.price ?? i.amount ?? ''}`)
        .join('|');
      out.id = `${store}|${date}|${total}|${itemSig}`;
    }

    return out;
  }

  function mergeReceipts(base, user) {
    const map = new Map();
    (base || []).forEach(r => {
      const nr = normalizeReceipt(r);
      map.set(nr.id, nr);
    });
    (user || []).forEach(r => {
      const nr = normalizeReceipt(r);
      if (!map.has(nr.id)) map.set(nr.id, nr);
    });
    return Array.from(map.values());
  }

  async function loadBaseData() {
    // 1) Hardcoded JS object (works on file://)
    if (window.RECEIPTS_DATA && typeof window.RECEIPTS_DATA === 'object') {
      const data = window.RECEIPTS_DATA;
      return {
        receipts: Array.isArray(data.receipts) ? data.receipts : (Array.isArray(data) ? data : []),
        metadata: data.metadata || {},
        source: 'window.RECEIPTS_DATA'
      };
    }

    // 2) Fetch JSON (works on http/https)
    try {
      const bust = `v=${Date.now()}`;
      const res = await fetch(`receiptsData.json?${bust}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        receipts: Array.isArray(data.receipts) ? data.receipts : (Array.isArray(data) ? data : []),
        metadata: data.metadata || {},
        source: 'fetch:receiptsData.json'
      };
    } catch (e) {
      return { receipts: [], metadata: { loadError: String(e) }, source: 'none' };
    }
  }

  async function init() {
    const base = await loadBaseData();
    const user = loadUserReceipts();
    const merged = mergeReceipts(base.receipts, user);

    // Make merged data available to pages that still read localStorage directly
    syncLegacyLocalStorage(merged, base.metadata);

    const payload = { receipts: merged, metadata: base.metadata, source: base.source };

    // Notify pages that are waiting
    try {
      window.dispatchEvent(new CustomEvent('receiptsDataReady', { detail: payload }));
    } catch {
      // ignore
    }

    return payload;
  }

  function whenReceiptsReady() {
    if (!readyPromise) readyPromise = init();
    return readyPromise;
  }

  async function getAllReceipts() {
    const data = await whenReceiptsReady();
    return data.receipts;
  }

  async function addUserReceipt(receipt) {
    const r = normalizeReceipt(receipt);
    const user = loadUserReceipts();
    if (!user.some(x => normalizeReceipt(x).id === r.id)) {
      user.push(r);
      saveUserReceipts(user);
    }
    // Re-init to refresh merged + legacy keys
    readyPromise = init();
    await readyPromise;
    return r;
  }

  // Expose global helpers
  window.whenReceiptsReady = whenReceiptsReady;
  window.getAllReceipts = getAllReceipts;
  window.addUserReceipt = addUserReceipt;
})();
