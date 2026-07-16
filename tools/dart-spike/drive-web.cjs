// drive-web.cjs -- the JS host for GATE 2b.
//
// Fills the global the compiled Dart reads its dill from, loads the compiled
// compiler, then RUNS the JS that compiler produced and checks the answer.
// Compiling is not the gate. Producing JS that computes 55 is the gate.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const [, , compilerJs, dillPath] = process.argv;
const dill = new Uint8Array(fs.readFileSync(dillPath));

globalThis.gxGetDill = () => dill;
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

require(path.resolve(compilerJs));
