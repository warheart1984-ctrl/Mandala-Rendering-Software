import http from 'http';
const req = http.request({ 
  hostname: 'localhost', 
  port: 8080, 
  method: 'POST', 
  path: '/', 
  headers: {'Content-Type': 'application/json'} 
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Response:', data));
});
req.on('error', e => console.error('Error:', e.message));
req.write(JSON.stringify({toolId: 'mrs.health', params: {}, context: {}}));
req.end();