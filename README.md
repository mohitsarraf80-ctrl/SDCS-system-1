# SCDSS — Supply Chain Decision Support System

Enterprise full-stack Supply Chain Decision Support System featuring persistent SQLite storage (`better-sqlite3` in WAL mode), cryptographic authentication (`crypto.scryptSync` + HMAC-SHA256 JWT), statistical demand forecasting, continuous-review $(Q, R)$ inventory optimization, multi-stop delivery route planning (Nearest-Neighbor & 2-Opt local search), multi-thread worker pool benchmarking, and automated decision recommendations.

---

## Architecture & Key Modules

- **`server.ts`** — Local & container full-stack entry point serving the Express REST API (`/api/*`) and Vite SPA on port `3000`.
- **`api/index.ts` & `vercel.json`** — Vercel Serverless Function entry point and routing configuration so `/api/*` runs on Vercel Node.js functions while `dist/` serves the React SPA.
- **`src/server/db.ts`** — SQLite database layer (`data/scdss.db` locally, or `/tmp/scdss.db` automatically on Vercel serverless functions), schema initialization, foreign-key enforcement, and idempotent seed data (`seedDatabaseIfEmpty`).
- **`src/server/auth.ts`** — Salted `scryptSync` password hashing, constant-time `timingSafeEqual` verification, and signed JWT bearer authentication middleware (`requireAuth`).
- **`src/server/analytics.ts`** — Verified mathematical and operations research models:
  - **Naive Forecasting**: $\hat{D}_{T+h} = D_T$
  - **Simple Moving Average (SMA)**: $\hat{D}_{T+1} = \frac{1}{w}\sum_{i=0}^{w-1} D_{T-i}$
  - **Simple Exponential Smoothing (SES)**: $F_t = \alpha D_{t-1} + (1 - \alpha) F_{t-1}$
  - **Economic Order Quantity (EOQ)**: $\text{EOQ} = \sqrt{\frac{2DS}{H}}$
  - **Statistical Safety Stock**: $\text{SS} = Z_{\alpha} \cdot \sigma_d \cdot \sqrt{L}$
  - **Reorder Point (ROP)**: $\text{ROP} = \bar{d} \cdot L + \text{SS}$
  - **Suggested Order Quantity (SOQ)**: $\text{SOQ} = \max(\text{EOQ}, \text{ROP} - \text{IP} + \text{SS})$ when $\text{IP} \le \text{ROP}$, else $0$
  - **Delivery Route Optimization**: Haversine distance matrix with Nearest-Neighbor construction and 2-Opt edge-exchange refinement
  - **Parallel Execution Benchmark**: Node.js `worker_threads` parallel pool vs. single-thread sequential execution
  - **Automated Recommendations**: Multi-SKU shortage, reorder, demand surge, and excess working-capital detection
- **`src/App.tsx` & `src/api.ts`** — Enterprise React 19 + Tailwind CSS + Recharts frontend workspace.
- **`tests/scdss.test.ts`** — Automated Vitest unit and end-to-end integration & persistence test suite.

---

## Pushing to GitHub (from Antigravity) & Deploying to Vercel

This project is pre-configured with `vercel.json` and `api/index.ts` for zero-config deployment to Vercel.

### Step 1: Push to GitHub from Antigravity Terminal
```bash
git init
git add .
git commit -m "feat: complete Supply Chain Decision Support System (SCDSS)"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

### Step 2: Deploy to Vercel
1. Go to [vercel.com/new](https://vercel.com/new) and import your GitHub repository.
2. Vercel will automatically read `vercel.json`:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Serverless API**: `/api/*` routed to `api/index.ts`
3. *(Optional)* Add Environment Variable in Vercel Project Settings:
   - `SCDSS_JWT_SECRET`: any random secret string for signing JWT tokens.
4. Click **Deploy**. On Vercel, the backend automatically detects the serverless environment (`process.env.VERCEL`), creates and seeds the SQLite database in writable `/tmp/scdss.db`, and serves all `/api/*` endpoints.

---

## Local Setup, Startup & Verification Commands

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Full-Stack Server (Backend API + Frontend on Port 3000)
```bash
npm run dev
```

### 3. Default Verified Accounts
| Role | Email | Password |
| :--- | :--- | :--- |
| System Administrator | `admin@scdss.io` | `Admin@123` |
| Supply Chain Planner | `planner@scdss.io` | `Planner@123` |
| OR Analyst | `analyst@scdss.io` | `Analyst@123` |

### 4. Run Automated Tests, Type-Checking & Production Build
```bash
npm test
npm run lint
npm run build
```
