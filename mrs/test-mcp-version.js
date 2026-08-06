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
req.write(JSON.stringify({toolId: 'mrs.version', params: {}, context: {}}));
req.end();