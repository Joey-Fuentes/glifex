const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    const gpa = std.heap.page_allocator;
    var out = std.json.Array.init(gpa);
    try out.append(.{ .integer = 1 });
}
