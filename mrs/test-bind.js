import http from 'http';
const s = http.createServer((req, res) => { res.end('OK'); });
s.listen(8080, '0.0.0.0', () => console.log('listening on 0.0.0.0:8080'));