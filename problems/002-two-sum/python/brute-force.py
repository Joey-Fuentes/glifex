# Brute force: check every pair. The "obvious" first approach --
# O(n^2) time, O(1) space.
def solve(c):
    nums = c["nums"]
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == c["target"]:
                return [i, j]
    return []
