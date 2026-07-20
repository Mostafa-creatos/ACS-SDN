import os
import uuid
import datetime
import jwt
import logging
import re
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from . import models

security = HTTPBearer()
logger = logging.getLogger(__name__)

def create_access_token(user_id: str, role: str, tenant_id: str, tenants: list = None, jti: str = str(uuid.uuid4())) -> str:
    now = datetime.datetime.utcnow()
    payload = {
        "sub": str(user_id),
        "user_id": str(user_id),
        "role": role,
        "tenant_id": tenant_id,
        "tenants": tenants or [],
        "iat": now,
        "nbf": now,
        "exp": now + datetime.timedelta(hours=settings.JWT_EXPIRY_HOURS),
        "jti": jti,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def get_current_user_claims(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> dict:
    """
    Decodes the JWT token from the Authorization header to enforce tenant boundaries and roles.
    Mock tokens are only active when ENVIRONMENT != 'production'.
    """
    token = credentials.credentials

    # Gate mock tokens behind non-production environments only
    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    if not is_production:
        if token == "mock-token-admin":
            return {"role": "Platform Admin", "tenant_id": "00000000-0000-0000-0000-000000000000", "user_id": "00000000-0000-0000-0000-000000000000"}
        if token == "mock-token-operator":
            return {"role": "Tenant Operator", "tenant_id": "11111111-1111-1111-1111-11111111111a", "user_id": "11111111-1111-1111-1111-11111111111b"}
        if token == "mock-token-auditor":
            return {"role": "Tenant Auditor", "tenant_id": "11111111-1111-1111-1111-11111111111a", "user_id": "11111111-1111-1111-1111-11111111111c"}
        if token.startswith("mock-token-operator-"):
            tenant_id = token[len("mock-token-operator-"):]
            return {"role": "Tenant Operator", "tenant_id": tenant_id, "user_id": "mock"}
        if token.startswith("mock-token-auditor-"):
            tenant_id = token[len("mock-token-auditor-"):]
            return {"role": "Tenant Auditor", "tenant_id": tenant_id, "user_id": "mock"}
    
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        
        # Validate X-Tenant-ID header against the user's allowed tenants list
        x_tenant = request.headers.get("X-Tenant-ID")
        if x_tenant:
            allowed_tenants = payload.get("tenants", [])
            if x_tenant not in allowed_tenants and payload.get("role") != "platform_admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: tenant '{x_tenant}' is not in your authorized tenant list."
                )
            payload["requested_tenant_name"] = x_tenant
            tenant = db.query(models.Tenant).filter(models.Tenant.tenant_name == x_tenant).first()
            if tenant:
                payload["tenant_id"] = str(tenant.tenant_id)
                payload["tenant_name"] = tenant.tenant_name
        else:
            tenants = payload.get("tenants", [])
            if tenants:
                tenant = db.query(models.Tenant).filter(models.Tenant.tenant_name == tenants[0]).first()
                if tenant:
                    payload["tenant_id"] = str(tenant.tenant_id)
                    payload["tenant_name"] = tenant.tenant_name
                
        # NOTE: Role normalization removed — all endpoints now use snake_case
        # (platform_admin, operator, readonly) consistently via require_permission.
        # The require_permission class handles its own normalization internally.
            
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="JWT token has expired. Please log in again."
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired JWT authorization token."
        )


def validate_password_complexity(password: str) -> None:
    """Validates password meets minimum complexity requirements. Raises 400 if not."""
    errors = []
    if len(password) < 8:
        errors.append("at least 8 characters")
    if not re.search(r"[A-Z]", password):
        errors.append("at least 1 uppercase letter")
    if not re.search(r"[a-z]", password):
        errors.append("at least 1 lowercase letter")
    if not re.search(r"[0-9]", password):
        errors.append("at least 1 digit")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>\-_=+\[\]\\;'/`~]", password):
        errors.append("at least 1 special character")
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password does not meet complexity requirements: {', '.join(errors)}."
        )


def verify_switch_access(db: Session, switch_id: uuid.UUID, claims: dict):
    """
    Verifies that the authenticated user possesses authorization bounds to query or write to a target switch.
    """
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")
    if user_role in ["Platform Admin", "platform_admin"]:
        return True
    
    if not user_tenant_id:
        raise HTTPException(status_code=403, detail="Access denied: No tenant ID associated with user.")
        
    t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
    switch = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not switch:
        raise HTTPException(status_code=404, detail="Switch not found")
        
    # Verify tenant has subnets configured on this switch's fabric
    has_access = db.query(models.IpamSubnet).join(models.TenantVrf).filter(
        models.TenantVrf.tenant_id == t_uuid,
        models.IpamSubnet.fabric_id == switch.fabric_id
    ).count() > 0
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied: switch is outside tenant boundary.")
    return True
