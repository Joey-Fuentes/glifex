// Generated harness — do not edit. Reads ../test_cases.json, runs a variant via reflection.
import java.nio.file.*;
import java.util.*;

public class Harness {
    @SuppressWarnings("unchecked")
    public static void main(String[] args) throws Exception {
        String variant = args.length > 0 ? args[0] : "practice";
        String cls = variant.substring(0, 1).toUpperCase() + variant.substring(1);
        Solution sol = (Solution) Class.forName(cls).getDeclaredConstructor().newInstance();
        String raw = Files.readString(Paths.get("..", "test_cases.json"));
        List<Object> cases = (List<Object>) Json.parse(raw);
        int passed = 0;
        for (int i = 0; i < cases.size(); i++) {
            Map<String, Object> c = (Map<String, Object>) cases.get(i);
            Object got = sol.solve((Map<String, Object>) c.get("input"));
            Object exp = c.get("expected");
            boolean ok = String.valueOf(got).equals(String.valueOf(exp));
            if (ok) { passed++; System.out.println("  [PASS] case " + i); }
            else System.out.println("  [FAIL] case " + i + "  expected=" + exp + " got=" + got);
        }
        System.out.println(passed + "/" + cases.size() + " passed");
        if (passed != cases.size()) System.exit(1);
    }
}
