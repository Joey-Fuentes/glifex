import java.util.*;
public class Clean implements Solution {
    public Object solve(Map<String, Object> c) {
        long n = ((Number) c.get("n")).longValue();
        long a = 0, b = 1;
        for (long i = 0; i < n; i++) { long t = a + b; a = b; b = t; }
        return a;
    }
}
