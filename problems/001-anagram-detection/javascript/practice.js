module.exports = function solve(c) {
  return [...c.s].sort().join("") === [...c.t].sort().join("");
};
