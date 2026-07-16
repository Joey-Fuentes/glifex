// Spelling A -- the playground's own signature, taken from their src/main.zig:
//     pub fn main(init: std.process.Init) !void {
//         try std.Io.File.stdout().writeStreamingAll(init.io, "Hello, World!\n");
//     }
// Known to compile on the fork, so this reuses it verbatim and changes only WHAT
// is printed: a COMPUTED 140 (sum of squares 1..7), not a literal string. A demo
// that prints a hardcoded greeting cannot distinguish "the compiler ran" from
// "the page echoed a constant".
const std = @import("std");

pub fn main(init: std.process.Init) !void {
    var sum: u32 = 0;
    var i: u32 = 1;
    while (i <= 7) : (i += 1) sum += i * i;
    var buf: [16]u8 = undefined;
    const s = try std.fmt.bufPrint(&buf, "{d}\n", .{sum});
    try std.Io.File.stdout().writeStreamingAll(init.io, s);
}
