# Brute force: check every pair. The "obvious" first approach --
# O(n^2) time, O(1) space.
def solve(c)
  nums = c["nums"]
  (0...nums.length).each do |i|
    (i + 1...nums.length).each do |j|
      return [i, j] if nums[i] + nums[j] == c["target"]
    end
  end
  []
end
