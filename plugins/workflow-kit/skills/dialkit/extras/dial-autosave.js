// Restores a DialKit panel's saved values on load and saves every change to disk
// (via the dev-only /__dial-values endpoint in dial-values.plugin.js).
// Also exposes window.__dial[name]() so the current values can be read before a reload.
// Buttons show up in kit.values as { type: 'action' } configs; they aren't values, so leave them out.
function stripActions(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (v.type === 'action') continue;
      out[k] = v.type ? v : stripActions(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function autosave(kit, name, { route = '/__dial-values', delay = 300 } = {}) {
  window.__dial = window.__dial || {};
  window.__dial[name] = () => structuredClone(kit.values);

  let ok = false;
  try {
    const res = await fetch(route);
    if (res.ok) {
      ok = true;
      const saved = (await res.json()).panels?.[name];
      if (saved) kit.setValues(saved);
    }
  } catch {
    // No endpoint (production build or static hosting): nothing to restore or save
  }
  // Only save when the endpoint answered, so a failed load never overwrites saved values with defaults
  if (!ok) return;

  let timer;
  let first = true;
  kit.subscribe((values) => {
    if (first) {
      first = false; // subscribe fires immediately with what we just restored
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, values: stripActions(values) }),
      }).catch(() => {});
    }, delay);
  });
}
