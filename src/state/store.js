// Tiny observable store plus forgiving localStorage helpers.

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(partial) {
      const changed = {};
      let any = false;
      for (const [k, v] of Object.entries(partial)) {
        if (state[k] !== v) {
          changed[k] = v;
          any = true;
        }
      }
      if (!any) return;
      state = { ...state, ...changed };
      for (const fn of subs) fn(state, changed);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

const NS = 'musix:v1:';

// Storage can be missing or throw (private mode, blocked site data); the app
// must work without it, so every access is guarded.
export const storage = {
  load(key, fallback) {
    try {
      const raw = globalThis.localStorage?.getItem(NS + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  save(key, value) {
    try {
      globalThis.localStorage?.setItem(NS + key, JSON.stringify(value));
    } catch {
      /* storage unavailable: settings just won't persist */
    }
  },
  remove(key) {
    try {
      globalThis.localStorage?.removeItem(NS + key);
    } catch {
      /* ignore */
    }
  },
};

/** Debounced persistence so dragging a knob doesn't hammer storage. */
export function persist(store, key, pick = (s) => s, delay = 250) {
  let timer = null;
  store.subscribe((state) => {
    clearTimeout(timer);
    timer = setTimeout(() => storage.save(key, pick(state)), delay);
  });
}
