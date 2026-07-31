const fs = require('fs');

function fixGLB(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 12;
  const chunkLen = buf.readUInt32LE(offset); offset += 4;
  const chunkType = buf.readUInt32LE(offset); offset += 4;
  const jsonStr = buf.toString('utf-8', offset, offset + chunkLen);
  const json = JSON.parse(jsonStr);

  let changed = false;

  // Add empty buffers array if missing
  if (!json.buffers) {
    json.buffers = [{ byteLength: 0 }];
    changed = true;
  }

  // Add buffer: 0 to bufferViews if missing
  if (json.bufferViews) {
    for (const bv of json.bufferViews) {
      if (bv.buffer === undefined) {
        bv.buffer = 0;
        changed = true;
      }
    }
  }

  // Fix animations: add channels/samplers if missing
  if (json.animations) {
    for (const anim of json.animations) {
      if (!anim.channels) { anim.channels = []; changed = true; }
      if (!anim.samplers) { anim.samplers = []; changed = true; }
    }
  }

  // Fix skins: add joints if missing
  if (json.skins) {
    for (const skin of json.skins) {
      if (!skin.joints) { skin.joints = []; changed = true; }
    }
  }

  // Fix morph targets: remove extras from inside targets
  if (json.meshes) {
    for (const mesh of json.meshes) {
      if (mesh.primitives) {
        for (const prim of mesh.primitives) {
          if (prim.targets) {
            for (let i = 0; i < prim.targets.length; i++) {
              const t = prim.targets[i];
              if (t.extras) {
                if (!prim.extras) prim.extras = {};
                if (!prim.extras.targets) prim.extras.targets = [];
                while (prim.extras.targets.length <= i) prim.extras.targets.push({});
                if (t.extras.humanRigMorphId) {
                  prim.extras.targets[i].humanRigMorphId = t.extras.humanRigMorphId;
                }
                delete t.extras;
                changed = true;
              }
            }
          }
        }
      }
    }
  }

  if (!changed) {
    console.log(filePath + ': compliant');
    return;
  }

  const newJson = JSON.stringify(json);
  const pad = (4 - (newJson.length % 4)) % 4;
  const paddedJson = newJson + ' '.repeat(pad);
  const newJsonBuf = Buffer.from(paddedJson, 'utf-8');
  const binDataStart = offset + chunkLen + 8;
  const binLen = buf.length - binDataStart;
  const totalLen = 12 + 8 + newJsonBuf.length + 8 + binLen;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(newJsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4);
  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binLen, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4);
  const binData = buf.slice(binDataStart, buf.length);
  const out = Buffer.concat([header, jsonChunkHeader, newJsonBuf, binChunkHeader, binData]);
  fs.writeFileSync(filePath, out);
  console.log(filePath + ': fixed (' + out.length + ' bytes)');
}

for (const p of process.argv.slice(2)) {
  fixGLB(p);
}
