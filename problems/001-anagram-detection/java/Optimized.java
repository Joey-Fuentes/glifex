import java.util.*;
public class Optimized implements Solution {
    public Object solve(Map<String, Object> c) {
        String s = (String) c.get("s"), t = (String) c.get("t");
        if (s.length() != t.length()) return false;
        int[] count = new int[128];
        for (char ch : s.toCharArray()) count[ch]++;
        for (char ch : t.toCharArray()) if (--count[ch] < 0) return false;
        return true;
    }
}
