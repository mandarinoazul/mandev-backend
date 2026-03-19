/**
 * Mi Agente Backend — Express Server
 *
 * Multi-tenant WhatsApp bot with AnythingLLM integration.
 */
const express = require('express');
const cors = require('cors');
const whatsappRoutes = require('./routes/whatsapp');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check - Railway needs a fast 200 OK
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

// WhatsApp routes
app.use('/api/whatsapp', whatsappRoutes);

// Start server - bind to 0.0.0.0 for Docker/Railway
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mi Agente Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   WhatsApp QR: POST http://localhost:${PORT}/api/whatsapp/generate-qr`);
});
