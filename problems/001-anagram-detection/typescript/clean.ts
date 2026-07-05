export function solve(c: any): boolean {
  return [...c.s].sort().join("") === [...c.t].sort().join("");
}
