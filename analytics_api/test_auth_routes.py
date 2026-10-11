import os
import sqlite3
import unittest
from unittest.mock import patch

import bcrypt
import httpx

from analytics_api import main
from analytics_api.database import seed_demo_accounts


def make_auth_database():
    connection = sqlite3.connect(":memory:", check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.executescript(
        """
        CREATE TABLE admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email_verified INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            business_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone TEXT,
            business_address TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            joined_at TEXT NOT NULL DEFAULT (datetime('now')),
            email_verified INTEGER NOT NULL DEFAULT 1
        );
        """
    )
    return connection


class AuthenticationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = make_auth_database()

        def override_db():
            yield self.db

        main.app.dependency_overrides[main.get_db] = override_db
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=main.app),
            base_url="http://test",
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        main.app.dependency_overrides.pop(main.get_db, None)
        self.db.close()

    async def test_health_endpoint_accepts_existing_api_prefix(self):
        response = await self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    async def test_cors_allows_frontend_write_requests(self):
        response = await self.client.options(
            "/api/vendor/products/1",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "DELETE",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5173")
        self.assertIn("DELETE", response.headers.get("access-control-allow-methods", ""))

    async def test_registration_needs_no_email_service_and_vendor_still_needs_approval(self):
        with patch.dict(os.environ, {}, clear=True):
            registration = await self.client.post(
                "/api/auth/register",
                json={
                    "fullName": "Casey Vendor",
                    "businessName": "Casey Goods",
                    "email": "CASEY@example.com",
                    "password": "correct-horse-battery",
                },
            )

        self.assertEqual(registration.status_code, 201)
        self.assertEqual(registration.json()["email"], "casey@example.com")
        account = self.db.execute("SELECT email_verified, status FROM vendors").fetchone()
        self.assertEqual(account["email_verified"], 1)
        self.assertEqual(account["status"], "pending")

        login_before_approval = await self.client.post(
            "/api/auth/login",
            json={"email": "casey@example.com", "password": "correct-horse-battery", "role": "vendor"},
        )
        self.assertEqual(login_before_approval.status_code, 403)
        self.assertIn("awaiting admin approval", login_before_approval.json()["error"])

        self.db.execute("UPDATE vendors SET status = 'approved'")
        approved_login = await self.client.post(
            "/api/auth/login",
            json={"email": "casey@example.com", "password": "correct-horse-battery", "role": "vendor"},
        )
        self.assertEqual(approved_login.status_code, 200)
        self.assertEqual(approved_login.json()["user"]["role"], "vendor")
        self.assertIn("token", approved_login.json())

    async def test_existing_unverified_admin_can_log_in(self):
        password = "a-unique-admin-password"
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=4)).decode()
        self.db.execute(
            "INSERT INTO admins (name, email, password, email_verified) VALUES (?, ?, ?, 0)",
            ("Admin Person", "admin@example.com", password_hash),
        )

        login_response = await self.client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": password, "role": "admin"},
        )

        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.json()["user"]["role"], "admin")

    async def test_email_verification_endpoints_are_removed(self):
        verify = await self.client.post("/api/auth/verify-email", json={"token": "x" * 43})
        resend = await self.client.post(
            "/api/auth/resend-verification",
            json={"email": "person@example.com", "role": "vendor"},
        )
        self.assertEqual(verify.status_code, 404)
        self.assertEqual(resend.status_code, 404)

    async def test_invalid_email_is_rejected_without_creating_an_account(self):
        response = await self.client.post(
            "/api/auth/register",
            json={
                "fullName": "Invalid Person",
                "businessName": "Invalid Goods",
                "email": "not-an-email",
                "password": "correct-horse-battery",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM vendors").fetchone()[0], 0)

    @patch.dict(
        os.environ,
        {
            "BOOTSTRAP_ADMIN_EMAIL": "owner@example.com",
            "BOOTSTRAP_ADMIN_NAME": "Store Owner",
            "BOOTSTRAP_ADMIN_PASSWORD": "owner-unique-password",
        },
    )
    async def test_bootstrap_admin_can_sign_in_without_email_verification(self):
        response = await self.client.post("/api/auth/bootstrap-admin")
        self.assertEqual(response.status_code, 201)

        account = self.db.execute(
            "SELECT name, email_verified FROM admins WHERE email = ?",
            ("owner@example.com",),
        ).fetchone()
        self.assertEqual(account["name"], "Store Owner")
        self.assertEqual(account["email_verified"], 1)

        login_response = await self.client.post(
            "/api/auth/login",
            json={"email": "owner@example.com", "password": "owner-unique-password", "role": "admin"},
        )
        self.assertEqual(login_response.status_code, 200)

    def test_demo_accounts_are_seeded_and_login_ready_in_development(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "development",
                "DEMO_ADMIN_EMAIL": "admin@demo.example.com",
                "DEMO_ADMIN_PASSWORD": "ShopSenseDemo!2026",
                "DEMO_VENDOR_EMAIL": "vendor@demo.example.com",
                "DEMO_VENDOR_PASSWORD": "VendorDemo!2026",
            },
            clear=True,
        ):
            seed_demo_accounts(self.db)
            seed_demo_accounts(self.db)

        admin = self.db.execute(
            "SELECT name, email_verified FROM admins WHERE email = ?",
            ("admin@demo.example.com",),
        ).fetchone()
        vendor = self.db.execute(
            "SELECT full_name, business_name, status, email_verified FROM vendors WHERE email = ?",
            ("vendor@demo.example.com",),
        ).fetchone()
        self.assertEqual((admin["name"], admin["email_verified"]), ("Demo Admin", 1))
        self.assertEqual(
            (vendor["full_name"], vendor["business_name"], vendor["status"], vendor["email_verified"]),
            ("Demo Vendor", "Demo Store", "approved", 1),
        )
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM admins").fetchone()[0], 1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM vendors").fetchone()[0], 1)

    def test_demo_accounts_cannot_be_configured_outside_development(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "DEMO_ADMIN_EMAIL": "admin@demo.example.com",
                "DEMO_ADMIN_PASSWORD": "ShopSenseDemo!2026",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "only in a local development"):
                seed_demo_accounts(self.db)

    def test_demo_accounts_require_both_email_and_password(self):
        with patch.dict(
            os.environ,
            {"APP_ENV": "development", "DEMO_VENDOR_EMAIL": "vendor@demo.example.com"},
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "Both DEMO_VENDOR_EMAIL"):
                seed_demo_accounts(self.db)


if __name__ == "__main__":
    unittest.main()
