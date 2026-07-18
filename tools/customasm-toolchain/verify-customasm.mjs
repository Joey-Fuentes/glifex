// verify-customasm.mjs <vendor-dir>
// Proves the built customasm.wasm is the assembler the retro worker needs: it
// instantiates the raw module (no imports, exactly as web/retro-worker.js does),
// asserts the six wasm_* exports the worker calls, and assembles a one-
// instruction program end to end. Mirrors retro-worker.js's mkStr/rdStr/assemble.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
const dir = process.argv[2] || ".";
const REQUIRED = ["wasm_assemble", "wasm_string_new", "wasm_string_set_byte", "wasm_string_get_len", "wasm_string_get_byte", "wasm_string_drop"];
const buf = await readFile(join(dir, "customasm.wasm"));
const { instance } = await WebAssembly.instantiate(buf);
const w = instance.exports;
const missing = REQUIRED.filter((s) => typeof w[s] !== "function");
if (missing.length) { console.error("FAIL: customasm.wasm is missing exports: " + missing.join(", ")); process.exit(1); }
const enc = new TextEncoder(), dec = new TextDecoder();
const mkStr = (s) => { const b = enc.encode(s); const q = w.wasm_string_new(b.length); for (let i = 0; i < b.length; i++) w.wasm_string_set_byte(q, i, b[i]); return q; };
const rdStr = (q) => { const n = w.wasm_string_get_len(q); const o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = w.wasm_string_get_byte(q, i); return dec.decode(o); };
const prog = "#ruledef { nop => 0xea }\n#bankdef p { #addr 0, #outp 0 }\n#bank p\nnop\n";
const fp = mkStr("hexstr"), ap = mkStr(prog), op = w.wasm_assemble(fp, ap);
const out = rdStr(op).replace(/\x1b\[[0-9;]*m/g, "").trim();
w.wasm_string_drop(fp); w.wasm_string_drop(ap); w.wasm_string_drop(op);
const hex = out.split("\n").map((l) => l.trim()).filter((l) => /^[0-9a-fA-F]+$/.test(l)).join("");
if (hex.toLowerCase() !== "ea") { console.error("FAIL: expected 'ea', customasm produced: " + JSON.stringify(out)); process.exit(1); }
console.log("OK: customasm.wasm exports " + REQUIRED.length + " symbols and assembled nop -> ea");
