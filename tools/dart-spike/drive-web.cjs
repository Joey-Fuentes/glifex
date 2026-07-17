// drive-web.cjs -- the JS host for GATE 2b.
//
// Fills the globals the compiled Dart reads its platform inputs from, loads the
// compiled compiler, then RUNS the JS that compiler produced and checks the
// answer. Compiling is not the gate. Producing JS that computes 55 is the gate.
//
// SPIKE 11: the compiled compiler printed its first diagnostic and then the
// process exited 0 with no error and no result. That is what a host giving up
// looks like, not what failing work looks like -- so this driver now HOLDS THE
// EVENT LOOP OPEN. If the compile then finishes, node was simply exiting on an
// empty loop and the compile was never the problem. That is the one variable
// this round is designed to isolate.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const [, , compilerJs, dillPath, specPath] = process.argv;
const dill = new Uint8Array(fs.readFileSync(dillPath));
const spec = specPath && fs.existsSync(specPath) ? fs.readFileSync(specPath, "utf8") : "";

// dart2js targets the browser: its async scheduler looks for 'self' at startup.
// Under bare node CommonJS there is no 'self', and a no-op scheduleImmediate is
// exactly what spike 12 saw -- sync code runs, the first await never resumes.
// Section 7b's control decides whether this line is the fix or a red herring;
// it is harmless either way, and the log says whether it was needed.
if (typeof globalThis.self === "undefined") {
  globalThis.self = globalThis;
  console.log("     [host] defined globalThis.self (dart2js expects it)");
} else {
  console.log("     [host] globalThis.self already present");
}

globalThis.gxGetDill = () => dill;
globalThis.gxGetLibrariesSpec = () => spec;

// Stage marks from inside the Dart, so a stall can be located rather than guessed.
let lastMark = "(none)";
const t0 = Date.now();
globalThis.gxMark = (stage) => {
  lastMark = String(stage);
  console.log("     [mark] " + lastMark + " @ " + (Date.now() - t0) + "ms");
};

// Hold the loop open. Nothing else in this process keeps node alive once
// require() returns, and an async Dart main is exactly the thing that needs it.
const keepAlive = setInterval(() => {}, 250);
let done = false;

function inputsSoFar() {
  try {
    return globalThis.gxDump ? String(globalThis.gxDump()) : "(gxDump not published)";
  } catch (e) {
    return "(gxDump threw: " + String(e).slice(0, 80) + ")";
  }
}

function finish(code) {
  clearInterval(keepAlive);
  process.exitCode = code;
}

globalThis.gxDone = (outJs) => {
  done = true;
  console.log("     produced   : " + outJs.length + " chars of JS");
  fs.writeFileSync(path.join(path.dirname(compilerJs), "gx_web_out.js"), outJs);
  // THE GATE. Run the compiler's output and read what it prints.
  const printed = [];
  const ctx = vm.createContext({ console: { log: (s) => printed.push(String(s)) } });
  try {
    vm.runInContext(outJs, ctx, { timeout: 20000 });
  } catch (e) {
    console.log("     OUTPUT THREW: " + String(e).slice(0, 200));
    return finish(1);
  }
  const out = printed.join("\n");
  console.log("     output ran : " + out);
  if (out.indexOf("solve(10)=55") >= 0) {
    console.log("     GATE PASSED -- a Dart compiler running as JS, with no filesystem,");
    console.log("     compiled Dart source to JS, and that JS computed the right answer.");
    return finish(0);
  }
  console.log("     GATE FAILED -- expected solve(10)=55, got: " + out);
  return finish(1);
};

// Watchdog. A stall must report where it stalled and what it had read, not just
// time out into silence.
// 120s, not 600s. The probe captures to a file and prints afterwards, so a
// stall shows as total silence -- ten minutes of it is a waste of a round.
const WATCHDOG_MS = 120000;
const watchdog = setTimeout(() => {
  console.log("     GATE FAILED -- still not done after " + WATCHDOG_MS / 1000 + "s");
  console.log("     last mark  : " + lastMark);
  console.log("     inputs read: " + inputsSoFar());
  finish(1);
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref();

process.on("unhandledRejection", (e) => {
  console.log("     UNHANDLED REJECTION: " + String(e).slice(0, 300));
  console.log("     last mark  : " + lastMark);
  console.log("     inputs read: " + inputsSoFar());
  finish(1);
});

process.on("exit", () => {
  if (!done) {
    console.log("     GATE FAILED -- gxDone never fired.");
    console.log("     last mark  : " + lastMark);
    console.log("     inputs read: " + inputsSoFar());
    console.log("     (a real failure, not a quiet pass)");
    process.exitCode = process.exitCode || 1;
  }
});

require(path.resolve(compilerJs));
