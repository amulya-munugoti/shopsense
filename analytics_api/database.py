"""SQLite initialization for the Python API."""

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import bcrypt
from email_validator import EmailNotValidError, validate_email
from openpyxl import load_workbook


PROJECT_ROOT = Path(__file__).resolve().parent.parent
_configured_db_path = Path(
    os.getenv("DB_PATH", str(PROJECT_ROOT / "server" / "db" / "shopsense.db"))
)
DB_PATH = (
    _configured_db_path
    if _configured_db_path.is_absolute()
    else PROJECT_ROOT / _configured_db_path
).resolve()

SCHEMA = """
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vendors (
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

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  seo_title TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  seo_keywords TEXT NOT NULL DEFAULT '',
  product_tags TEXT NOT NULL DEFAULT '',
  key_features TEXT NOT NULL DEFAULT '',
  vendor_hints TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  amount REAL NOT NULL,
  sold_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_products (
  product_id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_customers (
  customer_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS analytics_orders (
  order_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  order_date TEXT NOT NULL,
  total_amount REAL NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES analytics_customers(customer_id)
);

CREATE TABLE IF NOT EXISTS analytics_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES analytics_orders(order_id),
  FOREIGN KEY (product_id) REFERENCES analytics_products(product_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_orders_customer ON analytics_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_analytics_orders_date ON analytics_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_analytics_order_items_product ON analytics_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_analytics_order_items_order ON analytics_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_products_vendor_stock ON products(vendor_id, stock, name);
CREATE INDEX IF NOT EXISTS idx_sales_vendor_date ON sales(vendor_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_vendor_product ON sales(vendor_id, product_id);
"""

DEMO_CATALOG_VERSION = "2026-08-polished-catalog-monthly-sales"
DEMO_CATALOG = (
    ("Nova Smart Watch", "A sleek everyday smartwatch for calls, activity tracking, and timely notifications.", "Electronics", 4999, 34, "/uploads/products/demo-smart-watch.jpg"),
    ("SoundWave Wireless Headphones", "Comfortable over-ear headphones for focused work, travel, and everyday listening.", "Electronics", 3299, 48, "/uploads/products/demo-wireless-headphones.jpg"),
    ("Pulse Mini Bluetooth Speaker", "A compact portable speaker that brings clear sound to picnics and small gatherings.", "Electronics", 1899, 0, "/uploads/products/demo-bluetooth-speaker.jpg"),
    ("Ceramic Coffee Mug Set", "A set of four glazed ceramic mugs for coffee, tea, and relaxed morning routines.", "Home & Kitchen", 899, 26, "/uploads/products/demo-coffee-mugs.jpg"),
    ("Stainless Steel Water Bottle", "A reusable insulated bottle that keeps refreshments close during work, commutes, and workouts.", "Home & Kitchen", 749, 62, "/uploads/products/demo-water-bottle.jpg"),
    ("Modern LED Desk Lamp", "A clean, adjustable desk lamp that adds comfortable task lighting to your workspace.", "Home & Kitchen", 1599, 9, "/uploads/products/demo-desk-lamp.jpg"),
    ("Everyday Laptop Backpack", "A practical backpack with room for a laptop, daily essentials, and short trips.", "Accessories", 2199, 31, "/uploads/products/demo-laptop-backpack.jpg"),
    ("Men's Cotton Crew T-Shirt", "A soft cotton crew-neck T-shirt designed for easy layering and everyday comfort.", "Fashion", 699, 75, "/uploads/products/demo-cotton-tshirt.jpg"),
    ("Stride Running Shoes", "Lightweight running shoes with a comfortable fit for walks, runs, and daily movement.", "Fashion", 3499, 18, "/uploads/products/demo-running-shoes.jpg"),
    ("Classic Polarized Sunglasses", "Timeless sunglasses that add an easy finishing touch to bright-day outfits.", "Accessories", 1299, 0, "/uploads/products/demo-sunglasses.jpg"),
    ("Daily Glow Skincare Set", "A simple three-step skincare set for a fresh, cared-for everyday routine.", "Beauty", 1499, 22, "/uploads/products/demo-skincare-set.jpg"),
    ("Ionic Hair Dryer", "A lightweight hair dryer for quick everyday styling at home or while travelling.", "Beauty", 2499, 14, "/uploads/products/demo-hair-dryer.jpg"),
    ("Flex Yoga Mat", "A supportive yoga mat with a comfortable surface for stretching, yoga, and floor workouts.", "Sports", 1199, 39, "/uploads/products/demo-yoga-mat.jpg"),
    ("Neoprene Dumbbell Pair", "A versatile pair of dumbbells for home strength sessions and everyday training.", "Sports", 1799, 11, "/uploads/products/demo-dumbbells.jpg"),
    ("Bamboo Cutting Board", "A smooth bamboo cutting board for everyday prep, serving, and kitchen organization.", "Home & Kitchen", 999, 44, "/uploads/products/demo-cutting-board.jpg"),
    ("Leather Card Wallet", "A slim leather card wallet that keeps daily cards organized without extra bulk.", "Accessories", 1099, 7, "/uploads/products/demo-card-wallet.jpg"),
    ("Smart Fitness Band", "A lightweight fitness band for tracking daily activity, workouts, and healthy routines.", "Electronics", 1999, 53, "/uploads/products/demo-fitness-band.jpg"),
    ("Soft Makeup Brush Set", "A curated makeup brush set for blending, buffing, and creating polished everyday looks.", "Beauty", 899, 16, "/uploads/products/demo-makeup-brushes.jpg"),
)


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in connection.execute(f"PRAGMA table_info({table})")}


def seed_demo_accounts(connection: sqlite3.Connection) -> None:
    """Seed demo users locally, or on deployments that explicitly enable demo access."""
    admin_email = os.getenv("DEMO_ADMIN_EMAIL", "").strip()
    admin_password = os.getenv("DEMO_ADMIN_PASSWORD", "")
    vendor_email = os.getenv("DEMO_VENDOR_EMAIL", "").strip()
    vendor_password = os.getenv("DEMO_VENDOR_PASSWORD", "")
    configured = any((admin_email, admin_password, vendor_email, vendor_password))
    app_env = os.getenv("APP_ENV", "").strip().lower()
    is_development = app_env in {"development", "dev"}
    enable_setting = os.getenv("ENABLE_DEMO_ACCOUNTS", "").strip().lower()
    demo_enabled = enable_setting in {"1", "true", "yes"}
    deployment_markers = (
        "RENDER",
        "VERCEL",
        "DYNO",
        "K_SERVICE",
        "AWS_LAMBDA_FUNCTION_NAME",
        "WEBSITE_INSTANCE_ID",
        "FUNCTIONS_WORKER_RUNTIME",
        "RAILWAY_ENVIRONMENT",
        "RAILWAY_ENVIRONMENT_ID",
        "RAILWAY_PROJECT_ID",
        "RAILWAY_SERVICE_ID",
        "RAILWAY_DEPLOYMENT_ID",
    )
    deployed = any(os.getenv(key, "").strip() for key in deployment_markers)
    seed_production_defaults = (
        (app_env == "production" or deployed)
        and enable_setting not in {"0", "false", "no"}
    )
    if configured and not is_development and not demo_enabled:
        raise RuntimeError("Custom DEMO_* accounts require local development or ENABLE_DEMO_ACCOUNTS=true.")
    if not is_development and not demo_enabled and not seed_production_defaults:
        return
    if configured and is_development and deployed and not demo_enabled:
        raise RuntimeError("DEMO_* accounts are supported only in a local development environment.")

    if demo_enabled or seed_production_defaults:
        admin_email = admin_email or "admin@demo.com"
        admin_password = admin_password or "admin123"
        vendor_email = vendor_email or "vendor@demo.com"
        vendor_password = vendor_password or "vendor123"
        configured = True
    if not configured:
        return

    accounts = (
        ("admin", admin_email, admin_password),
        ("vendor", vendor_email, vendor_password),
    )
    with connection:
        for role, raw_email, password in accounts:
            if not raw_email and not password:
                continue
            if not raw_email or not password:
                raise RuntimeError(f"Both DEMO_{role.upper()}_EMAIL and DEMO_{role.upper()}_PASSWORD are required.")
            try:
                email = validate_email(raw_email, check_deliverability=False).normalized.lower()
            except EmailNotValidError as exc:
                raise RuntimeError(f"DEMO_{role.upper()}_EMAIL must be a valid email address.") from exc
            if len(password) < 6 or len(password.encode("utf-8")) > 72:
                raise RuntimeError(
                    f"DEMO_{role.upper()}_PASSWORD must contain at least 6 characters and no more than 72 bytes."
                )
            password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()

            if role == "admin":
                if connection.execute("SELECT 1 FROM admins LIMIT 1").fetchone():
                    continue
                connection.execute(
                    """
                    INSERT OR IGNORE INTO admins (name, email, password, email_verified)
                    VALUES ('Demo Admin', ?, ?, 1)
                    """,
                    (email, password_hash),
                )
                account = connection.execute(
                    "SELECT password FROM admins WHERE lower(email) = ?",
                    (email,),
                ).fetchone()
            else:
                if connection.execute("SELECT 1 FROM vendors LIMIT 1").fetchone():
                    continue
                connection.execute(
                    """
                    INSERT OR IGNORE INTO vendors
                        (full_name, business_name, email, password, status, email_verified)
                    VALUES ('Demo Vendor', 'Demo Store', ?, ?, 'approved', 1)
                    """,
                    (email, password_hash),
                )
                account = connection.execute(
                    "SELECT password FROM vendors WHERE lower(email) = ?",
                    (email,),
                ).fetchone()

            if account is None or not bcrypt.checkpw(password.encode("utf-8"), account["password"].encode("utf-8")):
                raise RuntimeError(
                    f"Configured demo {role} email already belongs to an account with a different password."
                )


def seed_bootstrap_accounts(connection: sqlite3.Connection) -> None:
    """Create configured first production accounts once, without replacing existing accounts."""
    account_configs = (
        {
            "role": "admin",
            "email": os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip(),
            "password": os.getenv("BOOTSTRAP_ADMIN_PASSWORD", ""),
            "name": os.getenv("BOOTSTRAP_ADMIN_NAME", "ShopSense Administrator").strip()
            or "ShopSense Administrator",
            "table": "admins",
            "insert": "INSERT INTO admins (name, email, password, email_verified) VALUES (?, ?, ?, ?)",
        },
        {
            "role": "vendor",
            "email": os.getenv("BOOTSTRAP_VENDOR_EMAIL", "").strip(),
            "password": os.getenv("BOOTSTRAP_VENDOR_PASSWORD", ""),
            "name": os.getenv("BOOTSTRAP_VENDOR_NAME", "ShopSense Vendor").strip() or "ShopSense Vendor",
            "business_name": os.getenv("BOOTSTRAP_VENDOR_BUSINESS_NAME", "ShopSense Store").strip()
            or "ShopSense Store",
            "table": "vendors",
            "insert": """INSERT INTO vendors
                (full_name, business_name, email, password, status, email_verified)
                VALUES (?, ?, ?, ?, 'approved', 1)""",
        },
    )

    for config in account_configs:
        email = config["email"]
        password = config["password"]
        if not email and not password:
            continue
        if not email or not password:
            raise RuntimeError(
                f"Both BOOTSTRAP_{config['role'].upper()}_EMAIL and "
                f"BOOTSTRAP_{config['role'].upper()}_PASSWORD are required."
            )
        if len(password) < 12 or len(password.encode("utf-8")) > 72:
            raise RuntimeError(f"BOOTSTRAP_{config['role'].upper()}_PASSWORD must be 12-72 bytes long.")
        try:
            normalized_email = validate_email(email, check_deliverability=False).normalized.lower()
        except EmailNotValidError as exc:
            raise RuntimeError(f"BOOTSTRAP_{config['role'].upper()}_EMAIL must be a valid email address.") from exc

        if connection.execute(f"SELECT 1 FROM {config['table']} LIMIT 1").fetchone():
            continue

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()
        if config["role"] == "admin":
            values = (config["name"], normalized_email, password_hash, 1)
        else:
            values = (config["name"], config["business_name"], normalized_email, password_hash)
        with connection:
            connection.execute(config["insert"], values)


def seed_demo_catalog(connection: sqlite3.Connection) -> None:
    """Restore the legacy JavaScript demo catalog for the demo vendor when empty."""
    vendor = connection.execute(
        "SELECT id FROM vendors WHERE lower(email) = ?",
        ("vendor@demo.com",),
    ).fetchone()
    if vendor is None:
        return
    seeded_version = connection.execute(
        "SELECT setting_value FROM app_settings WHERE setting_key = ?",
        ("demo_catalog_version",),
    ).fetchone()
    if seeded_version and seeded_version["setting_value"] == DEMO_CATALOG_VERSION:
        return
    if connection.execute(
        "SELECT 1 FROM products WHERE vendor_id = ? LIMIT 1",
        (vendor["id"],),
    ).fetchone():
        return

    insert_product = """INSERT INTO products
        (vendor_id, name, description, category, price, stock, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)"""
    insert_sale = """INSERT INTO sales (vendor_id, product_id, quantity, amount, sold_at)
        VALUES (?, ?, ?, ?, ?)"""
    now = datetime.now(timezone.utc)
    with connection:
        for index, product in enumerate(DEMO_CATALOG):
            cursor = connection.execute(insert_product, (vendor["id"], *product))
            product_id = cursor.lastrowid
            for month_offset in range(12):
                month_index = now.year * 12 + (now.month - 1) - month_offset
                sale_year, zero_based_month = divmod(month_index, 12)
                sale_date = datetime(
                    sale_year,
                    zero_based_month + 1,
                    6 + (index % 20),
                    12,
                    tzinfo=timezone.utc,
                )
                quantity = 1 + ((index + month_offset) % 3)
                sold_at = sale_date.strftime("%Y-%m-%d %H:%M:%S")
                connection.execute(
                    insert_sale,
                    (vendor["id"], product_id, quantity, quantity * product[3], sold_at),
                )
        connection.execute(
            "INSERT OR REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)",
            ("demo_catalog_version", DEMO_CATALOG_VERSION),
        )


def _import_analytics_dataset(connection: sqlite3.Connection) -> None:
    if connection.execute("SELECT 1 FROM analytics_orders LIMIT 1").fetchone():
        return

    dataset_dir = PROJECT_ROOT / "dataset"
    table_specs = (
        ("products_1.xlsx", "analytics_products", ("product_id", "product_name", "category", "price", "stock")),
        ("customers_1.xlsx", "analytics_customers", ("customer_id", "customer_name", "email")),
        ("orders_1.xlsx", "analytics_orders", ("order_id", "customer_id", "order_date", "total_amount")),
        ("order_items_1.xlsx", "analytics_order_items", ("order_id", "product_id", "quantity", "unit_price")),
    )
    if not all((dataset_dir / filename).is_file() for filename, _, _ in table_specs):
        return

    with connection:
        for filename, table, columns in table_specs:
            workbook = load_workbook(dataset_dir / filename, read_only=True, data_only=True)
            try:
                sheet = workbook[workbook.sheetnames[0]]
                rows = sheet.iter_rows(values_only=True)
                headers = [str(value).strip() if value is not None else "" for value in next(rows)]
                missing = set(columns) - set(headers)
                if missing:
                    raise ValueError(f"{filename} is missing required columns: {', '.join(sorted(missing))}")
                indexes = [headers.index(column) for column in columns]
                placeholders = ", ".join("?" for _ in columns)
                quoted_columns = ", ".join(f'"{column}"' for column in columns)
                insert = f'INSERT OR IGNORE INTO "{table}" ({quoted_columns}) VALUES ({placeholders})'
                for row in rows:
                    values: list[Any] = [row[index] if index < len(row) else None for index in indexes]
                    if table in {"analytics_products", "analytics_orders", "analytics_order_items"}:
                        numeric_columns = {
                            "analytics_products": {"price", "stock"},
                            "analytics_orders": {"total_amount"},
                            "analytics_order_items": {"quantity", "unit_price"},
                        }[table]
                        values = [
                            float(value) if column in numeric_columns and value is not None else value
                            for column, value in zip(columns, values)
                        ]
                    connection.execute(insert, values)
            finally:
                workbook.close()


def initialize_database() -> None:
    """Create application tables and migrate databases created by the old API."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    try:
        connection.executescript(SCHEMA)
        for table in ("admins", "vendors"):
            if "email_verified" not in _columns(connection, table):
                connection.execute(
                    f"ALTER TABLE {table} ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1"
                )
            connection.execute(f"UPDATE {table} SET email_verified = 1")
        connection.execute("DROP TABLE IF EXISTS email_verifications")
        seed_bootstrap_accounts(connection)
        seed_demo_accounts(connection)
        product_migrations = {
            "image_url": "TEXT",
            "seo_title": "TEXT NOT NULL DEFAULT ''",
            "short_description": "TEXT NOT NULL DEFAULT ''",
            "meta_title": "TEXT NOT NULL DEFAULT ''",
            "meta_description": "TEXT NOT NULL DEFAULT ''",
            "seo_keywords": "TEXT NOT NULL DEFAULT ''",
            "product_tags": "TEXT NOT NULL DEFAULT ''",
            "key_features": "TEXT NOT NULL DEFAULT ''",
            "vendor_hints": "TEXT NOT NULL DEFAULT ''",
        }
        product_columns = _columns(connection, "products")
        for column, definition in product_migrations.items():
            if column not in product_columns:
                connection.execute(f"ALTER TABLE products ADD COLUMN {column} {definition}")
        seed_demo_catalog(connection)
        connection.commit()
        _import_analytics_dataset(connection)
    finally:
        connection.close()
