package main

func clean(c map[string]any) any {
	return sortStr(c["s"].(string)) == sortStr(c["t"].(string))
}
