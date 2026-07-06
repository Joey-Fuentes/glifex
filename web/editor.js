// CodeMirror 5 integration. Wraps the existing #editor textarea via
// CodeMirror.fromTextArea and mirrors every change back into it (cm.save() +
// a synthetic 'input' event), so ALL existing code reading $("#editor").value
// keeps working untouched. If vendor/codemirror/ is absent, the plain
// textarea remains fully functional — the editor is an enhancement, never a
// dependency. (CM5 over CM6 deliberately: CM6 requires a bundler; CM5 vendors
// as flat files, matching the no-build offline architecture.)
const GlifexEditor = (() => {
  let cm = null;
  const ta = () => document.getElementById("editor");

  function css(href) {
    return new Promise((res, rej) => {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = href; l.onload = res; l.onerror = rej;
      document.head.appendChild(l);
    });
  }
  function script(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const MODES = ["javascript", "python", "ruby", "sql", "xml", "css", "htmlmixed", "clike", "go"];

  async function init() {
    try {
      await css("vendor/codemirror/codemirror.css");
      await script("vendor/codemirror/codemirror.js");
      for (const m of MODES) await script(`vendor/codemirror/${m}.js`);
    } catch {
      console.info("[glifex] CodeMirror not vendored — plain textarea in use (fully functional)");
      return;
    }
    cm = window.CodeMirror.fromTextArea(ta(), {
      lineNumbers: true,
      theme: "default",
      indentUnit: 2,
      tabSize: 2,
      viewportMargin: Infinity,
      extraKeys: { "Ctrl-Enter": () => document.getElementById("run-btn").click(),
                   "Cmd-Enter":  () => document.getElementById("run-btn").click() },
    });
    cm.on("change", () => {
      cm.save();                                    // mirror into the textarea
      ta().dispatchEvent(new Event("input"));       // existing listeners (preview, autosave) fire
    });
  }

  return {
    init,
    setValue(v) { if (cm) cm.setValue(v); else ta().value = v; },
    getValue() { return cm ? cm.getValue() : ta().value; },
    setMode(mode) { if (cm) cm.setOption("mode", mode); },
    refresh() { if (cm) cm.refresh(); },
  };
})();
window.GlifexEditor = GlifexEditor;
document.addEventListener("DOMContentLoaded", () => GlifexEditor.init());
