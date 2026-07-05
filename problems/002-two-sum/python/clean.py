def solve(c):
    seen = {}
    for i, n in enumerate(c["nums"]):
        if c["target"] - n in seen:
            return [seen[c["target"] - n], i]
        seen[n] = i
    return []
