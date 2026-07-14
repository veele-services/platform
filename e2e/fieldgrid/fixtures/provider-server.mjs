import http from 'node:http';

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, provider: 'fieldgrid-e2e-mocks' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, mocked: true }));
});

server.listen(Number(process.env.PORT || 9324), '127.0.0.1', () => {
  console.log(`FIELDGRID_E2E_PROVIDER_MOCKS=http://127.0.0.1:${server.address().port}`);
});
