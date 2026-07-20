const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    const gpa = std.heap.page_allocator;
    var m = std.AutoHashMap(i64, usize).init(gpa);
    defer m.deinit();
    try m.put(3, 1);
    _ = m.get(3);
}
