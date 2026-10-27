/**
 * SCDSS — Full-Stack Server Entry Point (Port 3000)
 *
 * Mounts the Express REST API (/api/*) alongside Vite middleware in development
 * or static dist assets in production.
 */

import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './src/server/app';
import { getDb } from './src/server/db';

async function startServer() {
  // Initialize SQLite database and seed data on boot
  getDb();

  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SCDSS Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
