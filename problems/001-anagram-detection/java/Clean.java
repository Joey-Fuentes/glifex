import java.util.*;
public class Clean implements Solution {
    public Object solve(Map<String, Object> c) {
        char[] a = ((String) c.get("s")).toCharArray();
        char[] b = ((String) c.get("t")).toCharArray();
        Arrays.sort(a); Arrays.sort(b);
        return Arrays.equals(a, b);
    }
}
