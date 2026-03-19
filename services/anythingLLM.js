/**
 * AnythingLLM Service
 *
 * Forwards WhatsApp messages to the remote AnythingLLM server
 * with per-user thread isolation.
 */
const axios = require('axios');

const BASE_URL = 'https://agente.mandev.site/api/v1';
const API_KEY = '4E715PD-Q3TMDXR-J0BVF2Q-Z29E04Y';
const WORKSPACE_SLUG = 'agente-soporte';

/** @type {Map<string, string>} userId -> threadSlug for conversation isolation */
const userThreads = new Map();

/**
 * Send a message to AnythingLLM with user-specific thread isolation.
 *
 * @param {string} userId - The user identifier
 * @param {string} message - The message text
 * @returns {Promise<string>} The AI response text
 */
async function sendToAnythingLLM(userId, message) {
  try {
    let threadSlug = userThreads.get(userId);

    // Create a new thread for the user if one doesn't exist
    if (!threadSlug) {
      const threadRes = await axios.post(
        `${BASE_URL}/workspace/${WORKSPACE_SLUG}/thread/new`,
        { name: `whatsapp-${userId}` },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );

      threadSlug = threadRes.data.thread?.slug;
      if (threadSlug) {
        userThreads.set(userId, threadSlug);
        console.log(`🧵 [${userId}] Created new thread: ${threadSlug}`);
      }
    }

    // Send message to the thread (or workspace if no thread)
    const url = threadSlug
      ? `${BASE_URL}/workspace/${WORKSPACE_SLUG}/thread/${threadSlug}/chat`
      : `${BASE_URL}/workspace/${WORKSPACE_SLUG}/chat`;

    const response = await axios.post(
      url,
      {
        message,
        mode: 'chat',
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    return response.data.textResponse || 'No pude generar una respuesta.';
  } catch (error) {
    console.error(`[${userId}] AnythingLLM error:`, error.message);

    if (error.response?.status === 401) {
      return '⚠️ Error de autenticación con el servidor de IA.';
    }
    if (error.response?.status === 404) {
      return '⚠️ Workspace no encontrado en el servidor.';
    }

    return '⚠️ Error al procesar tu mensaje. Intenta de nuevo.';
  }
}

module.exports = { sendToAnythingLLM };
