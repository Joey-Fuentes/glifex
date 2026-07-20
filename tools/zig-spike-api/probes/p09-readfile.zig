const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    const gpa = std.heap.page_allocator;
    const data = std.fs.cwd().readFileAlloc(gpa, "x.txt", 1 << 20) catch return;
    _ = data;
}
