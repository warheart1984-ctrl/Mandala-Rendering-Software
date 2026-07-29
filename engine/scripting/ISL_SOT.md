# ISL v2.0 — source of truth (SoT)

Drive-G-1: claims here must match tests in `engine/scripting/test/isl-canonical-parity.test.js` and `engine/tests/EngineTests/IslEngineTests.cs`.

## Authoritative runtime (SoT)

| Layer | Path | Status |
| --- | --- | --- |
| Lexer + parser | `engine/scripting/IslParser.js` | **enforced** (Node tests + browser demos) |
| Interpreter | `engine/scripting/IslInterpreter.js` | **enforced** |
| Canonical script text | `engine/scripting/scripts/*.isl.js` | **enforced** (imported by `js/engine/boot.js`) |
| Grammar doc | `engine/scripting/ISL_V2_GRAMMAR.md` | **partial** (documents subset) |
| Parity fixtures | `engine/scripting/isl-canonical-fixtures.json` | **enforced** (JS test vs manifest) |

**Decision:** JavaScript (`IslParser` + `IslInterpreter`) is the only full ISL v2 subset SoT. Hosts must compile/evaluate demo ISL through JS in the browser adapter or through fixtures validated in CI.

## Host mirrors (not SoT)

| Host | Implementation | Status | Sync rule |
| --- | --- | --- | --- |
| C# (engine) | `engine/scripting/IslEngine.cs` | **partial** | Match fixtures in `IslEngineTests.cs`; do not extend grammar without JS + fixtures |
| C# (Unity copy) | `unity/.../IslEngine.cs` | **skeleton** | Manual mirror of engine `IslEngine.cs` when C# engine changes |
| C++ (Unreal) | `engine/scripting/FIslEngine.h` + plugin `IslEngine.cpp` | **partial** | Same fixture semantics for `play_timeline` / evidence / world |
| Camera4D duplicate | `mrs/packages/renderer-core/src/camera/Camera4D.js` exports `createIslEngine` | **declared** stray — not ISL SoT; use `engine/scripting/IslInterpreter.js` |

## Drift reduction

1. Add or change demo ISL only in `engine/scripting/scripts/*.isl.js`.
2. Update `isl-canonical-fixtures.json` expected fields when script semantics change.
3. Run `node --test engine/scripting/test/isl-canonical-parity.test.js` and `dotnet test` on `IslEngineTests` when touching parsers.
4. Do **not** embed duplicate ISL source strings in Unity/Unreal scenes except test/bootstrap samples tied to fixtures.

## Generate / sync (optional)

There is no code generator from JS AST → C# today. Convergence is **fixture-driven**: shared expected intent shape in JSON, verified independently per host.
