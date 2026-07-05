import java.util.*;
public class Practice implements Solution {
    public Object solve(Map<String, Object> c) {
        List<Object> nums = (List<Object>) c.get("nums");
        long target = ((Number) c.get("target")).longValue();
        Map<Long, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.size(); i++) {
            long n = ((Number) nums.get(i)).longValue();
            if (seen.containsKey(target - n)) return List.of(seen.get(target - n), i);
            seen.put(n, i);
        }
        return List.of();
    }
}
