const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const alloc = gpa.allocator();
    _ = alloc;
}
