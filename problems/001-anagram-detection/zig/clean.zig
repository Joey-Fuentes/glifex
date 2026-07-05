const std = @import("std");
const json = std.json;

pub fn solve(alloc: std.mem.Allocator, c: json.Value) !json.Value {
    const s = c.object.get("s").?.string;
    const t = c.object.get("t").?.string;
    if (s.len != t.len) return .{ .bool = false };
    const a = try alloc.dupe(u8, s);
    const b = try alloc.dupe(u8, t);
    std.mem.sort(u8, a, {}, std.sort.asc(u8));
    std.mem.sort(u8, b, {}, std.sort.asc(u8));
    return .{ .bool = std.mem.eql(u8, a, b) };
}
