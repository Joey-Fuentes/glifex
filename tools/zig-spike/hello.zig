// PROBE 2, the control. Sum of squares 1..5 -> 55, the RISC-V spike's loop kata.
// Round 1 PROVED this builds with -fno-llvm -fno-lld at 0.14.0 and prints 55:
// the self-hosted wasm backend and self-hosted wasm linker are both real. Kept
// as the control so any regression on master is attributed to master, not us.
const std = @import("std");

pub fn main() !void {
    var sum: u32 = 0;
    var i: u32 = 1;
    while (i <= 5) : (i += 1) sum += i * i;
    const stdout = std.io.getStdOut().writer();
    try stdout.print("{d}\n", .{sum});
}
