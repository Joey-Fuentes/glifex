// PROBE 5, the gate kata -- the "user source" handed to a compiler that is
// itself wasm. Sum of squares 1..7 -> 140, deliberately NOT the control's 55:
// if the gate prints 55 then the control re-ran and the gate never happened.
// A plausible wrong answer is the worst failure shape there is.
const std = @import("std");

pub fn main() !void {
    var sum: u32 = 0;
    var i: u32 = 1;
    while (i <= 7) : (i += 1) sum += i * i;
    const stdout = std.io.getStdOut().writer();
    try stdout.print("{d}\n", .{sum});
}
