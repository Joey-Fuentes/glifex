// L1-fib-clean: reference solution -- the Lab's correctness oracle for this
// problem (previously absent; see manifest.toml history / ROADMAP).
module.exports = function solve(c) {
  const n = c.n;
  let a = 0, b = 1;
  for (let i = 0; i < n; i++) {
    const t = a + b;
    a = b;
    b = t;
  }
  return a;
};
