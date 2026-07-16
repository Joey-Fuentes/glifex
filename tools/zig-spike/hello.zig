// PROBE 2, the control kata. Deliberately the same shape as the RISC-V spike's
// loop kata: sum of squares 1..5 -> 55. If this cannot be built with
// -fno-llvm -fno-lld and run, the self-hosted wasm backend and the self-hosted
// wasm linker are not both real, routes A and D are dead, and nothing else in
// this job matters.
//
// std.io.getStdOut().writer() is the 0.14 spelling -- it matches what
// languages/templates/main.zig already uses, so this compiles under the same
// pin the CLI track ships. (The Io rework lands after 0.14; pin, do not drift.)
const std = @import("std");

pub fn main() !void {
    var sum: u32 = 0;
    var i: u32 = 1;
    while (i <= 5) : (i += 1) sum += i * i;
    const stdout = std.io.getStdOut().writer();
    try stdout.print("{d}\n", .{sum});
}
