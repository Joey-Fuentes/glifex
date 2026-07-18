// dart-worker.js -- the Dart track's Worker entry (Bx-13b). A module worker:
// gx_web.js is loaded with await import(), which importScripts() could not do.
//
// Thin by design, and the same shape as asm-x86-worker.js: the logic is in
// dart-core.mjs because verify-dart-worker.mjs imports it, and a .js cannot be
// imported by node under the typeless package.json CI's e2e job creates. So this
// file is the entry and that one is the module -- which is the split the other
// module workers here already use.
//
// addEventListener, never self.onmessage. The asm workers assign onmessage and
// get away with it because nothing else installs a handler; the C# loader did,
// and assigning over it hung dotnet.create() in Bx-5. No reason to repeat the
// pattern that only works by luck.
import { driveProblem } from "./dart-core.mjs";

self.addEventListener("message", async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  try {
    const out = await driveProblem(d.source, d.cases || []);
    if (out.error) { self.postMessage({ id: "error", error: out.error }); return; }
    self.postMessage({ id: "result", ...out });
  } catch (err) {
    self.postMessage({ id: "error", error: String((err && err.message) || err) });
  }
});
