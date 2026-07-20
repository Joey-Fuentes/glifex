const std = @import("std");
pub fn main(init: std.process.Init) !void {
    const gpa = std.heap.page_allocator;
    const v = std.json.Value{ .integer = 5 };
    const s = try std.fmt.allocPrint(gpa, "{f}", .{std.json.fmt(v, .{})});
    try std.Io.File.stdout().writeStreamingAll(init.io, s);
}
