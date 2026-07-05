// Minimal JSON parser (Java stdlib has none). Vendored so the repo stays dependency-free.
import java.util.*;
public class Json {
    private final String s; private int i;
    private Json(String s){this.s=s;}
    public static Object parse(String s){ Json j=new Json(s); j.ws(); return j.value(); }
    private Object value(){
        ws(); char c=s.charAt(i);
        if(c=='{') return obj(); if(c=='[') return arr();
        if(c=='"') return str(); if(c=='t'){i+=4;return true;}
        if(c=='f'){i+=5;return false;} if(c=='n'){i+=4;return null;}
        return num();
    }
    private Map<String,Object> obj(){ Map<String,Object> m=new LinkedHashMap<>(); i++; ws();
        if(s.charAt(i)=='}'){i++;return m;}
        while(true){ ws(); String k=str(); ws(); i++; /*:*/ m.put(k,value()); ws();
            if(s.charAt(i)==','){i++;continue;} i++; break; } return m; }
    private List<Object> arr(){ List<Object> a=new ArrayList<>(); i++; ws();
        if(s.charAt(i)==']'){i++;return a;}
        while(true){ a.add(value()); ws(); if(s.charAt(i)==','){i++;continue;} i++; break; } return a; }
    private String str(){ StringBuilder b=new StringBuilder(); i++;
        while(s.charAt(i)!='"'){ char c=s.charAt(i++); if(c=='\\'){ char e=s.charAt(i++);
            b.append(e=='n'?'\n':e=='t'?'\t':e); } else b.append(c);} i++; return b.toString(); }
    private Object num(){ int st=i; while(i<s.length()&&"-+.eE0123456789".indexOf(s.charAt(i))>=0) i++;
        String n=s.substring(st,i); return n.contains(".")?(Object)Double.parseDouble(n):(Object)Long.parseLong(n); }
    private void ws(){ while(i<s.length()&&Character.isWhitespace(s.charAt(i))) i++; }
}
