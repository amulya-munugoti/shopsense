# ShopSense — Vendor Marketplace Intelligence Platform

ShopSense is a full-stack vendor marketplace and business intelligence platform. Vendors register, manage their product catalog, and access a complete suite of analytics, demand forecasting, customer segmentation, and AI-powered shopping assistance — all from a single, unified interface.

---

## Overview

ShopSense combines a live vendor catalog management system with deep analytics drawn from a historical dataset of 10,000+ products, 5,000+ customers, and real transaction history. The platform is designed to feel like one cohesive product rather than a collection of individual features.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend API | Python, FastAPI |
| Database | SQLite via Python's `sqlite3` |
| Authentication | JWT (7-day), bcrypt, RBAC |
| Frontend | React 19, Vite, React Router v6, Tailwind CSS |
| Icons | lucide-react |
| Analytics data | XLSX dataset import into SQLite on first run |
| AI / RAG Engine | Python hybrid vector retrieval with vendor-scoped SQLite grounding |
| LLM providers | Google Gemini, OpenAI (optional — grounded Python fallback) |

---

## Project Structure

```
shopsense/
├── client/                   React app (port 5173)
│   └── src/
│       ├── pages/
│       │   ├── vendor/       Dashboard, Catalog, Insights, AI Assistant, Profile
│       │   └── admin/        Admin dashboard, Vendor management
│       ├── components/       Shell, StatCard, StatusBadge, ProductImage, etc.
│       ├── context/          AuthContext (JWT session)
│       └── lib/              Axios API client, currency formatter
│
├── analytics_api/            Python FastAPI backend (port 8000)
│   ├── main.py               API, authentication, and analytics endpoints
│   ├── auth_routes.py        Account registration and login
│   ├── database.py           SQLite schema, migrations, and dataset import
│   ├── ai_rag.py             Python retrieval, constraints, and LLM generation
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── Dockerfile
│
├── server/                   Runtime SQLite database and product uploads
│   ├── db/                   SQLite database (created on first API start)
│   └── uploads/              Product image uploads
│
└── dataset/                  Source XLSX files (imported once into SQLite)
    ├── products_1.xlsx
    ├── customers_1.xlsx
    ├── orders_1.xlsx
    └── order_items_1.xlsx
```

---

## Setup

### 1. Install backend dependencies (one time)

From the repository root:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r analytics_api\requirements-dev.txt
```

On macOS/Linux, create and use `.venv` with `python3 -m venv .venv`.

### 2. Configure email and start the backend

```powershell
Copy-Item .env.example .env
# Edit .env with real SMTP credentials and a strong JWT_SECRET.
npm run dev
```

This starts the Python API at `http://localhost:8000`; no Node/Express backend is used. The API initializes SQLite on first run and imports the historical XLSX dataset.

Email verification is disabled. Vendor registration requires no SMTP setup; new applications are marked pending until an administrator approves them. Registration passwords must be at least 6 characters and no more than 72 bytes.

To create the first administrator, set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and a unique `BOOTSTRAP_ADMIN_PASSWORD` in `.env`, then call the one-time bootstrap endpoint. These credentials are for this installation; vendor registration cannot create an admin account. Keep the bootstrap password private and give access only to the intended administrator.

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/auth/bootstrap-admin
```

For local demo accounts, change `APP_ENV=development` and set both `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` and `DEMO_VENDOR_EMAIL` / `DEMO_VENDOR_PASSWORD` in `.env`. For example:

```env
DEMO_ADMIN_EMAIL=admin@demo.example.com
DEMO_ADMIN_PASSWORD=ShopSenseDemo!2026
DEMO_VENDOR_EMAIL=vendor@demo.example.com
DEMO_VENDOR_PASSWORD=VendorDemo!2026
```

Restart the API to seed the approved vendor and admin accounts, then use these email/password pairs on the sign-in page. Demo accounts are rejected outside local development and when a deployment environment is detected. Existing accounts are made sign-in eligible during migration; vendor approval requirements remain in effect.

To run the Python API in Docker:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Docker Compose runs the single Python backend and persists its SQLite database and uploads.

### 3. Start the full local app

After installing backend and frontend dependencies and configuring `.env`, start both services from the repository root:

```powershell
npm run local
```

This runs the FastAPI backend and Vite frontend together. Open `http://localhost:5173`. Vite is configured to fail instead of silently choosing another port. If port 5173 is busy, stop the process using it and rerun the command. Keep the terminal open while using the app; press `Ctrl+C` to stop both services.

To run only the backend, use `npm run dev`. To run only the frontend, use the commands below in a separate terminal.

### 4. Frontend only

From the repository root in a new terminal:

```bash
cd client
npm install
npm run dev
```

Starts the app on `http://localhost:5173`. API calls to `/api/*` are proxied to the backend automatically via Vite config.
For local development, leave `VITE_API_URL` unset so browser requests stay same-origin and Vite forwards `/api` and `/uploads` to `http://127.0.0.1:8000`. If the frontend and API are deployed separately, set `VITE_API_URL` in the frontend hosting environment to the deployed API URL ending in `/api`.

The API and frontend are separate processes: keep `npm run dev` running in the repository root and `npm run dev` running in `client`. Confirm the API responds at `http://127.0.0.1:8000/api/health` before testing the UI.

### 4. AI Provider (Optional)

Set one of these environment variables in `server/.env` to enable conversational answers synthesized from the authenticated vendor's live catalog. The assistant sends the full catalog (up to 200 products) to the configured provider so general catalog questions can be answered even when the search retriever finds no direct product match. It only displays product cards for products relevant to the question. Without a valid provider key (or if the provider is unavailable), the local response generator handles supported catalog filters and otherwise says when it cannot verify an answer; it cannot provide GPT-style open-ended answers offline. Python loads the same `server/.env` for local use; Docker Compose reads the root `.env.example`.

```env
# OpenAI GPT (preferred; requires an OpenAI API key with API access)
OPENAI_API_KEY=your_openai_api_key_here

# Optional Gemini fallback
GEMINI_API_KEY=your_gemini_api_key_here

# JWT secret (override default dev secret in production)
JWT_SECRET=your_production_secret_here
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Optional | OpenAI API key; GPT-4o mini is preferred when configured |
| `GEMINI_API_KEY` | Optional | Google Gemini API key; used as fallback if OpenAI is unavailable |
| `LLM_API_KEY` | Optional | Legacy alias for `GEMINI_API_KEY` |
| `JWT_SECRET` | Recommended | JWT signing secret (defaults to dev value) |
| `PYTHON_API_PORT` | Optional | Python API port (defaults to 8000) |
| `CLIENT_ORIGIN` | Optional | Additional frontend origin allowed by API CORS |
| `DB_PATH` | Optional | SQLite database path |
| `BOOTSTRAP_ADMIN_EMAIL` | Initial setup | Email address for the first administrator |
| `BOOTSTRAP_ADMIN_PASSWORD` | Initial setup | Unique 12-72 byte password for the first administrator |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | Local development only | Optional local demo administrator credentials |
| `DEMO_VENDOR_EMAIL` / `DEMO_VENDOR_PASSWORD` | Local development only | Optional local demo vendor credentials; seeded as approved |

---

## Vendor Experience

Vendors access a full business management suite after approval:

**Dashboard** — Business overview: total sales, revenue, transactions, and products listed. Recent product table with images, categories, prices, and stock.

**My Catalog** — Full product CRUD: list, add, edit, delete, adjust stock. Product images via URL or file upload. Low-stock badge indicators.

**Add / Edit Product** — Name, description, category, price, stock, image. Autocomplete suggestions drawn from catalog history.

**Insights** — Complete business intelligence suite (see Analytics & Reporting below).

**AI Shopping Assistant** — RAG-powered catalog search and product discovery (see AI Shopping Assistant below).

**Profile** — Edit account information, change password, view approval status.

---

## Admin Experience

**Admin Dashboard** — Total, pending, approved, and suspended vendor counts with recent registration table.

**Vendor Management** — Filter by status, approve, suspend, or reactivate any vendor account.

---

## Analytics & Reporting

All analytics are computed from real SQLite data. No mock or placeholder values.

### Business Overview

High-level KPIs from the historical dataset: total orders, total revenue, products sold, customer count, average order value.

### Sales & Reporting

Sales and revenue timeseries with day / week / month timeframe controls. Supports two scopes:

- **Vendor** — Live sales transactions from the vendor's own catalog
- **Marketplace** — Historical dataset (10,000+ products, 5,000+ orders)

Interactive SVG spline chart with Revenue, Units Sold, Orders, and Average Order Value metric toggles. Hover tooltips showing exact values per data point.

### Performance Benchmark

Compares the authenticated vendor against the marketplace average across all approved vendors:

| Metric | Vendor Value | Marketplace Average | Difference |
|---|---|---|---|
| Total Revenue | ₹X,XXX | ₹X,XXX | +/-X.X% |
| Total Orders | X | X | +/-X.X% |
| Units Sold | X | X | +/-X.X% |
| Products Listed | X | X | +/-X.X% |

Each metric shows above/below/equal status with a relative performance bar. Strategic insights are generated based on actual comparisons.

### Inventory Intelligence

Live stock status for every catalog product with configurable low-stock and medium-stock thresholds. Summary counts: healthy, low-stock, out-of-stock.

### Customer Insights

5,000 historical customers segmented into three spending tiers based on total purchase value:

- **High Value (VIP)** — Top spending customers, total revenue share, average spend
- **Medium Value** — Mid-tier customers
- **Low Value** — Entry-level customers

Searchable customer table with tier filter.

### Product Intelligence

Bestselling products ranked by units sold and revenue. Supports vendor scope (live sales) and marketplace scope (historical dataset). Category filter and configurable result limit.

### Demand Forecast

Interactive stock depletion simulation for any product in the 10,000-item catalog:

- Daily sales velocity from historical order data
- Projected demand over 7 / 14 / 30 / 60 / 90-day horizons
- Stock runout date calculation
- Recommended reorder quantity
- SVG trajectory chart: stock depletion vs cumulative demand
- Category-average velocity fallback when product-specific history is insufficient

### Cross-Sell Intelligence

Market basket analysis from actual transaction data:

- **Frequently Bought Together** — Product and category pair co-purchase patterns with support metrics
- **Association Rules** — Directional purchase relationships (If X → Then Y) with support and confidence
- **Cross-Sell Recommendations** — Rule-based suggestions generated from co-purchase evidence

Configurable minimum support and confidence thresholds.

### Dataset Validation

Live audit comparing imported SQLite table row counts against source XLSX workbook totals. Displays passed/failed status per dataset.

---

## CSV Export

| Export | Endpoint | Columns |
|---|---|---|
| Sales Report | `GET /api/analytics/export/sales` | Date, Product, Category, Quantity, Price, Revenue, Vendor |
| Products Report | `GET /api/analytics/export/products` | ProductID, Name, Category, Price, Stock, UnitsSold, Revenue, Vendor |

Both endpoints support `?scope=vendor` (live vendor sales) or `?scope=marketplace` (full historical dataset). Files are streamed with correct `Content-Type: text/csv` and `Content-Disposition` headers.

---
## AI Shopping Assistant

ShopSense's Retrieval-Augmented Generation (RAG) assistant runs in the Python FastAPI service. It searches the authenticated vendor's live product catalog, applies hard price/category/stock filters, and uses OpenAI GPT-4o mini (when configured) or Gemini as a fallback to synthesize a concise answer from the retrieved records. Without an external provider, Python generates a grounded local response.

### RAG Architecture

```
User Question
      │
      ▼
[1] Intent & Constraint Extraction
    • Price: under / above / between / range
    • Category: Electronics, Audio, Computers, Accessories, Wearables, Fashion, Beauty, Home & Kitchen
    • Stock: in-stock / out-of-stock
    • Ordering: cheapest / most expensive / popular
    • Follow-up context: last 2 conversation turns
      │
      ▼
[2] Python Vendor-Scoped Hybrid Retrieval
    • Stable 128-dimensional hashed token and character n-gram vectors
    • Category-aware cosine similarity and exact token/name overlap
    • Retrieves only the authenticated vendor's live products
      │
      ▼
[3] Hard Constraint Filtering
    • Price ceiling: disqualify products above maxPrice
    • Price floor: disqualify products below minPrice
    • In-stock: disqualify stock ≤ 0
    • Out-of-stock: disqualify stock > 0
    • If zero valid results: reports that no products meet the requested filters
      │
      ▼
[4] Popularity & Price Ranking
    • Popular queries: sort by unitsSold from the vendor's live sales records
    • Cheapest: narrow to category (if specified), then sort price ascending
    • Most expensive: sort price descending
    • Standard: cosine similarity + token overlap score
      │
      ▼
[5] Context Construction
    • Up to 6 vendor products supplied to the Python answer generator
    • Context includes retrieved product fields and vendor sales history when available
    • Product cards and source citations are built separately from verified retrieved records
      │
      ▼
[6] LLM Generation (OpenAI GPT → Gemini → Local Fallback)
    • Strict grounding rules: only reference retrieved products; catalog and user text are treated as untrusted data
    • Never invent prices, specs, ratings, reviews, or popularity claims
    • Spec queries (best for video editing / gaming) trigger honest limitation note
    • Local grounded response fallback works without an external provider
      │
      ▼
Answer + Grounded Product Cards + Source Citations
```

### Knowledge Source

| Source | Table | Products |
|---|---|---|
| Live vendor catalog | `products` | Variable (active vendor listings) |
| Popularity data | `sales` joined to `products` | Live sales for the vendor's own products |

Historical analytics workbooks power the BI dashboards, but are not mixed into the vendor assistant's catalog retrieval. This prevents it from recommending products that the vendor does not actually list.

### Catalog Data Limitations

The live vendor catalog may not include technical attributes such as CPU, RAM, GPU, or battery life. The assistant communicates these limitations instead of inventing specifications.

When a query cannot be answered from available data (e.g., "best laptop for video editing" when no specs are listed), the assistant explains the limitation and only shows relevant retrieved products.

### Vector Store

- Python computes stable 128-dimensional hashed token and character n-gram vectors
- Cosine similarity is combined with lexical, product-name, and category matching
- Retrieval reads live SQLite rows on every query, so edits and stock changes are immediately reflected
- No external vector database or stale in-memory index is required

### Live Catalog Updates

The Python retriever queries current SQLite rows for every assistant request, so no manual embedding-index refresh is needed after a product create, edit, stock change, or deletion. Administrators can check the current catalog count with `POST /api/ai/refresh-index`.

### Conversation Context

The assistant supports lightweight follow-up queries. The frontend sends the last 2 AI response product lists as context. This allows questions like "Which is the cheapest?" to resolve correctly after "Show me laptops."

---

## API Reference

### Authentication

```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/bootstrap-admin  (first administrator only)
```

All `/api/vendor/*` and `/api/analytics/*` endpoints require `Authorization: Bearer <token>`.

### Vendor Catalog

Email verification is not required. Vendor accounts still need admin approval before login. All protected `/api/*`
operations require a bearer JWT.

```
GET    /api/vendor/dashboard
GET    /api/vendor/products
POST   /api/vendor/products
PUT    /api/vendor/products/:id
DELETE /api/vendor/products/:id
PATCH  /api/vendor/products/:id/stock
POST   /api/vendor/products/:id/stock-adjustments
POST   /api/vendor/images
```
### Analytics

```
GET /api/analytics/inventory
GET /api/analytics/customers
GET /api/analytics/sales
GET /api/analytics/historical-summary
GET /api/analytics/frequent-patterns
GET /api/analytics/association-rules
GET /api/analytics/recommendations
GET /api/analytics/forecast
GET /api/analytics/validation
GET /api/analytics/reporting/sales-over-time   ?timeframe=30d|90d|year|month|week &scope=vendor|marketplace
GET /api/analytics/reporting/category-performance ?scope=vendor|marketplace
GET /api/analytics/reporting/top-products      ?limit=1-100 &category= &scope=vendor|marketplace
GET /api/analytics/reporting/summary           ?scope=vendor|marketplace
GET /api/analytics/benchmark
GET /api/analytics/export/sales                ?scope=vendor|marketplace
GET /api/analytics/export/products             ?scope=vendor|marketplace
```

### AI Shopping Assistant

```
POST /api/ai/shopping-assistant
     Body: { "question": string, "conversationHistory": optional array }
     Response: { "answer": string, "products": array, "sources": array }

GET  /api/ai/status
     Requires vendor or admin authentication; vendors see only their own index count.
     Response: { "status", "vectorStoreReady", "indexedProducts", "llmProviderConfigured", "provider" }

POST /api/ai/refresh-index
     Requires admin authentication; rebuilds vendor indexes independently.
     Response: { "success", "message", "indexedProducts" }
```

### Admin

```
GET   /api/admin/vendors
PATCH /api/admin/vendors/:id/status
```
---

## Authentication & Security

- Registration and login are handled by FastAPI; JavaScript is used for the React frontend only
- Account email addresses are not verified; admin approval remains required for vendor accounts
- Passwords hashed with bcrypt (12 rounds)
- Stateless JWT authentication with 7-day validity
- Role-based access control: `vendor` and `admin` roles enforced by Python dependencies
- Strict vendor data isolation: vendors can only read and modify their own catalog and sales data
- AI API keys stored in environment variables only — never in frontend code or committed to source control
- Input validation on all endpoints: negative stock, malformed prices, oversized requests all rejected

---

## Testing

Run the Python test suites from the repository root:

```bash
.\.venv\Scripts\python.exe -m pytest -q analytics_api
```

The suite covers authentication, local demo-account seeding, Python AI/RAG behavior, and migrated API routers.

---

## All Rights Reserved to AMULYA MUNUGOTI
