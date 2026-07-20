const std = @import("std");
fn dump(alloc: std.mem.Allocator, v: std.json.Value) ![]u8 {
    var buf = std.ArrayList(u8).init(alloc);
    try std.json.stringify(v, .{}, buf.writer());
    return buf.toOwnedSlice();
}
pub fn main(init: std.process.Init) !void {
    const alloc = std.heap.page_allocator;
    const parsed = try std.json.parseFromSlice(std.json.Value, alloc, "[true,false]", .{});
    const a = try dump(alloc, parsed.value.array.items[0]);
    const b = try dump(alloc, parsed.value.array.items[1]);
    const eq = std.mem.eql(u8, a, b);
    var o = std.ArrayList(u8).init(alloc);
    try o.writer().print("{}\n", .{eq});
    try std.Io.File.stdout().writeStreamingAll(init.io, o.items);
}
