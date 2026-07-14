import java.util.*;
// Same O(n) window-slide as Clean, unrolled 2x: two Fibonacci steps per
// loop-counter check (peel an odd n first). A constant-factor win that stays
// in the declared O(n) class.
public class Optimized implements Solution {
    public Object solve(Map<String, Object> c) {
        long n = ((Number) c.get("n")).longValue();
        long a = 0, b = 1;
        if ((n & 1) != 0) { long na = b, nb = a + b; a = na; b = nb; n -= 1; }
        while (n > 0) { long t = a + b; b = t + b; a = t; n -= 2; }
        return a;
    }
}
