/**
 * AnythingLLM Service
 *
 * Forwards WhatsApp messages to the remote AnythingLLM server
 * with per-user thread isolation and ManDev business context.
 */
const axios = require('axios');

// ── Configuration (override via env vars for Railway) ──
const BASE_URL = process.env.ANYTHINGLLM_BASE_URL || 'https://agente.mandev.site/api/v1';
const API_KEY = process.env.ANYTHINGLLM_API_KEY || '4E715PD-Q3TMDXR-J0BVF2Q-Z29E04Y';
const WORKSPACE_SLUG = process.env.ANYTHINGLLM_WORKSPACE || 'agente-soporte';

// ── System prompt with ManDev business context ──
const SYSTEM_PROMPT = `Eres el asistente virtual de ManDev, una agencia de desarrollo de software y soluciones tecnológicas.

CONTEXTO DEL NEGOCIO:
- Sitio principal: https://mandev.site — Portafolio, servicios y contacto de ManDev.
- App: https://app.mandev.site — Plataforma SaaS de ManDev para clientes.
- Servicios: Desarrollo web y móvil, inteligencia artificial, automatización de procesos, consultoría tech.
- Fundador: Daniel — Desarrollador full-stack especializado en IA y automatización.

REGLAS:
- Responde siempre en español, de forma profesional y concisa.
- Si te preguntan por servicios, precios o proyectos, dirige al usuario a https://mandev.site o https://app.mandev.site según corresponda.
- Si no sabes algo específico del negocio, sugiere contactar directamente vía WhatsApp o el formulario de contacto en mandev.site.
- Sé amable, útil y proactivo. Ofrece valor en cada respuesta.
- No inventes información sobre precios o proyectos específicos que no conozcas.
- Puedes ayudar con preguntas generales de tecnología, programación y desarrollo.`;

/** @type {Map<string, string>} userId -> threadSlug for conversation isolation */
const userThreads = new Map();

/** @type {Set<string>} Tracks threads that already received the system prompt */
const promptedThreads = new Set();

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
        { name: `whatsapp-${userId}-${Date.now()}` },
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

    // Build the chat endpoint URL
    const url = threadSlug
      ? `${BASE_URL}/workspace/${WORKSPACE_SLUG}/thread/${threadSlug}/chat`
      : `${BASE_URL}/workspace/${WORKSPACE_SLUG}/chat`;

    // On the first message of a new thread, prepend the system prompt
    // so the AI knows the ManDev context
    let fullMessage = message;
    const threadKey = threadSlug || `workspace-${userId}`;

    if (!promptedThreads.has(threadKey)) {
      fullMessage = `[INSTRUCCIONES DEL SISTEMA]\n${SYSTEM_PROMPT}\n[FIN DE INSTRUCCIONES]\n\nMensaje del usuario:\n${message}`;
      promptedThreads.add(threadKey);
      console.log(`📋 [${userId}] System prompt injected for thread ${threadKey}`);
    }

    const response = await axios.post(
      url,
      {
        message: fullMessage,
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
