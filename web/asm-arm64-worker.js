import { driveProblem } from "./asm-arm64-core.mjs";
self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  try {
    const out = await driveProblem(d.source, d.cases);
    if (out.error) { self.postMessage({ id:"error", error: out.error }); return; }
    self.postMessage({ id:"result", ...out });
  } catch (err) { self.postMessage({ id:"error", error: String((err && err.message) || err) }); }
};
self.onerror = (e) => self.postMessage({ id:"error", error: "worker crashed: " + String((e && e.message) || e) });
