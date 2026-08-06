// mrs/mcp/middleware/auth.js

import { authService } from '../services/AuthService.js';

export const authMiddleware = (req, res, next) => {
  return authService.authenticate()(req, res, next);
};

export const requireScope = (scope) => (req, res, next) => {
  return authService.requireScope(scope)(req, res, next);
};

export const optionalAuth = async (req, res, next) => {
  const apiKey = authService.extractApiKey(req);
  if (apiKey) {
    const keyData = authService.validateApiKey(apiKey);
    if (keyData) {
      req.auth = {
        userId: keyData.userId,
        tenantId: keyData.tenantId,
        plan: keyData.plan,
        scopes: keyData.scopes,
      };
    }
  }
  next();
};