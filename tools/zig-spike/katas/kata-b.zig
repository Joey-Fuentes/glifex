// Spelling B -- std.debug.print, which has outlived several std reworks.
// Writes to stderr, which the demo captures too.
const std = @import("std");

pub fn main() void {
    var sum: u32 = 0;
    var i: u32 = 1;
    while (i <= 7) : (i += 1) sum += i * i;
    std.debug.print("{d}\n", .{sum});
}
