const std = @import("std");
const json = std.json;

pub fn solve(alloc: std.mem.Allocator, c: json.Value) !json.Value {
    _ = alloc;
    const nums = c.object.get("nums").?.array.items;
    const target = c.object.get("target").?;
    // Return the indices [i, j] (i < j) of the two numbers in nums that add up to target.
    _ = nums;
    _ = target;
    return .{ .array = json.Array.init(std.heap.page_allocator) };
}
