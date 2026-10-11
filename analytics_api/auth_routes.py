"""Account registration and login endpoints."""

import os
import sqlite3
from datetime import datetime, timedelta, timezone

import bcrypt
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from pydantic import BaseModel, Field

from .main import DBConn, JWT_ALGORITHM, JWT_SECRET


router = APIRouter(prefix="/auth", tags=["Authentication"])


class RegistrationRequest(BaseModel):
    fullName: str = Field(min_length=1, max_length=120)
    businessName: str = Field(min_length=1, max_length=160)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=72)
    phone: str | None = Field(default=None, max_length=40)
    businessAddress: str | None = Field(default=None, max_length=300)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=72)
    role: str


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(raw_email: str) -> str:
    try:
        return validate_email(raw_email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise HTTPException(status_code=400, detail="Enter a valid email address.") from exc


def _account_table(role: str) -> str:
    if role not in {"admin", "vendor"}:
        raise HTTPException(status_code=400, detail="Invalid role.")
    return "admins" if role == "admin" else "vendors"


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(request: RegistrationRequest, db: DBConn) -> dict[str, str]:
    email = _normalize_email(request.email)
    full_name = request.fullName.strip()
    business_name = request.businessName.strip()
    if not full_name or not business_name:
        raise HTTPException(status_code=400, detail="Name and business name are required.")
    password_bytes = len(request.password.encode("utf-8"))
    if password_bytes < 6 or password_bytes > 72:
        raise HTTPException(status_code=400, detail="Password must be 6-72 bytes long.")

    password_hash = bcrypt.hashpw(request.password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()
    try:
        with db:
            db.execute(
                """
                INSERT INTO vendors
                    (full_name, business_name, email, password, phone, business_address, status, email_verified)
                VALUES (?, ?, ?, ?, ?, ?, 'pending', 1)
                """,
                (
                    full_name,
                    business_name,
                    email,
                    password_hash,
                    request.phone.strip() if request.phone else None,
                    request.businessAddress.strip() if request.businessAddress else None,
                ),
            )
    except sqlite3.IntegrityError as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists.",
            ) from exc
        raise

    return {
        "message": "Registration submitted. Your account is ready for admin review.",
        "email": email,
    }


@router.post("/login")
def login(request: LoginRequest, db: DBConn) -> dict:
    table = _account_table(request.role)
    email = _normalize_email(request.email)
    if len(request.password.encode("utf-8")) > 72:
        raise HTTPException(status_code=401, detail=f"Invalid {request.role} credentials.")
    account = db.execute(
        f"SELECT * FROM {table} WHERE lower(email) = ?",
        (email,),
    ).fetchone()
    if request.role == "admin" and account is None:
        configured_admin = db.execute("SELECT 1 FROM admins LIMIT 1").fetchone()
        if configured_admin is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="No administrator is set up for this app yet. The app owner must configure and bootstrap the first admin account.",
            )
    try:
        password_valid = account is not None and bcrypt.checkpw(
            request.password.encode("utf-8"),
            account["password"].encode("utf-8"),
        )
    except (ValueError, TypeError):
        password_valid = False
    if not password_valid:
        raise HTTPException(status_code=401, detail=f"Invalid {request.role} credentials.")

    if request.role == "vendor":
        if account["status"] == "pending":
            raise HTTPException(status_code=403, detail="Your account is still awaiting admin approval.")
        if account["status"] == "suspended":
            raise HTTPException(status_code=403, detail="Your account has been suspended. Contact the admin.")
        payload = {
            "id": account["id"],
            "role": "vendor",
            "name": account["full_name"],
            "businessName": account["business_name"],
            "email": account["email"],
        }
        user = {
            **payload,
            "status": account["status"],
        }
    else:
        payload = {
            "id": account["id"],
            "role": "admin",
            "name": account["name"],
            "email": account["email"],
        }
        user = payload

    expires_at = _now() + timedelta(days=7)
    token = jwt.encode(
        {**payload, "exp": expires_at},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )
    return {"token": token, "user": user}


@router.post("/bootstrap-admin", status_code=status.HTTP_201_CREATED)
def bootstrap_admin(db: DBConn) -> dict[str, str]:
    """Create the first administrator from configured environment credentials."""
    raw_email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip()
    name = os.getenv("BOOTSTRAP_ADMIN_NAME", "").strip() or "ShopSense Administrator"
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    if not raw_email or not password:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before bootstrapping an administrator.",
        )
    email = _normalize_email(raw_email)
    if len(password) < 12 or len(password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="The bootstrap password must be 12-72 bytes long.",
        )
    if db.execute("SELECT 1 FROM admins LIMIT 1").fetchone():
        raise HTTPException(status_code=409, detail="An administrator is already configured.")

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()
    with db:
        db.execute(
            "INSERT INTO admins (name, email, password, email_verified) VALUES (?, ?, ?, 1)",
            (name, email, password_hash),
        )
    return {"message": "Administrator created. You can sign in now."}
