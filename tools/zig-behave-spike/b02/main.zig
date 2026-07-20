// 0.16 harness candidate. Reads ../test_cases.json, dispatches on variant arg.
const std = @import("std");
const practice = @import("practice.zig");
const clean = @import("clean.zig");
const optimized = @import("optimized.zig");

fn dump(alloc: std.mem.Allocator, v: std.json.Value) ![]u8 {
    var buf = std.ArrayList(u8).init(alloc);
    try std.json.stringify(v, .{}, buf.writer());
    return buf.toOwnedSlice();
}

pub fn main(init: std.process.Init) !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const alloc = gpa.allocator();

    var args = try std.process.argsWithAllocator(alloc);
    _ = args.next();
    const variant = args.next() orelse "practice";

    const raw = try std.fs.cwd().readFileAlloc(alloc, "test_cases.json", 1 << 20);
    const parsed = try std.json.parseFromSlice(std.json.Value, alloc, raw, .{});
    const cases = parsed.value.array;

    var out = std.ArrayList(u8).init(alloc);
    const w = out.writer();
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

        const gs = try dump(alloc, got);
        const es = try dump(alloc, expected);
        if (std.mem.eql(u8, gs, es)) {
            passed += 1;
            try w.print("  [PASS] case {d}\n", .{i});
        } else {
            try w.print("  [FAIL] case {d} expected={s} got={s}\n", .{ i, es, gs });
        }
    }
    try w.print("{d}/{d} passed\n", .{ passed, cases.items.len });
    try std.Io.File.stdout().writeStreamingAll(init.io, out.items);
    if (passed != cases.items.len) std.process.exit(1);
}
