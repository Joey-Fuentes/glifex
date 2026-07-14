import java.util.*;
// Brute force: check every pair. The obvious first approach -- O(n^2) time,
// O(1) space. Non-public so the file name (Brute-force.java) need not match.
class BruteForce implements Solution {
    public Object solve(Map<String, Object> c) {
        List<Object> nums = (List<Object>) c.get("nums");
        long target = ((Number) c.get("target")).longValue();
        for (int i = 0; i < nums.size(); i++) {
            long a = ((Number) nums.get(i)).longValue();
            for (int j = i + 1; j < nums.size(); j++) {
                long b = ((Number) nums.get(j)).longValue();
                if (a + b == target) return List.of(i, j);
            }
        }
        return List.of();
    }
}
