import datetime
import uuid
import jwt
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models
from ..config import settings
from ..auth import get_current_user_claims

router = APIRouter(prefix="/api/v5/auth", tags=["auth"])

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
    }
    return jwt.encode(token_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


@router.post("/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid username or password (or inactive account)")
    
    if not bcrypt.checkpw(payload.password.encode("utf-8"), user.hashed_password.encode("utf-8")):
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
    return {
        "access_token": token,
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
        print(f"[AUTH] Password reset requested for {user.username}. Token: {token_str}")
        
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
    user.hashed_password = bcrypt.hashpw(payload.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user.must_change_password = False
    matched_token.used_at = datetime.datetime.utcnow()
    db.commit()
    return {"status": "Password reset successfully"}
