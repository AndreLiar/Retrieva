import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import {
  analyzeOrganization,
  listCriticalFunctions,
  upsertCriticalFunction,
  deleteCriticalFunction,
  listDependencies,
  setDependencyConfirmed,
  extractSubProvidersForWorkspace,
} from '../services/concentrationService.js';

// Concentration is ORG-scoped (spans all the firm's vendors). Every handler keys off
// req.user.organizationId — never a caller-supplied org id — so tenants can't cross.
const orgId = (req) => req.user?.organizationId;
const requireOrg = (req, res) => {
  const id = orgId(req);
  if (!id) sendError(res, 400, 'No organization context for this user');
  return id;
};

export const getConcentration = catchAsync(async (req, res) => {
  const id = requireOrg(req, res);
  if (!id) return;
  const result = await analyzeOrganization(id);
  sendSuccess(res, 200, 'Concentration analysis', result);
});

export const getCriticalFunctions = catchAsync(async (req, res) => {
  const id = requireOrg(req, res);
  if (!id) return;
  sendSuccess(res, 200, 'Critical functions', { functions: await listCriticalFunctions(id) });
});

export const createOrUpdateCriticalFunction = catchAsync(async (req, res) => {
  const id = requireOrg(req, res);
  if (!id) return;
  const fn = await upsertCriticalFunction(id, {
    id: req.body.id,
    name: req.body.name,
    criticality: req.body.criticality,
    description: req.body.description,
    dependsOn: req.body.dependsOn,
    userId: req.user.userId,
  });
  sendSuccess(res, req.body.id ? 200 : 201, 'Critical function saved', { function: fn });
});

export const removeCriticalFunction = catchAsync(async (req, res) => {
  const id = requireOrg(req, res);
  if (!id) return;
  const removed = await deleteCriticalFunction(id, req.params.id);
  if (!removed) return sendError(res, 404, 'Critical function not found');
  sendSuccess(res, 200, 'Critical function deleted', { id: req.params.id });
});

export const getDependencies = catchAsync(async (req, res) => {
  const id = requireOrg(req, res);
  if (!id) return;
  sendSuccess(res, 200, 'Provider dependencies', { dependencies: await listDependencies(id) });
});

export const confirmDependency = catchAsync(async (req, res) => {
  const id = requireOrg(req, res);
  if (!id) return;
  const updated = await setDependencyConfirmed(id, req.params.id, req.body.confirmed !== false);
  if (!updated) return sendError(res, 404, 'Dependency not found');
  sendSuccess(res, 200, 'Dependency updated', { dependency: updated });
});

export const extractSubProviders = catchAsync(async (req, res) => {
  const id = requireOrg(req, res);
  if (!id) return;
  const result = await extractSubProvidersForWorkspace(id, req.params.workspaceId);
  sendSuccess(res, 200, 'Sub-provider extraction complete (edges are unconfirmed — review before use)', result);
});
