const std = @import("std");
const json = std.json;

pub fn solve(alloc: std.mem.Allocator, c: json.Value) !json.Value {
    _ = alloc;
    const s = c.object.get("s").?.string;
    const t = c.object.get("t").?.string;
    // Return true if s and t are anagrams of each other, false otherwise.
    _ = s;
    _ = t;
    return .{ .bool = false };
}
