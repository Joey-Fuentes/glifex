// PROBE 5, the gate kata -- the "user source" handed to a compiler that is
// itself wasm. Sum of squares 1..7 -> 140. A different number from hello.zig on
// purpose: if the gate prints 55 rather than 140, something re-ran the control
// and the gate never happened. A plausible wrong answer is the worst failure
// shape there is (adding-a-language.md section 5, trap 5).
const std = @import("std");

pub fn main() !void {
    var sum: u32 = 0;
    var i: u32 = 1;
    while (i <= 7) : (i += 1) sum += i * i;
    const stdout = std.io.getStdOut().writer();
    try stdout.print("{d}\n", .{sum});
}
