def solve(c)
  seen = {}
  c["nums"].each_with_index do |n, i|
    need = c["target"] - n
    return [seen[need], i] if seen.key?(need)
    seen[n] = i
  end
  []
end
