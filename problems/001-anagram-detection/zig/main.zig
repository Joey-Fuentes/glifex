// Generated harness — do not edit. Reads ../test_cases.json, dispatches on variant.
// Written against Zig 0.14 std.json; pre-1.0 std APIs shift — pin your version.
const std = @import("std");
const practice = @import("practice.zig");
const clean = @import("clean.zig");
const optimized = @import("optimized.zig");

fn dump(v: std.json.Value, w: anytype) !void {
    try std.json.stringify(v, .{}, w);
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const alloc = gpa.allocator();
    var args = try std.process.argsWithAllocator(alloc);
    _ = args.next();
    const variant = args.next() orelse "practice";

    const raw = try std.fs.cwd().readFileAlloc(alloc, "../test_cases.json", 1 << 20);
    const parsed = try std.json.parseFromSlice(std.json.Value, alloc, raw, .{});
    const cases = parsed.value.array;

    const stdout = std.io.getStdOut().writer();
    var passed: usize = 0;
    for (cases.items, 0..) |c, i| {
        const input = c.object.get("input").?;
        const expected = c.object.get("expected").?;
        const got = if (std.mem.eql(u8, variant, "practice"))
            try practice.solve(alloc, input)
        else if (std.mem.eql(u8, variant, "clean"))
            try clean.solve(alloc, input)
        else
            try optimized.solve(alloc, input);

        var gbuf = std.ArrayList(u8).init(alloc);
        var ebuf = std.ArrayList(u8).init(alloc);
        try dump(got, gbuf.writer());
        try dump(expected, ebuf.writer());
        const ok = std.mem.eql(u8, gbuf.items, ebuf.items);
        if (ok) {
            passed += 1;
            try stdout.print("  [PASS] case {d}\n", .{i});
        } else {
            try stdout.print("  [FAIL] case {d}  expected={s} got={s}\n", .{ i, ebuf.items, gbuf.items });
        }
    }
    try stdout.print("{d}/{d} passed\n", .{ passed, cases.items.len });
    if (passed != cases.items.len) std.process.exit(1);
}
