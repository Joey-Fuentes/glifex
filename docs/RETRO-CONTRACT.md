# RETRO-CONTRACT -- deferred work, scheduled for retro core #3

The retro I/O contract today: byte inputs at a fixed RAM address, 16-bit
little-endian result at a fixed pair, halt instruction stops the run
(6502: in $10 / out $12-$13 / BRK; SM83: in $C000 / out $C010-$C011 / HALT).
Anything outside "small ints in, u16 out" either cannot be marshalled
(strings/arrays -- why retro lives only on 003) or silently truncates.

Planned, in order, when core #3 lands:

1. **Fit-verifier (do first -- guards a silent-wrong-answer bug).** CI check:
   any problem declaring a retro language must have every test-case input and
   expected value within the declared width (default: u8 in, u16 out). Fails
   loud ("case N does not fit the asm-6502 contract"). The fib(20)=6765 case
   already forced the u16 result; new problems can reintroduce the trap.
2. **Declared widths.** Per-problem width in the manifest (u8/u16, LE pairs),
   read by the loaders and the fit-verifier.
3. **Array/string ABI.** Design against >=2 instruction sets so it is portable
   by construction (length byte + elements at a fixed base, sketch). Unlocks
   two-sum / anagram-class problems for retro.
4. **Loader factoring.** At three cores, load6502/loadSm83 duplication becomes
   makeRetroLoader(config).

Also parked for offloaded compute: Tom Harte per-opcode validation of both
cores (correctness + true cycle timing; sets exist for 6502 and SM83) --
vector sets are millions of cases, wrong workload for phone/metered CI.
