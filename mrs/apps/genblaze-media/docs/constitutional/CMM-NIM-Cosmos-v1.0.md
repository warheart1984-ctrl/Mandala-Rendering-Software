# CMM-NIM-Cosmos-v1.0 — Module Identity

| Field | Value |
| --- | --- |
| Module ID | CMM-NIM-Cosmos-v1.0 |
| Class | CMM (Constitutional Media Module) |
| Version | 1.0 |
| Status (Drive-G-1) | **declared** (substrate operator path prepared in code) |
| Domain | CH-GNMD-v1.0 |
| Lineage | **New Work** — no Story Forge ancestry or imports |

JCR/CEL/Sovereign IDE bindings are declared; this service does not host those runtimes.

## What this module is

Identity for the NVIDIA NIM **Cosmos** text-to-video path inside Genblaze Media:

- FastAPI route `POST /api/generate-video`
- Pipeline `app/pipeline_video.py` (`NvidiaVideoProvider`, `Modality.VIDEO`)
- UI section `#nim-cosmos` / redirect `/media/nim-cosmos`
- Health fields `video_model`, `video_enabled`, `video_available`, `cmm_id`

## What this module is not

- Not a promotion of Cosmos clips into MRS 4D world state
- Not Story Forge lineage (no `story_forge` imports; dry-run manifest marks `lineage: new-work-no-story-forge`)
- Not Arena/JCR/CEL enforcement — those remain declared roadmap items in `ACP-NIM-Cosmos-v1.0.md`

## Runtime binding (evidence)

Binding is the FastAPI app plus Genblaze provenance manifest written to B2 (or dry-run stub). Optional `duration_seconds` / `resolution` appear on results **only** when the provider payload supplies them — never invented.
