def solve(case):
    seen = {}
    for i, n in enumerate(case["nums"]):
        if case["target"] - n in seen:
            return [seen[case["target"] - n], i]
        seen[n] = i
    return None
