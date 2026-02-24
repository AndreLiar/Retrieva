import { Router } from 'express';

export function createNotifyRouter(notificationService) {
  const router = Router();

  router.post('/deliver', async (req, res) => {
    try { res.json(await notificationService.createAndDeliver(req.body)); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/workspace-invitation', async (req, res) => {
    try { res.json(await notificationService.notifyWorkspaceInvitation(req.body)); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/permission-change', async (req, res) => {
    try { res.json(await notificationService.notifyPermissionChange(req.body)); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/workspace-removal', async (req, res) => {
    try { res.json(await notificationService.notifyWorkspaceRemoval(req.body)); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/sync-completed', async (req, res) => {
    try { res.json(await notificationService.notifySyncCompleted(req.body)); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/sync-failed', async (req, res) => {
    try { res.json(await notificationService.notifySyncFailed(req.body)); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/workspace-members', async (req, res) => {
    try { res.json(await notificationService.notifyWorkspaceMembers(req.body)); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  return router;
}
