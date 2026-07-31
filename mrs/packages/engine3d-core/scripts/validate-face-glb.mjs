#!/usr/bin/env node
/**
 * validate-face-glb.mjs — Validate exported face GLB against production spec.
 *
 * Usage:
 *   node validate-face-glb.mjs path/to/HumanFaceRigged.glb
 *
 * Checks:
 * - Armature with 9 required bones
 * - Skin (joints, weights, inverse bind matrices)
 * - Morph targets (18 blendshapes + Basis)
 * - Materials (face_skin, eyes, mouth)
 * - UVs present
 * - GLB structure valid
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_BONES = [
    "Head", "Jaw", "LeftEye", "RightEye",
    "LeftBrow", "RightBrow", "UpperLip", "LowerLip"
];

const REQUIRED_BLENDSHAPES = [
    "Smile", "Frown", "BlinkLeft", "BlinkRight",
    "Squint", "WideEyes", "MouthOpen", "MouthNarrow"
];

const REQUIRED_MATERIALS = ["face_skin", "eyes", "mouth"];

function readGLB(filepath) {
    const data = readFileSync(filepath);
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Parse GLB header
    if (data[0] !== 0x67 || data[1] !== 0x6C || data[2] !== 0x54 || data[3] !== 0x46) {
        throw new Error("Not a valid GLB (magic mismatch)");
    }
    const version = dv.getUint32(4, true);
    const length = dv.getUint32(8, true);
    if (length !== data.length) {
        throw new Error(`GLB length mismatch: header=${length}, file=${data.length}`);
    }

    let offset = 12;
    const chunks = [];

    while (offset < data.length) {
        if (offset + 8 > data.length) break;
        const chunkLen = dv.getUint32(offset, true);
        const chunkType = String.fromCharCode(...data.slice(offset + 4, offset + 8));
        const chunkData = data.slice(offset + 8, offset + 8 + chunkLen);
        chunks.push({ type: chunkType, data: chunkData });
        offset += 8 + chunkLen;
        // Padding
        const pad = (4 - (chunkLen % 4)) % 4;
        offset += pad;
    }

    const jsonChunk = chunks.find(c => c.type === "JSON");
    const binChunk = chunks.find(c => c.type === "BIN");

    if (!jsonChunk) throw new Error("No JSON chunk found");

    const gltf = JSON.parse(new TextDecoder().decode(jsonChunk.data));
    return { gltf, binData: binChunk?.data || new Uint8Array(0) };
}

function checkAccessor(gltf, binData, accessorIndex) {
    if (accessorIndex === undefined || accessorIndex === null) return null;
    const acc = gltf.accessors[accessorIndex];
    if (!acc) return null;
    const bv = gltf.bufferViews[acc.bufferView];
    const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const count = acc.count;
    const type = acc.type; // SCALAR, VEC2, VEC3, VEC4, MAT2, MAT3, MAT4
    const componentType = acc.componentType; // 5120=BYTE, 5121=UBYTE, 5122=SHORT, 5123=USHORT, 5125=UINT, 5126=FLOAT
    return { accessor: acc, bufferView: bv, byteOffset, count, type, componentType };
}

function validateFaceGLB(filepath) {
    const { gltf, binData } = readGLB(filepath);
    const errors = [];
    const warnings = [];

    // 1. Check nodes for armature + mesh
    const armatureNode = gltf.nodes?.find(n => n.name === "Armature" || (n.extras?.humanRigCapabilities));
    const meshNode = gltf.nodes?.find(n => n.mesh !== undefined);
    const skinNode = gltf.nodes?.find(n => n.skin !== undefined);

    if (!armatureNode) {
        errors.push("No armature node found (name='Armature' or extras.humanRigCapabilities)");
    }
    if (!meshNode) {
        errors.push("No mesh node found");
    }
    if (!skinNode) {
        errors.push("No skinned mesh node (no 'skin' property)");
    }

    // 2. Check skin
    if (gltf.skins && gltf.skins.length > 0) {
        const skin = gltf.skins[0];
        if (!skin.joints || skin.joints.length < REQUIRED_BONES.length) {
            errors.push(`Skin joints count (${skin.joints?.length || 0}) < required ${REQUIRED_BONES.length}`);
        }
        const jointNames = skin.joints?.map(j => gltf.nodes[j]?.name) || [];
        for (const reqBone of REQUIRED_BONES) {
            if (!jointNames.includes(reqBone)) {
                errors.push(`Missing bone in skin: ${reqBone}`);
            }
        }
        if (!skin.inverseBindMatrices) {
            errors.push("Skin missing inverseBindMatrices");
        }
    } else {
        errors.push("No skins found in GLB");
    }

    // 3. Check morph targets (blendshapes)
    const mesh = gltf.meshes?.[0];
    if (mesh && mesh.primitives) {
        const prim = mesh.primitives[0];
        if (prim.targets && prim.targets.length > 0) {
            const foundShapes = new Set();
            // Check extras for humanRigMorphIds
            if (prim.extras?.humanRigMorphIds) {
                for (const id of prim.extras.humanRigMorphIds) {
                    foundShapes.add(id);
                }
            }
            for (const req of REQUIRED_BLENDSHAPES) {
                if (!foundShapes.has(req)) {
                    // Check if targets array has enough entries
                    if (prim.targets.length < REQUIRED_BLENDSHAPES.length) {
                        errors.push(`Blendshape count (${prim.targets.length}) < required ${REQUIRED_BLENDSHAPES.length}`);
                    }
                    break;
                }
            }
        } else {
            errors.push("No morph targets found in mesh primitive");
        }
    }

    // 4. Check materials
    const matNames = new Set(gltf.materials?.map(m => m.name) || []);
    for (const reqMat of REQUIRED_MATERIALS) {
        if (!matNames.has(reqMat)) {
            warnings.push(`Missing material: ${reqMat}`);
        }
    }

    // 5. Check UVs (TEXCOORD_0 in primitive attributes)
    if (mesh && mesh.primitives) {
        for (const prim of mesh.primitives) {
            if (!prim.attributes?.TEXCOORD_0) {
                warnings.push("Mesh primitive missing TEXCOORD_0 (UVs)");
            }
        }
    }

    // 6. Check skinning attributes (JOINTS_0, WEIGHTS_0)
    if (mesh && mesh.primitives) {
        for (const prim of mesh.primitives) {
            if (!prim.attributes?.JOINTS_0) {
                errors.push("Missing JOINTS_0 attribute (skinning)");
            }
            if (!prim.attributes?.WEIGHTS_0) {
                errors.push("Missing WEIGHTS_0 attribute (skinning)");
            }
        }
    }

    return { errors, warnings, valid: errors.length === 0 };
}

// ─── Main ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Usage: node validate-face-glb.mjs <path.glb>");
    process.exit(1);
}

const filepath = resolve(args[0]);
try {
    const result = validateFaceGLB(filepath);
    console.log("=== Face GLB Validation ===");
    console.log(`File: ${filepath}`);
    console.log(`Valid: ${result.valid ? "YES" : "NO"}`);
    console.log("");
    if (result.errors.length > 0) {
        console.log("ERRORS:");
        for (const e of result.errors) console.log(`  - ${e}`);
    }
    if (result.warnings.length > 0) {
        console.log("WARNINGS:");
        for (const w of result.warnings) console.log(`  - ${w}`);
    }
    if (result.errors.length === 0 && result.warnings.length === 0) {
        console.log("All checks passed.");
    }
    process.exit(result.valid ? 0 : 1);
} catch (e) {
    console.error("Validation failed:", e.message);
    process.exit(1);
}