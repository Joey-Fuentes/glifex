const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    const alloc = std.heap.page_allocator;
    var buf = std.ArrayList(u8).init(alloc);
    try buf.append('x');
    const s = try buf.toOwnedSlice();
    _ = s;
}
