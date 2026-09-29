import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

// In-memory test mailbox. No outbound email, credentials, message bodies or
// activation links are written to disk or console.
const messages = [];
let failNext = false;
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:59329");
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  if (req.method === "GET" && url.pathname === "/health") return res.end('{}');
  if (req.method === "GET" && url.pathname === "/messages") {
    const recipient = url.searchParams.get("recipient");
    return res.end(JSON.stringify(messages.filter((mail) => mail.personalizations[0].to[0].email === recipient)));
  }
  if (req.method === "POST" && url.pathname === "/fail-next") { failNext = true; return res.end('{}'); }
  if (req.method === "POST" && url.pathname === "/v3/mail/send") {
    if (req.headers.authorization !== "Bearer SG.fieldgrid-local-e2e-placeholder") { res.statusCode = 403; return res.end('{}'); }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const mail = JSON.parse(Buffer.concat(chunks).toString());
    if (failNext) { failNext = false; res.statusCode = 503; return res.end('{"errors":[{"message":"Test delivery failure"}]}'); }
    messages.push(mail);
    res.statusCode = 202;
    res.setHeader("x-message-id", randomUUID());
    return res.end('{}');
  }
  res.statusCode = 404; res.end('{}');
}).listen(59329, "127.0.0.1");
