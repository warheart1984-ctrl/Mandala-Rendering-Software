# Critical Security Rules

1. **Shell injection**: never interpolate user input into shell commands.
2. **XSS**: never render unescaped user input in HTML/UI contexts.
3. **eval**: never use `eval()` or `new Function()` with user input.
4. **Dynamic import**: validate import paths; never import from user-provided URLs.
5. **Browser fs**: never import `node:fs` at top level in browser-exposed code.
6. **Ledger**: use lazy dynamic `import("node:fs")` with `.catch(() => {})` for browser safety.
