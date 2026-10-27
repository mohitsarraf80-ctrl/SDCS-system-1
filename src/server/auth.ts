/**
 * SCDSS — Cryptographic Authentication & Session Token Service
 *
 * Uses Node.js native `crypto.scryptSync` + `crypto.timingSafeEqual` for salted password hashing
 * and HMAC-SHA256 signed bearer tokens for stateless API authentication.
 */

import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const SECRET_KEY =
  process.env.SCDSS_JWT_SECRET ||
  process.env.GEMINI_API_KEY ||
  'scdss-enterprise-local-hmac-key-2026-verified';

export interface AuthTokenPayload {
  userId: number;
  email: string;
  name: string;
  role: 'admin' | 'planner' | 'analyst';
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash: derivedKey, salt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (derived.length !== storedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

export function signToken(payload: Omit<AuthTokenPayload, 'exp'>, expiresInSeconds = 86400 * 7): string {
  const fullPayload: AuthTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as AuthTokenPayload;
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required. Provide a valid Bearer token in the Authorization header.',
      code: 'UNAUTHORIZED',
    });
    return;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({
      error: 'Invalid or expired authentication token.',
      code: 'INVALID_TOKEN',
    });
    return;
  }
  req.user = payload;
  next();
}
