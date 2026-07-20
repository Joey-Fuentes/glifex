const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    const alloc = std.heap.page_allocator;
    var out = std.ArrayList(u8).init(alloc);
    const w = out.writer();
    try w.print("  [PASS] case {d}\n", .{@as(usize, 3)});
    try w.print("exp={s} got={s}\n", .{ "a", "b" });
}
