// drive-web.cjs -- the JS host for GATE 2b.
//
// Fills the global the compiled Dart reads its dill from, loads the compiled
// compiler, then RUNS the JS that compiler produced and checks the answer.
// Compiling is not the gate. Producing JS that computes 55 is the gate.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const [, , compilerJs, dillPath, specPath] = process.argv;
const dill = new Uint8Array(fs.readFileSync(dillPath));
const spec = specPath && fs.existsSync(specPath) ? fs.readFileSync(specPath, "utf8") : "";

globalThis.gxGetDill = () => dill;
globalThis.gxGetLibrariesSpec = () => spec;
globalThis.gxDone = (outJs) => {
  console.log("     produced   : " + outJs.length + " chars of JS");
  fs.writeFileSync(path.join(path.dirname(compilerJs), "gx_web_out.js"), outJs);
  // THE GATE. Run the compiler's output and read what it prints.
  let printed = [];
  const ctx = vm.createContext({ console: { log: (s) => printed.push(String(s)) } });
  try {
    vm.runInContext(outJs, ctx, { timeout: 20000 });
  } catch (e) {
    console.log("     OUTPUT THREW: " + String(e).slice(0, 200));
    process.exitCode = 1;
    return;
  }
  const out = printed.join("\n");
  console.log("     output ran : " + out);
  if (out.indexOf("solve(10)=55") >= 0) {
    console.log("     GATE PASSED -- a Dart compiler running as JS, with no filesystem,");
    console.log("     compiled Dart source to JS, and that JS computed the right answer.");
  } else {
    console.log("     GATE FAILED -- expected solve(10)=55, got: " + out);
    process.exitCode = 1;
  }
};

// If gxDone never fires, say so. Spike 9's drive exited 0 having printed two
// lines, and a silent success-looking exit is indistinguishable from a pass.
let done = false;
const realDone = globalThis.gxDone;
globalThis.gxDone = (outJs) => { done = true; realDone(outJs); };
process.on("unhandledRejection", (e) => {
  console.log("     UNHANDLED REJECTION: " + String(e).slice(0, 300));
  process.exitCode = 1;
});
process.on("exit", () => {
  if (!done) {
    console.log("     GATE FAILED -- gxDone never fired: the compiler produced no output.");
    console.log("     (that is a real failure, not a quiet pass)");
    process.exitCode = process.exitCode || 1;
  }
});

require(path.resolve(compilerJs));
