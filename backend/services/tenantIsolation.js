/**
 * Database-Level Tenant Isolation Service
 *
 * SECURITY: Provides database-level multi-tenant isolation to complement
 * the authorization-level checks in middleware.
 *
 * This service ensures tenant isolation is enforced at the database query level,
 * preventing data leakage even if authorization checks are bypassed.
 *
 * Features:
 * - Automatic workspaceId injection into queries
 * - Mongoose plugin for transparent isolation
 * - Audit logging for cross-tenant access attempts
 * - Support for both sync and async operations
 */

import mongoose from 'mongoose';
import logger from '../config/logger.js';

// Store current tenant context (using AsyncLocalStorage for request-scoped context)
import { AsyncLocalStorage } from 'async_hooks';

const tenantContext = new AsyncLocalStorage();

/**
 * Get current tenant (workspace) ID from context
 * @returns {string|null} Current workspace ID or null
 */
export function getCurrentTenantId() {
  const context = tenantContext.getStore();
  return context?.workspaceId || null;
}

/**
 * Get current user ID from context
 * @returns {string|null} Current user ID or null
 */
export function getCurrentUserId() {
  const context = tenantContext.getStore();
  return context?.userId || null;
}

/**
 * Run a function within a tenant context
 * All database operations within this context will be automatically filtered
 *
 * @param {Object} context - Tenant context
 * @param {string} context.workspaceId - Workspace/tenant ID
 * @param {string} context.userId - User ID
 * @param {Function} fn - Function to execute within context
 * @returns {Promise<*>} Result of the function
 */
export function withTenantContext(context, fn) {
  return tenantContext.run(context, fn);
}

/**
 * Express middleware to set tenant context from request
 * Should be used after authentication and workspace loading middleware
 *
 * Usage:
 * app.use(authenticate);
 * app.use(loadWorkspace);
 * app.use(setTenantContext);
 */
export function setTenantContext(req, res, next) {
  const workspaceId =
    req.workspace?._id?.toString() || req.body?.workspaceId || req.query?.workspaceId;
  const userId = req.user?.userId || req.user?.id;

  if (workspaceId || userId) {
    tenantContext.run({ workspaceId, userId }, () => {
      next();
    });
  } else {
    next();
  }
}

/**
 * Mongoose plugin for automatic tenant isolation
 * Adds workspaceId filtering to all queries automatically
 *
 * Usage:
 * schema.plugin(tenantIsolationPlugin, { tenantField: 'workspaceId' });
 */
export function tenantIsolationPlugin(schema, options = {}) {
  const { tenantField = 'workspaceId', enforceOnSave = true, auditLog = true } = options;

  // Add tenant field if not present
  if (!schema.paths[tenantField]) {
    schema.add({
      [tenantField]: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        index: true,
      },
    });
  }

  // Pre-find hooks - automatically add tenant filter
  const findHooks = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'count',
    'countDocuments',
  ];

  findHooks.forEach((hook) => {
    schema.pre(hook, function () {
      const tenantId = getCurrentTenantId();

      if (tenantId) {
        // Only add filter if not already present (allows explicit queries)
        if (!this.getQuery()[tenantField]) {
          this.where({ [tenantField]: tenantId });
        }

        if (auditLog) {
          logger.debug('Tenant isolation applied to query', {
            operation: hook,
            collection: this.model?.collection?.name,
            tenantId,
          });
        }
      } else if (this.getOptions()?.requireTenant !== false) {
        // Log warning for queries without tenant context (unless explicitly allowed)
        logger.warn('Query executed without tenant context', {
          operation: hook,
          collection: this.model?.collection?.name,
          query: JSON.stringify(this.getQuery()),
        });
      }
    });
  });

  // Pre-save hook - set tenant on new documents
  if (enforceOnSave) {
    schema.pre('save', async function () {
      if (this.isNew && !this[tenantField]) {
        const tenantId = getCurrentTenantId();
        if (tenantId) {
          this[tenantField] = tenantId;
        }
        // Don't block if no tenant context (e.g., in tests with explicit workspaceId)
      }
    });
  }

  // Pre-aggregate hook - add tenant filter to aggregation pipelines
  schema.pre('aggregate', function () {
    const tenantId = getCurrentTenantId();

    if (tenantId) {
      // Prepend $match stage for tenant isolation
      this.pipeline().unshift({
        $match: { [tenantField]: new mongoose.Types.ObjectId(tenantId) },
      });

      if (auditLog) {
        logger.debug('Tenant isolation applied to aggregation', {
          collection: this.model?.collection?.name,
          tenantId,
        });
      }
    }
  });

  // Add method to bypass tenant isolation (for admin operations)
  schema.statics.withoutTenantIsolation = function () {
    return this.setOptions({ requireTenant: false });
  };
}

/**
 * Create a tenant-isolated model wrapper
 * Provides methods that always include tenant filtering
 *
 * @param {mongoose.Model} Model - Mongoose model to wrap
 * @param {string} tenantField - Field name for tenant ID
 * @returns {Object} Wrapped model with tenant-safe methods
 */
export function createTenantSafeModel(Model, tenantField = 'workspaceId') {
  return {
    /**
     * Find documents with automatic tenant filtering
     */
    async find(query = {}, projection = null, options = {}) {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        throw new Error('Tenant context required for database query');
      }

      return Model.find({ ...query, [tenantField]: tenantId }, projection, options);
    },

    /**
     * Find one document with automatic tenant filtering
     */
    async findOne(query = {}, projection = null, options = {}) {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        throw new Error('Tenant context required for database query');
      }

      return Model.findOne({ ...query, [tenantField]: tenantId }, projection, options);
    },

    /**
     * Find by ID with tenant verification
     */
    async findById(id, projection = null, options = {}) {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        throw new Error('Tenant context required for database query');
      }

      const doc = await Model.findById(id, projection, options);

      // Verify document belongs to current tenant
      if (doc && doc[tenantField]?.toString() !== tenantId) {
        logger.warn('Cross-tenant access attempt detected', {
          model: Model.modelName,
          documentId: id,
          documentTenant: doc[tenantField]?.toString(),
          requestedTenant: tenantId,
          userId: getCurrentUserId(),
        });
        return null; // Return null as if document doesn't exist
      }

      return doc;
    },

    /**
     * Create document with automatic tenant assignment
     */
    async create(data) {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        throw new Error('Tenant context required for database write');
      }

      return Model.create({ ...data, [tenantField]: tenantId });
    },

    /**
     * Update with tenant verification
     */
    async updateOne(query, update, options = {}) {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        throw new Error('Tenant context required for database update');
      }

      return Model.updateOne({ ...query, [tenantField]: tenantId }, update, options);
    },

    /**
     * Update many with tenant filtering
     */
    async updateMany(query, update, options = {}) {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        throw new Error('Tenant context required for database update');
      }

      return Model.updateMany({ ...query, [tenantField]: tenantId }, update, options);
    },

    /**
     * Delete with tenant verification
     */
    async deleteOne(query) {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        throw new Error('Tenant context required for database delete');
      }

      return Model.deleteOne({ ...query, [tenantField]: tenantId });
    },

    /**
     * Delete many with tenant filtering
     */
    async deleteMany(query) {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        throw new Error('Tenant context required for database delete');
      }

      return Model.deleteMany({ ...query, [tenantField]: tenantId });
    },

    /**
     * Count documents with tenant filtering
     */
    async countDocuments(query = {}) {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        throw new Error('Tenant context required for database count');
      }

      return Model.countDocuments({ ...query, [tenantField]: tenantId });
    },

    /**
     * Aggregate with tenant filtering
     */
    async aggregate(pipeline) {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        throw new Error('Tenant context required for aggregation');
      }

      // Prepend tenant filter to pipeline
      const tenantPipeline = [
        { $match: { [tenantField]: new mongoose.Types.ObjectId(tenantId) } },
        ...pipeline,
      ];

      return Model.aggregate(tenantPipeline);
    },

    /**
     * Access raw model (for admin/system operations)
     * WARNING: Bypasses tenant isolation
     */
    get raw() {
      return Model;
    },
  };
}

/**
 * Validate that a document belongs to the current tenant
 * Use for explicit checks in critical operations
 *
 * @param {Object} document - Document to validate
 * @param {string} tenantField - Field name for tenant ID
 * @returns {boolean} True if document belongs to current tenant
 */
export function validateTenantAccess(document, tenantField = 'workspaceId') {
  const tenantId = getCurrentTenantId();

  if (!tenantId) {
    logger.warn('Tenant access validation without tenant context');
    return false;
  }

  const documentTenant = document?.[tenantField]?.toString();

  if (!documentTenant) {
    logger.warn('Document missing tenant field', {
      tenantField,
      documentId: document?._id?.toString(),
    });
    return false;
  }

  const hasAccess = documentTenant === tenantId;

  if (!hasAccess) {
    logger.warn('Tenant access validation failed', {
      documentTenant,
      requestedTenant: tenantId,
      documentId: document?._id?.toString(),
      userId: getCurrentUserId(),
    });
  }

  return hasAccess;
}

/**
 * Audit log for tenant isolation events
 */
export function logTenantEvent(event, details) {
  logger.info(`[TENANT_AUDIT] ${event}`, {
    ...details,
    tenantId: getCurrentTenantId(),
    userId: getCurrentUserId(),
    timestamp: new Date().toISOString(),
  });
}

export default {
  getCurrentTenantId,
  getCurrentUserId,
  withTenantContext,
  setTenantContext,
  tenantIsolationPlugin,
  createTenantSafeModel,
  validateTenantAccess,
  logTenantEvent,
};
