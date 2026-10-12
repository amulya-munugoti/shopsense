# ShopSense

ShopSense is a vendor catalog and inventory application with an admin area and analytics. Vendors can manage products and stock, review sales and marketplace insights, and ask questions about their own catalog.

## What the app includes

- **Vendor accounts:** registration, sign-in, profile editing, and admin approval before a new vendor can sign in.
- **Product catalog:** add, edit, and delete products; update stock; upload product images; and search catalog entries.
- **Product content tools:** generate a product description and SEO fields from the product name, category, and any details supplied by the vendor. OpenAI or Gemini credentials are optional; without a working provider, the API returns a grounded local fallback.
- **Vendor dashboard and insights:** catalog and sales summaries, inventory health, customer and product reports, demand projections, vendor-to-marketplace benchmarks, cross-sell recommendations, and CSV exports.
- **AI Business Assistant:** ask questions about the signed-in vendor's current catalog, including product, price, category, and stock questions. External AI providers are optional; local responses cover supported catalog filters and identify information the catalog does not contain.
- **Admin area:** review vendors and approve, suspend, reset status, or remove accounts.

Marketplace analytics use the workbooks in `dataset/`. On startup, the API imports them into SQLite if the `analytics_orders` table is empty and all four workbooks are present. Vendor product and sales records are kept in separate tables from the marketplace dataset.

## Technology

- Frontend: React 19, Vite, React Router 7, Tailwind CSS 4
- API: Python, FastAPI
- Storage: SQLite
- Optional text generation: OpenAI or Google Gemini

## Run locally

Requirements: Node.js and Python 3.

1. Install the Python and frontend dependencies from the repository root:

   ```powershell
   py -3 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r analytics_api\requirements-dev.txt
   npm install --prefix client
   ```

   On macOS or Linux, use `python3 -m venv .venv` and `.venv/bin/python` in place of the Windows Python commands.

2. Create the local environment file and edit it:

   ```powershell
   Copy-Item .env.example .env
   ```

   Set `APP_ENV=development` and a private `JWT_SECRET` of at least 32 bytes. To create the first admin, set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (12–72 bytes). `BOOTSTRAP_ADMIN_NAME` is optional. The bootstrap password is used to create that account once.

3. Start both the API and frontend:

   ```powershell
   npm run local
   ```

   Open <http://localhost:5173>. The frontend uses Vite to proxy `/api` and `/uploads` to the API at `http://127.0.0.1:8000`. Keep the terminal open while using the app; press `Ctrl+C` to stop both services.

4. Create the first admin account, if configured, by making this one-time request:

   ```powershell
   Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/auth/bootstrap-admin
   ```

   Register a vendor in the app, then sign in as the admin and approve the vendor from **Vendor Management**.

The API also runs on its own with `npm run dev` from the repository root. To run only the frontend, use `npm run dev` from `client` in another terminal.

## AI provider configuration

AI text generation is optional. Add `OPENAI_API_KEY` or `GEMINI_API_KEY` to the root `.env` file to enable provider-generated assistant answers and product content. Without a working provider, the API uses its local grounded fallback. A ChatGPT subscription does not itself provide an OpenAI API key.

## Build the frontend

From the repository root:

```powershell
npm run build --prefix client
```

The production frontend files are written to `client/dist/`.

## API and tests

The FastAPI service exposes interactive API documentation at <http://127.0.0.1:8000/docs>. Protected vendor and admin operations require a bearer token from sign-in.

Run the Python API tests from the repository root with:

```powershell
.\.venv\Scripts\python.exe -m pytest -q analytics_api
```
