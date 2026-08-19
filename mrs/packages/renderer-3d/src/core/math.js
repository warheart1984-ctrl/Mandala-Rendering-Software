// Core 3D math utilities
export function vec3(x=0,y=0,z=0){return {x,y,z};}
export function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
export const PI = Math.PI;
// Evidence fields preserved for governance
export const INTENT_META = {intentId:null, worldId:null, timelineId:null, timeSeconds:0, parameters:{}};
