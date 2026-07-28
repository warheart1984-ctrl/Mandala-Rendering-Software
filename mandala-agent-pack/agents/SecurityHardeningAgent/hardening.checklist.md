# Hardening Checklist

- [ ] SECURITY.md exists and covers all modules
- [ ] No stray console.log in production code
- [ ] No empty catch blocks
- [ ] All child_process calls use arrays, not string interpolation
- [ ] CSP headers set in static server
- [ ] Environment variables validated before use
- [ ] Error propagation is explicit (no silent failures)
- [ ] Fallback logic does not introduce security holes
