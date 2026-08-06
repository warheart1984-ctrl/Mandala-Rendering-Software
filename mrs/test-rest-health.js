import http from 'http';
const req = http.request({ hostname: 'localhost', port: 8081, method: 'GET', path: '/health' }, (res) => {
  let data = ''; res.on('data', d => data += d); res.on('end', () => console.log('Health:', data));
});
req.on('error', e => console.error('Error:', e.message, e.code)); req.end();