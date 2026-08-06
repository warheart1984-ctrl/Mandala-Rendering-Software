// mrs/mcp/middleware/idempotency.js

import crypto from 'crypto';

const idempotencyStore = new Map();
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24 hours

export const idempotencyMiddleware = (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  
  // Only enforce idempotency for mutating operations
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }
  
  if (!idempotencyKey) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      error: 'Bad Request', 
      message: 'Idempotency-Key header required for mutating operations' 
    }));
  }
  
  // Check if we've seen this key before
  const existing = idempotencyStore.get(idempotencyKey);
  if (existing) {
    // Return cached response
    if (Date.now() - existing.timestamp > IDEMPOTENCY_TTL) {
      idempotencyStore.delete(idempotencyKey);
    } else {
      res.writeHead(existing.statusCode, existing.headers);
      return res.end(existing.body);
    }
  }
  
  // Capture response
  const originalWriteHead = res.writeHead.bind(res);
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  
  let responseBody = '';
  let statusCode = 200;
  let headers = {};
  
  res.writeHead = (code, h) => {
    statusCode = code;
    headers = { ...h };
    return originalWriteHead(code, h);
  };
  
  res.write = (chunk) => {
    responseBody += chunk;
    return originalWrite(chunk);
  };
  
  res.end = (chunk) => {
    if (chunk) responseBody += chunk;
    
    // Store response for future requests with same key
    idempotencyStore.set(idempotencyKey, {
      statusCode,
      headers,
      body: responseBody,
      timestamp: Date.now(),
    });
    
    // Cleanup old entries periodically
    if (idempotencyStore.size > 10000) {
      const now = Date.now();
      for (const [key, value] of idempotencyStore.entries()) {
        if (now - value.timestamp > IDEMPOTENCY_TTL) {
          idempotencyStore.delete(key);
        }
      }
    }
    
    return originalEnd(chunk);
  };
  
  next();
};