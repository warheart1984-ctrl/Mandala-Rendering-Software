import {buildBVH, intersectBVH} from './bvh-build.js';
const root = buildBVH([]);
const hit = intersectBVH(root, {origin:{x:0,y:0,z:0}, dir:{x:0,y:0,z:1}});
console.log('BVH test', hit.hit===false ? 'PASS' : 'FAIL');
