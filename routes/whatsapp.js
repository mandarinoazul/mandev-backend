/**
 * WhatsApp API Routes
 *
 * POST /api/whatsapp/generate-qr  — Generate QR for a userId
 * GET  /api/whatsapp/status/:userId — Check session status
 * GET  /api/whatsapp/sessions — List all active sessions
 *
 * NOTE: The message listener (message_create) now lives in
 * sessionManager.js so it auto-attaches on session creation
 * and survives auto-reconnects via LocalAuth.
 */
const express = require('express');
const router = express.Router();
const { getOrCreateSession, getActiveUserIds, getClient } = require('../services/sessionManager');

/**
 * POST /api/whatsapp/generate-qr
 *
 * Body: { userId: string }
 * Response: { qr: string (base64), status: string } or { status: 'already_connected' }
 */
router.post('/generate-qr', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required' });
    }

    const sanitizedId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (sanitizedId.length < 3) {
      return res.status(400).json({
        error: 'userId must be at least 3 alphanumeric characters',
      });
    }

    console.log(`📱 [${sanitizedId}] Requesting QR generation...`);

    const result = await getOrCreateSession(sanitizedId);

    res.json({
      qr: result.qr,
      status: result.status,
    });
  } catch (error) {
    console.error('Generate QR error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/whatsapp/status/:userId
 *
 * Check if a user's WhatsApp session is active.
 */
router.get('/status/:userId', (req, res) => {
  const { userId } = req.params;
  const client = getClient(userId);

  res.json({
    userId,
    connected: !!client,
    status: client ? 'connected' : 'disconnected',
  });
});

/**
 * GET /api/whatsapp/sessions
 *
 * List all active WhatsApp sessions.
 */
router.get('/sessions', (req, res) => {
  const activeIds = getActiveUserIds();
  res.json({
    count: activeIds.length,
    sessions: activeIds,
  });
});

module.exports = router;
