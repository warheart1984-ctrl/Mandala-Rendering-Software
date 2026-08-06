import http from 'http';
const req = http.request({ 
  hostname: 'localhost', 
  port: 8080, 
  method: 'GET', 
  path: '/' 
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Response:', data));
});
req.on('error', e => console.error('Error:', e.message, e.code, e));
req.end();