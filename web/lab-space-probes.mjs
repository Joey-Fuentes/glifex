// L4 (JS peak-space) -- cooperating, instrumented reference solutions.
//
// Why this exists: the corpus's terse one-liner references have nowhere to
// inject a peak marker, and measuring the heap AFTER solve() returns misses
// transient workspace -- an anagram check sorts its input (O(n) scratch) but
// returns a boolean, and by the time an async sample resolves the scratch is
// already collected, so it reads flat zero. These probes are purpose-written
// ASYNC twins of the references that build their scratch, `await sample()` at
// the high-water point WHILE it is still referenced, then finish -- so the
// measurement lands on the actual peak. `sample` is injected by the harness:
// a no-op everywhere except the space pass, where it churns garbage to force a
// GC and reads performance.measureUserAgentSpecificMemory() (see js-runtime.js).
//
// Space is measured on a DEDICATED, larger ladder than time: the API's
// resolution floor is ~64KB (verified live -- clean and proportional from
// ~64KB up, blurry below), so inputs must be >=256KB for the O(n) scratch to
// clear it. Only these cooperating references are measured; the verdict says
// exactly that ("peak workspace of the revealed <variant> reference").
//
// Adding a problem/variant here is the whole opt-in: no corpus change, no
// rebake. A variant with no probe simply reports "not instrumented" honestly.

export const SPACE_PROBES = {
  "001-anagram-detection": {
    // char lengths; the sort scratch (~n elements) clears the ~64KB floor.
    sizes: [262144, 524288, 1048576],
    // Build an { s, t } pair of length n. Content is irrelevant to space (a
    // sort allocates n elements regardless), so use a cheap deterministic fill.
    gen: (n) => {
      const a = new Array(n);
      for (let i = 0; i < n; i++) a[i] = String.fromCharCode(97 + (i % 26));
      const s = a.join("");
      return { s, t: s };
    },
    variants: {
      // clean: sorts both strings -> O(n) TRANSIENT scratch (the thing that was
      // invisible before). Peak = the two sorted arrays + joined strings.
      clean: async (c, sample) => {
        const a = [...c.s].sort();
        const b = [...c.t].sort();
        const u = a.join("");
        const v = b.join("");
        await sample();                 // peak: a, b, u, v all live here
        return u === v && a.length >= 0; // keep refs live up to the sample
      },
      // optimized: a bounded character-count map -> O(1) workspace. Peak stays
      // flat as n grows; the contrast with clean is the whole demonstration.
      optimized: async (c, sample) => {
        const count = new Map();
        for (const ch of c.s) count.set(ch, (count.get(ch) || 0) + 1);
        for (const ch of c.t) count.set(ch, (count.get(ch) || 0) - 1);
        await sample();                 // peak: just the small map
        for (const val of count.values()) if (val !== 0) return false;
        return true;
      },
    },
  },
};
