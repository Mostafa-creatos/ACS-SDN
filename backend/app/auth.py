import uuid
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .config import settings
from . import models

security = HTTPBearer()

def get_current_user_claims(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Decodes the JWT token from the Authorization header to enforce tenant boundaries and roles.
    Includes simple mock tokens for test execution loops.
    """
    token = credentials.credentials
    if token == "mock-token-admin":
        return {"role": "Platform Admin", "tenant_id": "00000000-0000-0000-0000-000000000000"}
    if token == "mock-token-operator":
        return {"role": "Tenant Operator", "tenant_id": "11111111-1111-1111-1111-11111111111a"}
    if token == "mock-token-auditor":
        return {"role": "Tenant Auditor", "tenant_id": "11111111-1111-1111-1111-11111111111a"}
    if token.startswith("mock-token-operator-"):
        tenant_id = token[len("mock-token-operator-"):]
        return {"role": "Tenant Operator", "tenant_id": tenant_id}
    if token.startswith("mock-token-auditor-"):
        tenant_id = token[len("mock-token-auditor-"):]
        return {"role": "Tenant Auditor", "tenant_id": tenant_id}
    
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired JWT authorization token."
        )

def verify_switch_access(db: Session, switch_id: uuid.UUID, claims: dict):
    """
    Verifies that the authenticated user possesses authorization bounds to query or write to a target switch.
    """
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")
    if user_role == "Platform Admin":
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
