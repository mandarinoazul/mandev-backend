/**
 * WhatsApp Session Manager
 *
 * Multi-tenant session handling using Map<userId, Client>.
 * Each user gets their own whatsapp-web.js Client instance
 * with isolated auth stored in ./sessions/{userId}.
 *
 * The message_create listener is registered here (not in routes)
 * so it survives automatic session restores via LocalAuth.
 */
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const { sendToAnythingLLM } = require('./anythingLLM');

/** @type {Map<string, import('whatsapp-web.js').Client>} */
const sessions = new Map();

/** @type {Map<string, string>} Stores pending QR codes: userId -> qrBase64 */
const pendingQRs = new Map();

/** @type {Map<string, boolean>} Tracks if a session is ready */
const sessionReady = new Map();

/**
 * Attach the message_create listener to a client.
 * This intercepts ALL messages (incoming + outgoing) so we filter.
 *
 * @param {string} userId
 * @param {import('whatsapp-web.js').Client} client
 */
function attachMessageListener(userId, client) {
  // Avoid duplicate listeners if called more than once
  client.removeAllListeners('message_create');

  client.on('message_create', async (msg) => {
    // --- Filters ---
    if (msg.fromMe) return;                       // Skip our own replies
    if (msg.from.endsWith('@g.us')) return;        // Skip group messages
    if (!msg.body || !msg.body.trim()) return;     // Skip empty / media-only

    const preview = msg.body.substring(0, 80).replace(/\n/g, ' ');
    console.log(`💬 [${userId}] Incoming from ${msg.from}: "${preview}"`);

    try {
      const aiResponse = await sendToAnythingLLM(userId, msg.body);
      await msg.reply(aiResponse);
      console.log(`✅ [${userId}] Replied successfully`);
    } catch (error) {
      console.error(`❌ [${userId}] Reply error:`, error.message);
      await msg.reply('⚠️ Error procesando tu mensaje. Intenta de nuevo.');
    }
  });

  console.log(`👂 [${userId}] message_create listener attached`);
}

/**
 * Create or retrieve a WhatsApp session for a user.
 *
 * @param {string} userId
 * @returns {Promise<{ client: import('whatsapp-web.js').Client, qr: string|null, status: string }>}
 */
async function getOrCreateSession(userId) {
  // If session exists and is ready, return it
  if (sessions.has(userId) && sessionReady.get(userId)) {
    return {
      client: sessions.get(userId),
      qr: null,
      status: 'already_connected',
    };
  }

  // If session exists but not ready (still waiting for QR scan)
  if (sessions.has(userId) && pendingQRs.has(userId)) {
    return {
      client: sessions.get(userId),
      qr: pendingQRs.get(userId),
      status: 'pending_qr',
    };
  }

  // Create new session
  return new Promise((resolve, reject) => {
    const sessionsDir = path.join(__dirname, '..', 'sessions');

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: sessionsDir,
      }),
      puppeteer: {
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ],
      },
    });

    let qrResolved = false;
    const timeout = setTimeout(() => {
      if (!qrResolved) {
        reject(new Error('Timeout waiting for QR code generation'));
      }
    }, 30000);

    client.on('qr', (qr) => {
      // Convert QR string to base64 image
      const QRCode = require('qrcode');
      QRCode.toDataURL(qr, { width: 300 }, (err, url) => {
        if (err) {
          console.error(`[${userId}] QR generation error:`, err);
          return;
        }
        // Extract base64 data from data URL
        const base64 = url.replace(/^data:image\/png;base64,/, '');
        pendingQRs.set(userId, base64);

        if (!qrResolved) {
          qrResolved = true;
          clearTimeout(timeout);
          resolve({
            client,
            qr: base64,
            status: 'qr_ready',
          });
        }
      });
    });

    client.on('ready', () => {
      console.log(`✅ [${userId}] WhatsApp session ready`);
      sessionReady.set(userId, true);
      pendingQRs.delete(userId);
    });

    // ── Attach message listener BEFORE initialize ──
    // This ensures the listener is active for both fresh QR sessions
    // AND auto-restored sessions via LocalAuth.
    attachMessageListener(userId, client);

    client.on('disconnected', (reason) => {
      console.log(`❌ [${userId}] Disconnected: ${reason}`);
      sessions.delete(userId);
      sessionReady.delete(userId);
      pendingQRs.delete(userId);
    });

    client.on('auth_failure', (msg) => {
      console.error(`🔒 [${userId}] Auth failure: ${msg}`);
      sessions.delete(userId);
      sessionReady.delete(userId);
    });

    // Store the session
    sessions.set(userId, client);

    // Initialize client
    (async () => {
      try {
        await client.initialize();
      } catch (err) {
        console.error('\n======================================================');
        console.error(`🚨 [${userId}] CRITICAL PUPPETEER INITIALIZATION ERROR:`);
        console.error(err);
        console.error('======================================================\n');
        sessions.delete(userId);
        if (!qrResolved) {
          clearTimeout(timeout);
          reject(err);
        }
      }
    })();
  });
}

/**
 * Get the client for a userId (if ready).
 * @param {string} userId
 * @returns {import('whatsapp-web.js').Client|null}
 */
function getClient(userId) {
  if (sessionReady.get(userId)) {
    return sessions.get(userId) || null;
  }
  return null;
}

/**
 * Get all active session user IDs.
 * @returns {string[]}
 */
function getActiveUserIds() {
  return Array.from(sessions.keys()).filter(id => sessionReady.get(id));
}

module.exports = {
  getOrCreateSession,
  getClient,
  getActiveUserIds,
  sessions,
  sessionReady,
};
