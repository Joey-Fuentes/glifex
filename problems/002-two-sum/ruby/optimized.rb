# Optimized: same O(n) hash-map approach as clean.rb, but a single
# hash lookup per element instead of key?+[] (two lookups for the
# same key on every hit) -- same pattern, same measured win, as
# optimized.js/optimized.py (see those files' comments). Ruby's
# Hash#[] already returns nil (not an exception) for a missing key,
# so this is a single lookup either way -- `if idx` is safe here
# even for index 0, since only nil/false are falsy in Ruby.
def solve(c)
  seen = {}
  nums = c["nums"]
  (0...nums.length).each do |i|
    need = c["target"] - nums[i]
    idx = seen[need]
    return [idx, i] if idx
    seen[nums[i]] = i
  end
  []
end

