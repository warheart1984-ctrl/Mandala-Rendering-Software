// mrs/mcp/middleware/correlation.js

import crypto from 'crypto';

export const correlationMiddleware = (req, res, next) => {
  // Get or generate correlation ID
  const correlationId = req.headers['x-correlation-id'] || 
                        req.headers['x-request-id'] || 
                        crypto.randomUUID();
  
  // Attach to request and response
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  
  // Add json helper to response
  res.json = (data) => {
    if (data && typeof data === 'object') {
      data.correlationId = correlationId;
    }
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(data));
  };
  
  next();
};

// Generate correlation ID for internal use
export const generateCorrelationId = (prefix = 'req') => {
  return `${prefix}-${crypto.randomUUID()}`;
};