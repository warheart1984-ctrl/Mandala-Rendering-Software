/**
 * GLB exporter for character stages.
 * Wire = mesh + emissive; rigged = mesh + skin + armature; final = mesh + PBR.
 *
 * STATUS: enforced (GLB 2.0 mesh/skin). FBX: declared (see export-fbx.mjs).
 */
function pad4(n) { return (4 - (n % 4)) % 4; }

function concat(bufs) {
  const total = bufs.reduce((s, b) => s + b.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of bufs) {
    const u = b instanceof Uint8Array ? b : new Uint8Array(b);
    out.set(u, o);
    o += u.byteLength;
  }
  return out;
}

function minMax3(arr) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = arr[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

/**
 * @param {object} asset
 * @param {"wire"|"rigged"|"final"} stage
 * @param {object} [sim]
 */
export function exportCharacterGlb(asset, stage, sim = null) {
  const pos = new Float32Array(asset.mesh.positions.length * 3);
  for (let i = 0; i < asset.mesh.positions.length; i++) {
    pos[i * 3] = asset.mesh.positions[i][0];
    pos[i * 3 + 1] = asset.mesh.positions[i][1];
    pos[i * 3 + 2] = asset.mesh.positions[i][2];
  }
  const nrm = new Float32Array(asset.normals.length * 3);
  for (let i = 0; i < asset.normals.length; i++) {
    nrm[i * 3] = asset.normals[i][0];
    nrm[i * 3 + 1] = asset.normals[i][1];
    nrm[i * 3 + 2] = asset.normals[i][2];
  }
  const uv = new Float32Array(asset.uvs.length * 2);
  for (let i = 0; i < asset.uvs.length; i++) {
    uv[i * 2] = asset.uvs[i][0];
    uv[i * 2 + 1] = asset.uvs[i][1];
  }
  const idx = new Uint32Array(asset.triangles);

  const includeSkin = stage === "rigged" || stage === "final";
  const joints = includeSkin ? new Uint8Array(asset.mesh.positions.length * 4) : null;
  const weights = includeSkin ? new Float32Array(asset.mesh.positions.length * 4) : null;
  if (includeSkin) {
    for (let i = 0; i < asset.skin.joints.length; i++) {
      for (let k = 0; k < 4; k++) {
        joints[i * 4 + k] = asset.skin.joints[i][k];
        weights[i * 4 + k] = asset.skin.weights[i][k];
      }
    }
  }

  const parts = [pos, nrm, uv, idx];
  if (includeSkin) parts.push(joints, weights);

  let ibm = null;
  if (includeSkin) {
    ibm = new Float32Array(asset.ibm.length * 16);
    for (let i = 0; i < asset.ibm.length; i++) ibm.set(asset.ibm[i], i * 16);
    parts.push(ibm);
  }

  const aligned = parts.map((p) => {
    const u = new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
    const pad = pad4(u.byteLength);
    if (!pad) return u;
    const out = new Uint8Array(u.byteLength + pad);
    out.set(u);
    return out;
  });
  const bin = concat(aligned);

  const views = [];
  const accessors = [];
  let offset = 0;
  function addView(bytes, target) {
    const bv = { buffer: 0, byteOffset: offset, byteLength: bytes };
    if (target) bv.target = target;
    views.push(bv);
    const idxV = views.length - 1;
    offset += bytes + pad4(bytes);
    return idxV;
  }
  function addAcc(view, type, componentType, count, extra = {}) {
    accessors.push({ bufferView: view, componentType, count, type, ...extra });
    return accessors.length - 1;
  }

  const posMM = minMax3(pos);
  const posView = addView(pos.byteLength, 34962);
  const posAcc = addAcc(posView, "VEC3", 5126, asset.mesh.positions.length, { min: posMM.min, max: posMM.max });
  const nrmView = addView(nrm.byteLength, 34962);
  const nrmAcc = addAcc(nrmView, "VEC3", 5126, asset.normals.length);
  const uvView = addView(uv.byteLength, 34962);
  const uvAcc = addAcc(uvView, "VEC2", 5126, asset.uvs.length);
  const idxView = addView(idx.byteLength, 34963);
  const idxAcc = addAcc(idxView, "SCALAR", 5125, idx.length);

  let jointsAcc, weightsAcc, ibmAcc;
  if (includeSkin) {
    const jView = addView(joints.byteLength, 34962);
    jointsAcc = addAcc(jView, "VEC4", 5121, asset.mesh.positions.length);
    const wView = addView(weights.byteLength, 34962);
    weightsAcc = addAcc(wView, "VEC4", 5126, asset.mesh.positions.length);
    const ibmView = addView(ibm.byteLength);
    ibmAcc = addAcc(ibmView, "MAT4", 5126, asset.ibm.length);
  }

  const emissive = stage === "wire" ? [0.15, 0.85, 1.0] : [0, 0, 0];
  const baseColor = stage === "wire"
    ? [0.05, 0.08, 0.12, 1]
    : stage === "final"
      ? [0.55, 0.42, 0.32, 1]
      : [0.65, 0.65, 0.7, 1];

  const attributes = { POSITION: posAcc, NORMAL: nrmAcc, TEXCOORD_0: uvAcc };
  if (includeSkin) {
    attributes.JOINTS_0 = jointsAcc;
    attributes.WEIGHTS_0 = weightsAcc;
  }

  const nodes = [];
  const meshNode = {
    name: `${asset.id}_${stage}`,
    mesh: 0,
  };
  if (includeSkin) meshNode.skin = 0;
  nodes.push(meshNode);

  let skins, extras;
  if (includeSkin) {
    const jointNodes = [];
    const boneIndex = {};
    for (const bone of asset.armature.bones) {
      boneIndex[bone.id] = nodes.length;
      const parent = bone.parent == null ? undefined : boneIndex[bone.parent];
      const node = {
        name: bone.id,
        translation: [
          bone.head[0] - (bone.parent ? asset.armature.byId[bone.parent].head[0] : 0),
          bone.head[1] - (bone.parent ? asset.armature.byId[bone.parent].head[1] : 0),
          bone.head[2] - (bone.parent ? asset.armature.byId[bone.parent].head[2] : 0),
        ],
      };
      nodes.push(node);
      jointNodes.push(nodes.length - 1);
      if (parent != null) {
        nodes[parent].children = nodes[parent].children || [];
        nodes[parent].children.push(nodes.length - 1);
      }
    }
    skins = [{
      name: `${asset.id}_armature`,
      joints: jointNodes,
      inverseBindMatrices: ibmAcc,
    }];
  }

  const json = {
    asset: {
      version: "2.0",
      generator: "mrs-character-pipeline",
      extras: {
        characterId: asset.id,
        species: asset.species,
        stage,
        status: asset.status,
        simFrames: sim?.frames ?? 0,
        simRan: sim?.ran ?? false,
      },
    },
    scene: 0,
    scenes: [{ nodes: includeSkin ? [0, 1] : [0] }],
    nodes,
    meshes: [{
      name: `${asset.id}_mesh`,
      primitives: [{
        attributes,
        indices: idxAcc,
        material: 0,
        mode: 4,
      }],
    }],
    materials: [{
      name: stage === "wire" ? "wire_energy" : stage === "final" ? "beauty" : "clay",
      pbrMetallicRoughness: {
        baseColorFactor: baseColor,
        metallicFactor: stage === "final" ? 0.15 : 0,
        roughnessFactor: stage === "final" ? 0.55 : 0.85,
      },
      emissiveFactor: emissive,
      doubleSided: true,
    }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: bin.byteLength }],
  };
  if (skins) json.skins = skins;

  const jsonStr = JSON.stringify(json);
  const jsonBytes = Buffer.from(jsonStr);
  const jsonPad = pad4(jsonBytes.length);
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = pad4(bin.byteLength);
  const binChunk = Buffer.concat([Buffer.from(bin), Buffer.alloc(binPad)]);

  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  const binOff = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binOff);
  out.writeUInt32LE(0x004e4942, binOff + 4);
  binChunk.copy(out, binOff + 8);
  return out;
}
