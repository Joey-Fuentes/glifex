import java.util.*;
// Brute force: for every character, compare how many times it occurs in each
// string. The obvious first approach -- O(n^2) time, O(1) space -- the baseline
// Clean/Optimized improve on. Non-public so it can share a file whose name
// doesn't match the class (the bake stores it as Brute-force.java).
class BruteForce implements Solution {
    public Object solve(Map<String, Object> c) {
        String s = (String) c.get("s");
        String t = (String) c.get("t");
        if (s.length() != t.length()) return false;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            int cs = 0, ct = 0;
            for (int j = 0; j < s.length(); j++) if (s.charAt(j) == ch) cs++;
            for (int j = 0; j < t.length(); j++) if (t.charAt(j) == ch) ct++;
            if (cs != ct) return false;
        }
        return true;
    }
}
