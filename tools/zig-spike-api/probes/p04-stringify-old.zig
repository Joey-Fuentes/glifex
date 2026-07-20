const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    const gpa = std.heap.page_allocator;
    var list = std.ArrayList(u8).init(gpa);
    const v = std.json.Value{ .integer = 5 };
    try std.json.stringify(v, .{}, list.writer());
}
