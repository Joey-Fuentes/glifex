using System;
using System.Linq;
using System.Collections.Generic;
class Clean : ISolution {
    public object Solve(Dictionary<string, object> c) {
        return c["s"].ToString().OrderBy(x => x).SequenceEqual(c["t"].ToString().OrderBy(x => x));
    }
}
