/**
 * WhatsApp Session Manager
 *
 * Multi-tenant session handling using Map<userId, Client>.
 * Each user gets their own whatsapp-web.js Client instance
 * with isolated auth stored in ./sessions/{userId}.
 */
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

/** @type {Map<string, import('whatsapp-web.js').Client>} */
const sessions = new Map();

/** @type {Map<string, string>} Stores pending QR codes: userId -> qrBase64 */
const pendingQRs = new Map();

/** @type {Map<string, boolean>} Tracks if a session is ready */
const sessionReady = new Map();

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
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
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
    client.initialize().catch((err) => {
      console.error(`[${userId}] Init error:`, err);
      sessions.delete(userId);
      if (!qrResolved) {
        clearTimeout(timeout);
        reject(err);
      }
    });
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
 * Find which userId owns a specific WhatsApp message recipient.
 * This iterates all sessions to find the matching one.
 *
 * @param {string} fromNumber - The WhatsApp number (e.g., '1234567890@c.us')
 * @returns {string|null} The userId that owns this session
 */
function findUserIdByMessage(fromNumber) {
  // In multi-tenant mode, each client handles its own messages
  // The mapping is handled in the message listener setup
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
  findUserIdByMessage,
  getActiveUserIds,
  sessions,
  sessionReady,
};
