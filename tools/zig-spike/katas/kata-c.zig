// Spelling C -- the playground's hello-world EXACTLY as shipped, unmodified.
// The guaranteed-to-compile fallback. If only this one works the demo still
// runs end to end, but it proves less: a literal string cannot show the
// compiler computed anything. The gate records which spelling won so the
// summary can say honestly which of these we are looking at.
const std = @import("std");

pub fn main(init: std.process.Init) !void {
    try std.Io.File.stdout().writeStreamingAll(init.io, "Hello, World!\n");
}
