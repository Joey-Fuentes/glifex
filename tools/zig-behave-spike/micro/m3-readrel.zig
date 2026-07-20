const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    const alloc = std.heap.page_allocator;
    const data = std.fs.cwd().readFileAlloc(alloc, "test_cases.json", 1 << 20) catch return;
    _ = data;
}
