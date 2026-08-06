// mrs/mcp/middleware/rateLimit.js

const rateLimitStore = new Map();

export const rateLimitMiddleware = (options = {}) => {
  const {
    windowMs = 60 * 1000, // 1 minute
    maxRequests = 100,
    keyGenerator = (req) => req.auth?.tenantId || req.ip || 'anonymous',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;
  
  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    
    let record = rateLimitStore.get(key);
    if (!record) {
      record = { requests: [], blocked: false };
      rateLimitStore.set(key, record);
    }
    
    // Remove old requests outside the window
    record.requests = record.requests.filter(timestamp => timestamp > windowStart);
    
    // Check if blocked
    if (record.blocked) {
      if (now - (record.blockedAt || 0) > windowMs * 2) {
        record.blocked = false;
      } else {
        res.writeHead(429, { 
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((windowMs * 2) / 1000),
        });
        return res.end(JSON.stringify({ 
          error: 'Too Many Requests', 
          message: 'Rate limit exceeded. Please try again later.' 
        }));
      }
    }
    
    // Check limit
    if (record.requests.length >= maxRequests) {
      record.blocked = true;
      record.blockedAt = now;
      
      res.writeHead(429, { 
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil(windowMs / 1000),
      });
      return res.end(JSON.stringify({ 
        error: 'Too Many Requests', 
        message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs}ms.` 
      }));
    }
    
    // Record this request
    record.requests.push(now);
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.requests.length));
    res.setHeader('X-RateLimit-Reset', Math.ceil((windowStart + windowMs) / 1000));
    
    next();
  };
};

// Plan-based rate limiting
export const planRateLimitMiddleware = (req, res, next) => {
  const planLimits = {
    free: { maxRequests: 10, windowMs: 60 * 1000 },
    pro: { maxRequests: 100, windowMs: 60 * 1000 },
    enterprise: { maxRequests: 1000, windowMs: 60 * 1000 },
  };
  
  const plan = req.auth?.plan || 'free';
  const limits = planLimits[plan] || planLimits.free;
  
  const middleware = rateLimitMiddleware({
    ...limits,
    keyGenerator: (req) => `${req.auth?.tenantId}:${req.auth?.userId}`,
  });
  
  return middleware(req, res, next);
};