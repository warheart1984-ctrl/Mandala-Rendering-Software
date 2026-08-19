// Procedural noise implementations - stubs with constitutional provenance
export const provenance = {intentId: "noise-procedural-v1", worldId: null, timelineId: null, timeSeconds: 0};

function hash(x){ return Math.sin(x*12.9898)*43758.5453; }
function noise1D(x){ return (hash(Math.floor(x)) + hash(Math.floor(x)+1))*0.5; }

export function marbleNoise(p, frequency=8, contrast=0.6){
  const t = p.y * frequency + noise1D(p.x)*0.5;
  return Math.sin(t) * contrast;
}
export function woodRings(p, ringsPerMeter=12){
  const r = Math.sqrt(p.x*p.x + p.z*p.z);
  const angle = Math.atan2(p.z, p.x);
  return Math.sin(ringsPerMeter * r + angle);
}
export function graniteSpeckle(p, scale=0.02){
  const n = noise1D(p.x*scale) * noise1D(p.y*scale) * noise1D(p.z*scale);
  return n;
}
