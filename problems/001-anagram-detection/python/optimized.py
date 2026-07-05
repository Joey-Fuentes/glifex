from collections import Counter
def solve(case):
    return Counter(case["s"]) == Counter(case["t"])
