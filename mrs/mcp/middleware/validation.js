// mrs/mcp/middleware/validation.js

export const validateBody = (schema) => {
  return (req, res, next) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      console.log('[VALIDATION] Raw body:', body.substring(0, 500));
      try {
        const data = body ? JSON.parse(body) : {};
        console.log('[VALIDATION] Parsed data keys:', Object.keys(data));
        const result = schema.safeParse(data);
        if (!result.success) {
          console.log('[VALIDATION] Schema errors:', result.error.flatten().fieldErrors);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ 
            error: 'ValidationError', 
            message: 'Invalid request body',
            details: result.error.flatten().fieldErrors 
          }));
        }
        req.validatedBody = result.data;
        next();
      } catch (err) {
        console.log('[VALIDATION] JSON parse error:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          error: 'ValidationError', 
          message: 'Invalid JSON body' 
        }));
      }
    });
  };
};

export const validateQuery = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        error: 'ValidationError', 
        message: 'Invalid query parameters',
        details: result.error.flatten().fieldErrors 
      }));
    }
    req.validatedQuery = result.data;
    next();
  };
};

export const validateParams = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        error: 'ValidationError', 
        message: 'Invalid path parameters',
        details: result.error.flatten().fieldErrors 
      }));
    }
    req.validatedParams = result.data;
    next();
  };
};