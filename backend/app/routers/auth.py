import datetime
import uuid
import jwt
import bcrypt
import logging
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models
from ..config import settings
from ..auth import get_current_user_claims, validate_password_complexity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v5/auth", tags=["auth"])

# Simple in-memory rate limiter for login attempts (IP -> [timestamps])
_login_attempts: dict = list(defaultdict(list).items()) if False else defaultdict(list)
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 300  # 5 minutes

def _check_login_rate_limit(ip: str) -> None:
    """Raises 429 if IP has exceeded login attempt threshold."""
    now = time.time()
    # Purge old entries
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < LOGIN_LOCKOUT_SECONDS]
    if len(_login_attempts[ip]) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Try again in {LOGIN_LOCKOUT_SECONDS // 60} minutes."
        )

def _record_login_failure(ip: str) -> None:
    _login_attempts[ip].append(time.time())

class LoginPayload(BaseModel):
    username: str
    password: str

class SwitchTenantPayload(BaseModel):
    tenant_id: str

class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str

class ForgotPasswordPayload(BaseModel):
    username: str

class ResetPasswordPayload(BaseModel):
    token: str
    new_password: str

class RefreshTokenPayload(BaseModel):
    refresh_token: str

def generate_jwt_for_user(user: models.User, tenant_id: str, role: str, tenants: list = None) -> str:
    now = datetime.datetime.utcnow()
    token_payload = {
        "sub": user.username,
        "user_id": str(user.user_id),
        "username": user.username,
        "role": role,
        "tenant_id": tenant_id,
        "tenants": tenants or [],
        "iat": now,
        "nbf": now,
        "exp": now + datetime.timedelta(hours=settings.JWT_EXPIRY_HOURS),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(token_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str, role: str, tenant_id: str) -> str:
    now = datetime.datetime.utcnow()
    payload = {
        "sub": str(user_id),
        "role": role,
        "tenant_id": tenant_id,
        "user_id": str(user_id),
        "exp": now + datetime.timedelta(days=settings.JWT_REFRESH_EXPIRY_DAYS),
        "iat": now,
        "nbf": now,
        "jti": str(uuid.uuid4()),
        "type": "refresh"
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


@router.post("/login")
def login(payload: LoginPayload, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    _check_login_rate_limit(client_ip)

    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not user.is_active:
        _record_login_failure(client_ip)
        raise HTTPException(status_code=401, detail="Invalid username or password (or inactive account)")
    
    if not bcrypt.checkpw(payload.password.encode("utf-8"), user.hashed_password.encode("utf-8")):
        _record_login_failure(client_ip)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    user.last_login_at = datetime.datetime.utcnow()
    db.commit()

    # Determine default tenant and role.
    memberships = db.query(models.UserTenantMembership).filter(models.UserTenantMembership.user_id == user.user_id).all()
    
    tenant_id = None
    role = "readonly"

    if memberships:
        # Default to the first membership
        tenant_id = str(memberships[0].tenant_id)
        role = memberships[0].role
        # If they are Platform Admin anywhere, default to that context
        for m in memberships:
            if m.role == "platform_admin":
                tenant_id = str(m.tenant_id)
                role = "platform_admin"
                break
    else:
        # Fallback to legacy fields
        tenant_id = str(user.tenant_id) if user.tenant_id else None
        role = user.role or "readonly"

    # Map legacy roles to new matrix if necessary
    if role == "Platform Admin": role = "platform_admin"
    if role == "Tenant Operator": role = "operator"
    if role == "Tenant Auditor": role = "readonly"

    # Fetch tenant names for the dropdown
    tenant_names = []
    if role == "platform_admin":
        all_tenants = db.query(models.Tenant).all()
        tenant_names = ["AtlasWave Maroc Demo"] + [t.tenant_name for t in all_tenants]
    else:
        tenant_names = [m.tenant.tenant_name for m in memberships if m.tenant]

    token = generate_jwt_for_user(user, tenant_id, role, tenant_names)
    refresh_token = create_refresh_token(str(user.user_id), role, tenant_id)
    return {
        "access_token": token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "must_change_password": user.must_change_password
    }

@router.post("/switch-tenant")
def switch_tenant(payload: SwitchTenantPayload, db: Session = Depends(get_db), claims: dict = Depends(get_current_user_claims)):
    user_id = claims.get("user_id")
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid user state")
    
    membership = db.query(models.UserTenantMembership).filter(
        models.UserTenantMembership.user_id == user.user_id,
        models.UserTenantMembership.tenant_id == payload.tenant_id
    ).first()

    if membership:
        new_role = membership.role
    else:
        if user.role in ["Platform Admin", "platform_admin"]:
            new_role = "platform_admin"
        else:
            raise HTTPException(status_code=403, detail="Not a member of target tenant")

    # Fetch tenant names
    all_memberships = db.query(models.UserTenantMembership).filter(models.UserTenantMembership.user_id == user.user_id).all()
    if new_role == "platform_admin":
        all_tenants = db.query(models.Tenant).all()
        tenant_names = [t.tenant_name for t in all_tenants]
    else:
        tenant_names = [m.tenant.tenant_name for m in all_memberships if m.tenant]

    token = generate_jwt_for_user(user, payload.tenant_id, new_role, tenant_names)
    return {"access_token": token, "token_type": "bearer"}

@router.post("/change-password")
def change_password(payload: ChangePasswordPayload, db: Session = Depends(get_db), claims: dict = Depends(get_current_user_claims)):
    user = db.query(models.User).filter(models.User.user_id == claims.get("user_id")).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not bcrypt.checkpw(payload.current_password.encode("utf-8"), user.hashed_password.encode("utf-8")):
        raise HTTPException(status_code=400, detail="Incorrect current password")

    validate_password_complexity(payload.new_password)
        
    user.hashed_password = bcrypt.hashpw(payload.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user.must_change_password = False
    db.commit()
    return {"status": "success"}

@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordPayload, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if user and user.is_active:
        token_str = str(uuid.uuid4())
        token_hash = bcrypt.hashpw(token_str.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        prt = models.PasswordResetToken(
            user_id=user.user_id,
            token_hash=token_hash,
            expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        )
        db.add(prt)
        db.commit()
        logger.info("Password reset requested for %s", user.username)
        
    return {"status": "If the username exists, a reset link has been generated."}

@router.post("/reset-password")
def reset_password(payload: ResetPasswordPayload, db: Session = Depends(get_db)):
    tokens = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.used_at == None,
        models.PasswordResetToken.expires_at > datetime.datetime.utcnow()
    ).all()
    
    matched_token = None
    for t in tokens:
        if bcrypt.checkpw(payload.token.encode('utf-8'), t.token_hash.encode('utf-8')):
            matched_token = t
            break
            
    if not matched_token:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
        
    user = db.query(models.User).filter(models.User.user_id == matched_token.user_id).first()
    validate_password_complexity(payload.new_password)
    user.hashed_password = bcrypt.hashpw(payload.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user.must_change_password = False
    matched_token.used_at = datetime.datetime.utcnow()
    db.commit()
    return {"status": "Password reset successfully"}

@router.post("/refresh")
def refresh_token(payload: RefreshTokenPayload, db: Session = Depends(get_db)):
    try:
        decoded = jwt.decode(payload.refresh_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if decoded.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    user = db.query(models.User).filter(models.User.user_id == decoded.get("user_id")).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    new_access = generate_jwt_for_user(user, decoded.get("tenant_id"), decoded.get("role"))
    return {"access_token": new_access, "token_type": "bearer"}
