// Entry point placeholder — application logic will be added in the next phase.
// Structure follows the multi-tenant task management API design.

'use strict';

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});

module.exports = app;
