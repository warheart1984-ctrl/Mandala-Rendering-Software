import presets from './procedural-materials.json' assert {type:'json'};
export function getPresets(){ return presets.presets; }
export function findPreset(name){ return presets.presets.find(p=>p.name===name); }
