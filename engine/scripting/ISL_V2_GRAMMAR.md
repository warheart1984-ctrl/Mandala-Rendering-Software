# ISL v2.0 — grammar (EBNF) + parser status

> Drive-G-1: JS parser in `IslParser.js` is **enforced** for the subset used by demos.
> C# `IslEngine` / C++ `FIslEngine` are **partial** mirrors of that subset.
> SoT policy: `engine/scripting/ISL_SOT.md` · fixtures: `isl-canonical-fixtures.json`.

## Grammar (EBNF)

```
Program        ::= Statement* ;
Statement      ::= IntentStmt ";" ;
IntentStmt     ::= "intent" Identifier "(" ArgList? ")"
                   "in" "world" "(" String ")"
                   ( "at" String )?
                   ( "with" EvidenceClause )? ;
ArgList        ::= Arg ( "," Arg )* ;
Arg            ::= String | Number | ObjectLiteral ;
EvidenceClause ::= "evidence" "(" String ")"
                 | "params" ObjectLiteral ;
ObjectLiteral  ::= "{" ObjectFieldList? "}" ;
ObjectFieldList::= ObjectField ( "," ObjectField )* ;
ObjectField    ::= Identifier ":" ( String | Number | ObjectLiteral ) ;
```

## Implemented subset (evidence)

| Feature | JS | C# | C++ |
| --- | --- | --- | --- |
| `intent verb(...)` | yes | yes | yes |
| `in world("...")` | yes | yes | yes |
| `at "..."` | yes | partial | partial |
| `with evidence("...")` | yes | yes | yes |
| `with params { ... }` | yes | partial | skeleton |
| Nested object args | yes | partial | skeleton |

## Semantics (enforced in JS interpreter)

- A program may parse multiple `IntentStmt`s, but **`interpretProgram` evaluates only the last statement**.
- Earlier intents are ignored (one primary intent per script). Document scripts accordingly.

## Entry points

- JS: `engine/scripting/IslParser.js` + `IslInterpreter.js` (`CompileAndEvaluate`)
- C#: `engine/scripting/IslEngine.cs`
- C++: `engine/scripting/FIslEngine.h` (impl in Unreal plugin)
