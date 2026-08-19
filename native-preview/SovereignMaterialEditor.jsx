import React, { useState } from 'react';

const BSDF_TYPES = ['DIFFUSE','DISNEY','GGX','GLASS','THIN_GLASS'];
const BSDF_MAP = {DIFFUSE:4, DISNEY:0, GGX:1, GLASS:2, THIN_GLASS:3};

export default function SovereignMaterialEditor({ engine, onMaterialUpdate }) {
  const [mat, setMat] = useState({
    name: 'Polished Glass',
    baseColor: [0.9,0.95,1.0],
    metallic: 0.0,
    roughness: 0.05,
    ior: 1.5,
    emission: [0,0,0],
    emissionStrength: 0,
    clearcoat: 0.2,
    clearcoatGloss: 0.9,
    sheen: 0,
    sheenTint: 0,
    bsdfType: 'GLASS',
    flags: []
  });

  const packToGPU = () => {
    const buf = new Float32Array(16);
    buf[0]=mat.baseColor[0]; buf[1]=mat.baseColor[1]; buf[2]=mat.baseColor[2]; buf[3]=mat.metallic;
    buf[4]=mat.roughness; buf[5]=mat.ior; buf[6]=0; buf[7]=0;
    buf[8]=mat.emission[0]; buf[9]=mat.emission[1]; buf[10]=mat.emission[2]; buf[11]=mat.emissionStrength;
    buf[12]=BSDF_MAP[mat.bsdfType]; buf[13]=mat.flags.length?1:0; buf[14]=mat.clearcoat; buf[15]=mat.clearcoatGloss;
    return buf;
  };

  const handleSave = () => {
    const gpu = packToGPU();
    engine.updateStorageBuffer('MaterialsBuffer', 0, gpu);
    onMaterialUpdate?.(mat, gpu);
    const json = JSON.stringify(mat, null, 2);
    const blob = new Blob([json], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${mat.name}.json`; a.click();
  };

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, padding:12, fontFamily:'monospace'}}>
      <div><strong>Surface</strong>
        <div>Base Color <input type="color" value={'#'+((1<<24)|Math.round(mat.baseColor[0]*255)<<16|Math.round(mat.baseColor[1]*255)<<8|Math.round(mat.baseColor[2]*255)).toString(16).slice(1)} onChange={e=>{const v=parseInt(e.target.value.slice(1),16); setMat({...mat, baseColor:[(v>>16&255)/255,(v>>8&255)/255,(v&255)/255]})}}/>
        Metallic <input type="range" min="0" max="1" step="0.01" value={mat.metallic} onChange={e=>setMat({...mat, metallic:parseFloat(e.target.value)})}/>
        Roughness <input type="range" min="0" max="1" step="0.01" value={mat.roughness} onChange={e=>setMat({...mat, roughness:parseFloat(e.target.value)})}/>
        BSDF <select value={mat.bsdfType} onChange={e=>setMat({...mat, bsdfType:e.target.value})}>{BSDF_TYPES.map(t=><option key={t}>{t}</option>)}</select>
      </div>

      <div><strong>Optics</strong>
        IOR <input type="number" step="0.01" value={mat.ior} onChange={e=>setMat({...mat, ior:parseFloat(e.target.value)})} disabled={mat.bsdfType!='GLASS'&&mat.bsdfType!='THIN_GLASS'}/>
        Clearcoat <input type="range" min="0" max="1" step="0.01" value={mat.clearcoat} onChange={e=>setMat({...mat, clearcoat:parseFloat(e.target.value)})}/>
        Clearcoat Gloss <input type="range" min="0" max="1" step="0.01" value={mat.clearcoatGloss} onChange={e=>setMat({...mat, clearcoatGloss:parseFloat(e.target.value)})}/>
      </div>

      <div><strong>Emission</strong>
        Emission Strength <input type="range" min="0" max="100" step="0.1" value={mat.emissionStrength} onChange={e=>setMat({...mat, emissionStrength:parseFloat(e.target.value)})}/>
      </div>

      <div><strong>Flags</strong>
        <label><input type="checkbox" checked={mat.flags.includes('doubleSided')} onChange={e=>setMat({...mat, flags:e.target.checked?[...mat.flags,'doubleSided']:mat.flags.filter(f=>f!='doubleSided')})}/> Double Sided</label>
      </div>

      <button onClick={handleSave} style={{gridColumn:'1 / -1'}}>Export JSON & Upload to MaterialsBuffer</button>
    </div>
  );
}
