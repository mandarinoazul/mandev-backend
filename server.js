/**
 * Mi Agente Backend — Express Server
 *
 * Multi-tenant WhatsApp bot with AnythingLLM integration.
 */
const express = require('express');
const cors = require('cors');
const whatsappRoutes = require('./routes/whatsapp');

// Prevent Node from crashing on unhandled errors (e.g. DNS or network drops)
// This keeps the Railway container ALIVE.
process.on('uncaughtException', (err) => {
  console.error('🔥 [CRITICAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
// Railway often passes PORT in process.env.PORT. Fallback is now 3000.
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check - Railway needs a fast 200 OK
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

// WhatsApp routes
app.use('/api/whatsapp', whatsappRoutes);

// Start server - bind dynamically so Railway can map it to 443
try {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   WhatsApp QR: POST http://localhost:${PORT}/api/whatsapp/generate-qr`);
  });
} catch (error) {
  console.error('❌ Error fatal al intentar bindear el puerto:', error);
}
