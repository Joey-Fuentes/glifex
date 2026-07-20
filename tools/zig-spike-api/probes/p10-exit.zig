const std = @import("std");
pub fn main(init: std.process.Init) !void {
    _ = init;
    std.process.exit(0);
}
