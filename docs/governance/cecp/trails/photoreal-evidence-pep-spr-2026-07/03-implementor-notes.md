# 03 — Implementor notes

Status: **partial**

## Modules

- `completeness.js` — honest path scoring; never auto Full
- `emitSpr.js` / `emitPep.js` / `emitCec.js`
- `emitFromRun.js` — resolve governed-render outDir
- `schemaValidate.js` — lean required/const/pattern smoke
- `checklistT01T08.js` — pass/partial/fail suite
- `photorealEvidence.test.js`

## Governed-render hook

After `verification-trail.json` write, when `--beauty external-pbr`:

```js
emitPhotorealEvidenceFromRun({ outDir, governanceTrail, write: true })
```

Writes `spr.json`, `pep.json`, `cec.json` and stamps `trail.photorealEvidence`.

## Commands

```bash
node --test mrs/packages/renderer-core/src/evidence/photoreal/photorealEvidence.test.js
node -e "import('./mrs/packages/renderer-core/src/evidence/photoreal/index.js').then(m=>console.log(JSON.stringify(m.emitPhotorealEvidenceFromRun({outDir:'tmp/blender-10s-test/governed-render/587f836fc789a003'}),null,2)))"
```

## Honesty

- `photorealClaimLevel` stays `partial` (or `none`)
- `cec.verification.fullPhotorealEligible` always `false` from auto-emit
