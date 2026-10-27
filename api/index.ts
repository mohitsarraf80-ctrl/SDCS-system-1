/**
 * SCDSS — Vercel Serverless Function Entry Point (/api/*)
 *
 * Exports the Express application so Vercel routes all `/api/*` requests
 * to the backend while serving the static Vite build (`dist/`) at the root.
 */

import { createApp } from '../src/server/app';

const app = createApp();

export default app;
