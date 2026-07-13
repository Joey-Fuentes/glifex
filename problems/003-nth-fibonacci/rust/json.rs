// Minimal JSON parser (dependency-free; the idiomatic path is serde_json via
// cargo, but Glifex stays offline-friendly). Vendored — do not edit.
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq)]
pub enum JVal {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<JVal>),
    Obj(BTreeMap<String, JVal>),
}

#[allow(dead_code)]
impl JVal {
    pub fn get(&self, key: &str) -> &JVal {
        match self { JVal::Obj(m) => &m[key], _ => panic!("not an object") }
    }
    pub fn as_str(&self) -> &str {
        match self { JVal::Str(s) => s, _ => panic!("not a string") }
    }
    pub fn as_num(&self) -> f64 {
        match self { JVal::Num(n) => *n, _ => panic!("not a number") }
    }
    pub fn as_arr(&self) -> &Vec<JVal> {
        match self { JVal::Arr(a) => a, _ => panic!("not an array") }
    }
    pub fn dump(&self) -> String {
        match self {
            JVal::Null => "null".into(),
            JVal::Bool(b) => b.to_string(),
            JVal::Num(n) => if n.fract() == 0.0 { format!("{}", *n as i64) } else { n.to_string() },
            JVal::Str(s) => format!("\"{}\"", s),
            JVal::Arr(a) => format!("[{}]", a.iter().map(|v| v.dump()).collect::<Vec<_>>().join(",")),
            JVal::Obj(m) => format!("{{{}}}", m.iter().map(|(k, v)| format!("\"{}\":{}", k, v.dump())).collect::<Vec<_>>().join(",")),
        }
    }
}

pub fn parse(src: &str) -> JVal {
    let b = src.as_bytes();
    let mut i = 0;
    value(b, &mut i)
}

fn ws(b: &[u8], i: &mut usize) { while *i < b.len() && b[*i].is_ascii_whitespace() { *i += 1 } }

fn value(b: &[u8], i: &mut usize) -> JVal {
    ws(b, i);
    match b[*i] {
        b'{' => { let mut m = BTreeMap::new(); *i += 1; ws(b, i);
            if b[*i] == b'}' { *i += 1; return JVal::Obj(m); }
            loop { ws(b, i); let k = string(b, i); ws(b, i); *i += 1;
                m.insert(k, value(b, i)); ws(b, i);
                if b[*i] == b',' { *i += 1; continue } *i += 1; break }
            JVal::Obj(m) }
        b'[' => { let mut a = Vec::new(); *i += 1; ws(b, i);
            if b[*i] == b']' { *i += 1; return JVal::Arr(a); }
            loop { a.push(value(b, i)); ws(b, i);
                if b[*i] == b',' { *i += 1; continue } *i += 1; break }
            JVal::Arr(a) }
        b'"' => JVal::Str(string(b, i)),
        b't' => { *i += 4; JVal::Bool(true) }
        b'f' => { *i += 5; JVal::Bool(false) }
        b'n' => { *i += 4; JVal::Null }
        _ => { let st = *i;
            while *i < b.len() && (b[*i].is_ascii_digit() || b"-+.eE".contains(&b[*i])) { *i += 1 }
            JVal::Num(std::str::from_utf8(&b[st..*i]).unwrap().parse().unwrap()) }
    }
}

fn string(b: &[u8], i: &mut usize) -> String {
    let mut out = String::new(); *i += 1;
    while b[*i] != b'"' {
        let c = b[*i]; *i += 1;
        if c == b'\\' { let e = b[*i]; *i += 1;
            out.push(match e { b'n' => '\n', b't' => '\t', x => x as char }) }
        else { out.push(c as char) }
    }
    *i += 1; out
}
