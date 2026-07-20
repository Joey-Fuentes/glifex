const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    var gpa = std.heap.page_allocator;
    var list = std.ArrayList(u8).init(gpa);
    defer list.deinit();
    try list.append('x');
}
