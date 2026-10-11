# ShopSense Python API

FastAPI is the application's backend for authentication, vendor and admin
operations, analytics, and AI/RAG. JavaScript is used by the React frontend only.

## Install and run

From the repository root on Windows:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r analytics_api\requirements-dev.txt
Copy-Item .env.example .env
# Configure a strong JWT_SECRET and the initial admin values in .env.
npm run dev
```

On macOS/Linux, use `python3 -m venv .venv` and the `.venv/bin/python` executable.
The startup command starts FastAPI on port 8000 and automatically uses the project virtual
environment when it exists.

## Accounts

Email verification and SMTP delivery are not used. Vendor registration is available without
email configuration, and newly registered vendors must still be approved by an administrator
before they can sign in.

Set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and a unique
`BOOTSTRAP_ADMIN_PASSWORD` (12-72 bytes) in `.env`, then make the one-time request. The
administrator can sign in as soon as it is created:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/auth/bootstrap-admin
```

Existing accounts remain usable after migration. Optional demo accounts can be seeded only in
local development by setting `APP_ENV=development` and both email/password values for each
role: `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_VENDOR_EMAIL`, and
`DEMO_VENDOR_PASSWORD`. Demo credentials configured outside local development cause startup
to fail. Do not commit `.env`.

## Endpoints

Both the established `/api/*` frontend paths and native paths without `/api` are accepted.
All account, vendor, admin, AI, and analytics operations require the appropriate bearer JWT.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/auth/register` | Register a vendor application |
| POST | `/auth/login` | Admin or approved vendor login |
| POST | `/auth/bootstrap-admin` | Create the initial administrator from configured environment values |
| `/vendor/*` | Vendor profile, catalog, uploads, stock, and dashboard APIs |
| `/admin/*` | Admin dashboard, vendor review, and account management |
| `/analytics/*` | Vendor and historical reporting/analytics APIs |
| `/ai/*` | Python RAG assistant and grounded product-content generation |
| GET | `/docs` | Interactive API docs |

The Python API initializes and migrates the shared SQLite schema at startup and imports the
historical XLSX data when the analytics tables are empty. Set `DB_PATH` to override its
database location.

Gemini and OpenAI keys are optional. Without a configured provider, or when a provider is
unavailable, the assistant uses a grounded local response over the signed-in vendor's live
catalog.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q analytics_api
```
