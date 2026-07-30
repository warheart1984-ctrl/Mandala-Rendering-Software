# Expected provenance artifacts (CKO-0001)

**Status:** skeleton — **not frozen**

After the first YouTube publish, write these files here:

| File | Contents |
|------|----------|
| `cko.hash` | SHA-256 of `knowledge/objects/CKO-0001.yaml` |
| `script.hash` | SHA-256 of frozen script |
| `narration.hash` | SHA-256 of narration audio or canonical transcript |
| `visuals.hash` | SHA-256 of visual plan |
| `video.hash` | SHA-256 of final video file |
| `pipeline-version.txt` | Exact `pipeline_version` from `config/pipeline.yaml` |
| `youtube.url.txt` | Public YouTube URL (optional but recommended) |

Do not claim RBC-0001 **enforced** until these exist and `test-reproducibility` passes.
