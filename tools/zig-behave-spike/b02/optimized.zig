const std = @import("std");
const json = std.json;

pub fn solve(alloc: std.mem.Allocator, c: json.Value) !json.Value {
    const nums = c.object.get("nums").?.array.items;
    const target = switch (c.object.get("target").?) {
        .integer => |n| @as(f64, @floatFromInt(n)),
        .float => |n| n,
        else => unreachable,
    };
    var seen = std.AutoHashMap(i64, usize).init(alloc);
    for (nums, 0..) |nv, i| {
        const n: f64 = switch (nv) {
            .integer => |x| @as(f64, @floatFromInt(x)),
            .float => |x| x,
            else => unreachable,
        };
        const need: i64 = @intFromFloat(target - n);
        if (seen.get(need)) |j| {
            var out = json.Array.init(alloc);
            try out.append(.{ .integer = @intCast(j) });
            try out.append(.{ .integer = @intCast(i) });
            return .{ .array = out };
        }
        try seen.put(@intFromFloat(n), i);
    }
    return .{ .array = json.Array.init(alloc) };
}
