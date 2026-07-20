const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    const gpa = std.heap.page_allocator;
    var list: std.ArrayList(u8) = .empty;
    defer list.deinit(gpa);
    try list.append(gpa, 'x');
}
