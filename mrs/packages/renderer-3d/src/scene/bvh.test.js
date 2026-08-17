import {buildBVH, intersectBVH} from './bvh-build.js';
// Simple triangle at z=1
const tri = [
  [[0,0,1],[1,0,1],[0,1,1]]
];
const root = buildBVH(tri);
const hit = intersectBVH(root, {origin:[0,0,0], dir:[0,0,1]});
console.log('BVH intersect hit?', hit.hit);
console.log('BVH test', hit.hit && Math.abs(hit.t-1)<1e-6 ? 'PASS' : 'FAIL');

const miss = intersectBVH(root, {origin:[0,0,0], dir:[0,1,0]});
console.log('BVH miss test', miss.hit===false ? 'PASS' : 'FAIL');
