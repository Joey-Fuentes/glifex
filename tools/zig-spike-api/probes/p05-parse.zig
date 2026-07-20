const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    const gpa = std.heap.page_allocator;
    const parsed = try std.json.parseFromSlice(std.json.Value, gpa, "[1,2]", .{});
    defer parsed.deinit();
    _ = parsed.value.array;
}
