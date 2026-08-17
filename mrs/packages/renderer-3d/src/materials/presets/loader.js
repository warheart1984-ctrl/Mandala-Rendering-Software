import {presets, provenance} from './procedural-materials.js';
export function getPresets(){ return presets; }
export function findPreset(name){ return presets.find(p=>p.name===name); }
export {provenance};
