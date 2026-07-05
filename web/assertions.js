// Frontend-track assertion engine. Pure: takes a Document + assertion specs,
// returns results. Used identically by the playground iframe and the Playwright
// E2E suite, so browser and CI can never disagree about what "correct" means.
function evaluateAssertions(doc, win, assertions) {
  const results = [];
  for (const a of assertions) {
    let ok = false, detail = "";
    try {
      const els = doc.querySelectorAll(a.selector);
      if (a.type === "exists") {
        ok = els.length > 0;
        detail = ok ? "" : `no element matches ${a.selector}`;
      } else if (a.type === "count") {
        ok = els.length === a.equals;
        detail = ok ? "" : `found ${els.length}, expected ${a.equals}`;
      } else if (a.type === "text") {
        ok = [...els].some((e) => (e.textContent || "").includes(a.contains));
        detail = ok ? "" : `no ${a.selector} contains "${a.contains}"`;
      } else if (a.type === "style") {
        if (!els.length) { detail = `no element matches ${a.selector}`; }
        else {
          const v = win.getComputedStyle(els[0]).getPropertyValue(a.property).trim();
          if ("equals" in a) { ok = v === a.equals; detail = ok ? "" : `${a.property} is "${v}", expected "${a.equals}"`; }
          else if ("minPx" in a) {
            const px = parseFloat(v);
            ok = !Number.isNaN(px) && px >= a.minPx;
            detail = ok ? "" : `${a.property} is "${v}", expected >= ${a.minPx}px`;
          }
        }
      } else {
        detail = `unknown assertion type "${a.type}"`;
      }
    } catch (e) {
      detail = String(e.message || e);
    }
    results.push({ label: a.label || `${a.type} ${a.selector}`, ok, detail });
  }
  return results;
}
if (typeof module !== "undefined") module.exports = { evaluateAssertions };
if (typeof window !== "undefined") window.evaluateAssertions = evaluateAssertions;
