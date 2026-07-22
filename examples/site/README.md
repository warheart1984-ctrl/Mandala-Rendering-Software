# GitHub Pages prep

This folder is a **static landing stub**. It does **not** claim a deployed URL.

## Recommended publish root

Publish the **repository root** (not only `examples/site`) so ES module imports
like `../../4d-renderer/src/...` from `examples/web-demo.html` resolve.

In GitHub → Settings → Pages:

1. Source: GitHub Actions **or** Deploy from branch
2. If branch deploy: `/` (root) on `main`
3. Open `https://<user>.github.io/<repo>/examples/web-demo.html` only after Pages is enabled

Optional workflow: [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml)
(uploads the whole repo as a static artifact). Enable Pages to use Actions as
the source before expecting a public URL.
