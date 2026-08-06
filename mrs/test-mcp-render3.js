import http from 'http';
const req = http.request({ 
  hostname: '127.0.0.1', 
  port: 8080, 
  method: 'POST', 
  path: '/', 
  headers: {'Content-Type': 'application/json'} 
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Response:', data));
});
req.on('error', e => console.error('Error:', e.message, e.code));
req.write(JSON.stringify({
  toolId: 'mrs.render.rt4d', 
  params: {
    scene: {
      camera: { position4D: [0,0,0,0], target4D: [0,0,1,0], up4D: [0,1,0,0], fov: 60 },
      meshes: [{ id: 'test', type: 'triangleMesh4D', vertices4D: [[0,0,0,0],[1,0,0,0],[0,1,0,0]], indices: [[0,1,2]], materialId: 'mat1' }],
      metric: { type: 'euclidean' }
    },
    render: { resolution: { width: 800, height: 600 }, samplesPerPixel: 16, maxDepth: 4, seed: 42 },
    identity: { requestId: 'test-1', actorId: '4dce.director', latticeNodeId: 'ln-001' }
  }, 
  context: {
    actorIdentity: { id: '4dce.director', type: 'director' },
    evidence: { id: 'ev-test' }
  }
}));
req.end();