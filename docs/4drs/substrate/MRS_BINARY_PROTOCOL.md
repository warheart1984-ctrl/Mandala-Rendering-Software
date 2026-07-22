# MRS binary live-link protocol (v0)

**Status:** **declared** / **skeleton** — framing specification for a compact alternative to JSON. Not enforced in CI.

Endianness: **little-endian** throughout.

## Frame header (16 bytes)

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | Magic `MRS1` (`0x4D525331`) |
| 4 | 2 | Version (`1`) |
| 6 | 2 | Message type |
| 8 | 4 | Payload byte length |
| 12 | 4 | Frame index |

### Message types

| Type | Name |
| --- | --- |
| 1 | `STATE_SNAPSHOT` |
| 2 | `MESH_UPDATE` |
| 3 | `CONFIG` |
| 4 | `PING` |
| 5 | `PONG` |

## `STATE_SNAPSHOT` payload

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | `seed` (i32) |
| 4 | 4 | `entityCount` (u32) |
| 8 | … | entities |

### Entity record (fixed 48 bytes + optional UTF-8 blobs)

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | `id` (i32) |
| 4 | 16 | `pos4` (4×f32) |
| 20 | 4 | `topologyIdLen` |
| 24 | 4 | `materialIdLen` |
| 28 | 4 | `shaderGraphIdLen` |
| 32 | 4 | `dataLen` |
| 36 | 12 | reserved |
| 48 | … | concatenated UTF-8 strings + data bytes |

## Notes

- Prefer JSON for early Unity stubs; binary for bandwidth-sensitive streams.
- Validator outline: `scripts/replay-validator-outline.mjs` (declared).
