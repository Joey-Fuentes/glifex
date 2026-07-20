const std = @import("std");
const json = std.json;

pub fn solve(alloc: std.mem.Allocator, c: json.Value) !json.Value {
    _ = alloc;
    const s = c.object.get("s").?.string;
    const t = c.object.get("t").?.string;
    if (s.len != t.len) return .{ .bool = false };
    var count = [_]i32{0} ** 256;
    for (s) |ch| count[ch] += 1;
    for (t) |ch| {
        count[ch] -= 1;
        if (count[ch] < 0) return .{ .bool = false };
    }
    return .{ .bool = true };
}
