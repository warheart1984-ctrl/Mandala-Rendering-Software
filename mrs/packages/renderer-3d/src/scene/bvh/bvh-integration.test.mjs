import { createCubeMesh, meshToPrimitiveRefs } from '../mesh/mesh-loader.js';
import { buildBVH_SAH } from './bvh-builder-sah.js';

const mesh = createCubeMesh('cube1');
const primitives = meshToPrimitiveRefs(mesh);
const config = {maxLeafSize:2,maxDepth:16,binCount:8,heuristicVersion:'sah-v1',intentId:'bvh-integration-v1'};
const {tree,evidence}=buildBVH_SAH(primitives,config);
console.log('BVH nodes',tree.nodes.length,'root',tree.rootIndex,'evidence',evidence.provenance.intentId);
if(tree.nodes.length>0) console.log('PASS');
else throw new Error('FAIL');
