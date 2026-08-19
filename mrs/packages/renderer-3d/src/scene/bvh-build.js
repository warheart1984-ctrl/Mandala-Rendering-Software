// BVH build/traversal real implementation with constitutional provenance
export const provenance = {intentId: "bvh-build-v2-real", worldId: null, timelineId: null, timeSeconds: 0};

class AABB {
  constructor(min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity]){
    this.min=min; this.max=max;
  }
  expand(p){ for(let i=0;i<3;i++){ this.min[i]=Math.min(this.min[i],p[i]); this.max[i]=Math.max(this.max[i],p[i]); } }
  static union(a,b){
    const min=[Math.min(a.min[0],b.min[0]), Math.min(a.min[1],b.min[1]), Math.min(a.min[2],b.min[2])];
    const max=[Math.max(a.max[0],b.max[0]), Math.max(a.max[1],b.max[1]), Math.max(a.max[2],b.max[2])];
    return new AABB(min,max);
  }
}
function rayAABB(ray, box){
  let tmin=-Infinity, tmax=Infinity;
  for(let i=0;i<3;i++){
    const invD=1.0/(ray.dir[i]||1e-9);
    let t0=(box.min[i]-ray.origin[i])*invD;
    let t1=(box.max[i]-ray.origin[i])*invD;
    if(invD<0){ const tmp=t0; t0=t1; t1=tmp; }
    tmin=Math.max(tmin,t0);
    tmax=Math.min(tmax,t1);
    if(tmax<tmin) return false;
  }
  return tmax>=0;
}
function rayTriangle(ray, tri){
  const v0=tri[0], v1=tri[1], v2=tri[2];
  const e1=[v1[0]-v0[0],v1[1]-v0[1],v1[2]-v0[2]];
  const e2=[v2[0]-v0[0],v2[1]-v0[1],v2[2]-v0[2]];
  const p=[ray.dir[1]*e2[2]-ray.dir[2]*e2[1], ray.dir[2]*e2[0]-ray.dir[0]*e2[2], ray.dir[0]*e2[1]-ray.dir[1]*e2[0]];
  const det=e1[0]*p[0]+e1[1]*p[1]+e1[2]*p[2];
  if(Math.abs(det)<1e-9) return null;
  const invDet=1.0/det;
  const tvec=[ray.origin[0]-v0[0], ray.origin[1]-v0[1], ray.origin[2]-v0[2]];
  const u=(tvec[0]*p[0]+tvec[1]*p[1]+tvec[2]*p[2])*invDet;
  if(u<0||u>1) return null;
  const q=[tvec[1]*e1[2]-tvec[2]*e1[1], tvec[2]*e1[0]-tvec[0]*e1[2], tvec[0]*e1[1]-tvec[1]*e1[0]];
  const v=(ray.dir[0]*q[0]+ray.dir[1]*q[1]+ray.dir[2]*q[2])*invDet;
  if(v<0||u+v>1) return null;
  const t=(e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2])*invDet;
  if(t<0) return null;
  return {t,u,v};
}
export class BVHNode {
  constructor(bounds=null, left=null, right=null, prims=[]){
    this.bounds=bounds; this.left=left; this.right=right; this.prims=prims;
  }
}
function centroid(tri){ const c=[0,0,0]; for(const v of tri){c[0]+=v[0];c[1]+=v[1];c[2]+=v[2];} return [c[0]/3,c[1]/3,c[2]/3]; }
function buildNode(tris){
  if(tris.length===0) return null;
  const box=new AABB();
  for(const tri of tris){ for(const v of tri){ box.expand(v); } }
  if(tris.length<=2){
    return new BVHNode(box,null,null,tris);
  }
  const axis=0;
  tris.sort((a,b)=>centroid(a)[axis]-centroid(b)[axis]);
  const mid=Math.floor(tris.length/2);
  const left=buildNode(tris.slice(0,mid));
  const right=buildNode(tris.slice(mid));
  const bounds=AABB.union(left.bounds,right.bounds);
  return new BVHNode(bounds,left,right,[]);
}
export function buildBVH(triangles){
  return buildNode(triangles||[]);
}
function intersectNode(node, ray, best){
  if(!node || !rayAABB(ray, node.bounds)) return best;
  if(node.prims.length>0){
    for(const tri of node.prims){
      const hit=rayTriangle(ray,tri);
      if(hit && hit.t<best.t){ best={t:hit.t,tri}; }
    }
    return best;
  }
  best=intersectNode(node.left,ray,best);
  best=intersectNode(node.right,ray,best);
  return best;
}
export function intersectBVH(root, ray){
  if(!root) return {hit:false};
  const best=intersectNode(root, ray, {t:Infinity});
  if(best.t<Infinity){ return {hit:true, t:best.t, tri:best.tri}; }
  return {hit:false};
}
