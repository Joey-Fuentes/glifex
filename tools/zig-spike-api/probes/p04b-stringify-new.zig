const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    const gpa = std.heap.page_allocator;
    const v = std.json.Value{ .integer = 5 };
    const s = try std.json.Stringify.valueAlloc(gpa, v, .{});
    _ = s;
}
