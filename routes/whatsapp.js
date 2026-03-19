/**
 * WhatsApp API Routes
 *
 * POST /api/whatsapp/generate-qr  — Generate QR for a userId
 * GET  /api/whatsapp/status/:userId — Check session status
 * GET  /api/whatsapp/sessions — List all active sessions
 */
const express = require('express');
const router = express.Router();
const { getOrCreateSession, getActiveUserIds, getClient } = require('../services/sessionManager');
const { sendToAnythingLLM } = require('../services/anythingLLM');

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

    // Set up message listener for this user's session
    if (result.status === 'qr_ready') {
      setupMessageListener(sanitizedId, result.client);
    }

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

/**
 * Set up the incoming message listener for a WhatsApp session.
 * When a message comes in, it's forwarded to AnythingLLM
 * with the user's isolated thread.
 *
 * @param {string} userId
 * @param {import('whatsapp-web.js').Client} client
 */
function setupMessageListener(userId, client) {
  // Remove any existing listener to avoid duplicates
  client.removeAllListeners('message');

  client.on('message', async (msg) => {
    // Skip group messages, only process direct messages
    if (msg.isGroupMsg) return;

    // Skip media-only messages
    if (!msg.body || msg.body.trim() === '') return;

    console.log(`💬 [${userId}] Incoming: "${msg.body.substring(0, 50)}..."`);

    try {
      // Forward to AnythingLLM with user context isolation
      const aiResponse = await sendToAnythingLLM(userId, msg.body);

      // Reply via WhatsApp
      await msg.reply(aiResponse);
      console.log(`✅ [${userId}] Replied successfully`);
    } catch (error) {
      console.error(`❌ [${userId}] Reply error:`, error.message);
      await msg.reply('⚠️ Error procesando tu mensaje. Intenta de nuevo.');
    }
  });

  console.log(`👂 [${userId}] Message listener active`);
}

module.exports = router;
