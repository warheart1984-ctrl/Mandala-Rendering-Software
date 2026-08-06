// mrs/mcp/services/AuthService.js

import crypto from 'crypto';

export class AuthService {
  constructor() {
    // In-memory API key store (replace with database in production)
    // Format: { apiKeyHash: { userId, tenantId, plan, scopes, createdAt, lastUsed } }
    this.apiKeys = new Map();
    
    // Initialize with a default test key
    this.initializeDefaultKeys();
  }

  initializeDefaultKeys() {
    // Default director key for testing
    const directorKey = 'mrs_director_test_key_12345';
    const hash = this.hashKey(directorKey);
    this.apiKeys.set(hash, {
      userId: 'director-001',
      tenantId: 'mandala-tenant',
      plan: 'enterprise',
      scopes: ['render', 'dep', 'sme', 'admin', 'billing'],
      createdAt: new Date().toISOString(),
      lastUsed: null,
    });
    
    // Default user key
    const userKey = 'mrs_user_test_key_67890';
    const userHash = this.hashKey(userKey);
    this.apiKeys.set(userHash, {
      userId: 'user-001',
      tenantId: 'mandala-tenant',
      plan: 'pro',
      scopes: ['render', 'scene'],
      createdAt: new Date().toISOString(),
      lastUsed: null,
    });
  }

  hashKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  validateApiKey(apiKey) {
    if (!apiKey) return null;
    const hash = this.hashKey(apiKey);
    const keyData = this.apiKeys.get(hash);
    if (!keyData) return null;
    
    // Update last used
    keyData.lastUsed = new Date().toISOString();
    return keyData;
  }

  // Extract API key from request headers
  extractApiKey(req) {
    // Check Authorization header: Bearer <key>
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    // Check X-API-Key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader) {
      return apiKeyHeader;
    }
    
    return null;
  }

  // Middleware: authenticate request
  authenticate() {
    return async (req, res, next) => {
      const apiKey = this.extractApiKey(req);
      const keyData = this.validateApiKey(apiKey);
      
      if (!keyData) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          error: 'Unauthorized', 
          message: 'Invalid or missing API key' 
        }));
      }
      
      // Attach identity to request
      req.auth = {
        userId: keyData.userId,
        tenantId: keyData.tenantId,
        plan: keyData.plan,
        scopes: keyData.scopes,
      };
      
      next();
    };
  }

  // Middleware: require specific scope
  requireScope(scope) {
    return (req, res, next) => {
      if (!req.auth || !req.auth.scopes.includes(scope)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          error: 'Forbidden', 
          message: `Required scope: ${scope}` 
        }));
      }
      next();
    };
  }

  // Generate new API key
  generateApiKey(userId, tenantId, plan, scopes) {
    const apiKey = `mrs_${crypto.randomBytes(16).toString('hex')}`;
    const hash = this.hashKey(apiKey);
    this.apiKeys.set(hash, {
      userId,
      tenantId,
      plan,
      scopes,
      createdAt: new Date().toISOString(),
      lastUsed: null,
    });
    return apiKey;
  }

  // Revoke API key
  revokeApiKey(apiKey) {
    const hash = this.hashKey(apiKey);
    return this.apiKeys.delete(hash);
  }

  // List keys for tenant (admin only)
  listKeysForTenant(tenantId) {
    const keys = [];
    for (const [hash, data] of this.apiKeys.entries()) {
      if (data.tenantId === tenantId) {
        keys.push({ hash: hash.substring(0, 8) + '...', ...data });
      }
    }
    return keys;
  }
}

// Singleton instance
export const authService = new AuthService();