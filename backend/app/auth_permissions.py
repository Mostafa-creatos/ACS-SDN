import uuid
from datetime import datetime
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from .auth import get_current_user_claims
from .db import get_db
from . import models

# ---------------------------------------------------------
# RBAC Matrix: Maps explicit actions to required roles
# ---------------------------------------------------------

PERMISSION_MATRIX = {
    # Users & Access
    "users:read": ["tenant_admin", "platform_admin"],
    "users:write": ["tenant_admin", "platform_admin"],
    "users:grant_cross_tenant": ["platform_admin"],

    # IPAM
    "ipam:write": ["tenant_admin", "platform_admin"],

    # Policy intents
    "policy:submit_dry_run": ["operator", "tenant_admin", "platform_admin"],
    "policy:submit_live": ["tenant_admin", "platform_admin"],
    "policy:approve_spine": ["platform_admin"],

    # Orchestrator / Rollback / Compliance
    "rollback:run": ["operator", "tenant_admin", "platform_admin"],
    "compliance:run": ["operator", "tenant_admin", "platform_admin"],
    
    # Discovery / Global Config
    "global:manage": ["platform_admin"],
    
    # Inventory
    "inventory:read": ["readonly", "operator", "tenant_admin", "platform_admin"],
    "inventory:write": ["operator", "tenant_admin", "platform_admin"],
}

# Add a catch-all mapping for any readonly operation
# If a route doesn't require a specific write capability, it implicitly requires readonly.
# Readonly allows everything above + readonly
ALL_ROLES = ["readonly", "operator", "tenant_admin", "platform_admin"]

def _log_audit_event(db: Session, user_id: str, tenant_id: str, action: str, resource: str, status_msg: str, detail: str = ""):
    u_uuid = uuid.UUID(user_id) if user_id else None
    t_uuid = uuid.UUID(tenant_id) if tenant_id and tenant_id != "None" else None

    log = models.AuditLog(
        user_id=u_uuid,
        tenant_id=t_uuid,
        action=action,
        resource=resource,
        status=status_msg,
        detail=detail
    )
    db.add(log)
    db.commit()


class require_permission:
    """
    FastAPI Dependency to enforce RBAC permissions based on the single source of truth matrix.
    Logs permission-denied events to the AuditLog.
    """
    def __init__(self, permission_name: str):
        self.permission_name = permission_name

    def __call__(self, claims: dict = Depends(get_current_user_claims), db: Session = Depends(get_db)):
        user_role = claims.get("role")
        user_id = claims.get("user_id")
        tenant_id = claims.get("tenant_id")
        
        # Legacy normalization
        if user_role == "Platform Admin": user_role = "platform_admin"
        elif user_role == "Tenant Operator": user_role = "operator"
        elif user_role == "Tenant Auditor": user_role = "readonly"

        allowed_roles = PERMISSION_MATRIX.get(self.permission_name, ["platform_admin"]) # Default to most restrictive

        if user_role not in allowed_roles:
            # Log the denial
            _log_audit_event(
                db=db,
                user_id=user_id,
                tenant_id=tenant_id,
                action=self.permission_name,
                resource="api_endpoint",
                status_msg="denied",
                detail=f"User possessed role '{user_role}' but '{self.permission_name}' requires one of {allowed_roles}."
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: You do not possess the '{self.permission_name}' capability."
            )
        
        # Log success for sensitive operations (optional, but good for compliance)
        # We only log denials by default as per sprint specs, but we could log writes here if needed.
        
        return claims
