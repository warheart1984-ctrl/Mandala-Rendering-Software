import http from 'http';
const s = http.createServer((req, res) => { res.end('OK'); });
s.listen(8080, '0.0.0.0', () => console.log('Server running on 8080'));
console.log('Server created, waiting for connections...');