import uuid
import bcrypt
import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models
from ..auth_permissions import require_permission

router = APIRouter(prefix="/api/v5/users", tags=["users"])

# --- Schemas ---

class UserResponse(BaseModel):
    user_id: str
    username: str
    is_active: bool
    last_login_at: Optional[datetime.datetime] = None
    role_in_tenant: str

class UserCreate(BaseModel):
    username: str
    role: str

class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None

class TenantMembershipCreate(BaseModel):
    tenant_id: str
    role: str


# --- Endpoints ---

@router.get("", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("users:read"))
):
    """List users in the current tenant with their role for THIS tenant specifically."""
    tenant_id = claims.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context in session")

    # Fetch users who have a membership in this tenant
    memberships = db.query(models.UserTenantMembership).filter(
        models.UserTenantMembership.tenant_id == tenant_id
    ).all()

    result = []
    for m in memberships:
        user = m.user
        result.append(UserResponse(
            user_id=str(user.user_id),
            username=user.username,
            is_active=user.is_active,
            last_login_at=user.last_login_at,
            role_in_tenant=m.role
        ))
    return result

@router.post("", response_model=UserResponse)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("users:write"))
):
    """Create a user and assign them to the current tenant."""
    # A tenant_admin cannot elevate someone to platform_admin
    creator_role = claims.get("role", "")
    if payload.role == "platform_admin" and creator_role != "platform_admin":
        raise HTTPException(status_code=403, detail="Only platform_admin can create platform_admin users")

    tenant_id = claims.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context in session")

    existing = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    temp_password = str(uuid.uuid4())[:8] # Temporary password
    hashed_pw = bcrypt.hashpw(temp_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # Create the user
    new_user = models.User(
        username=payload.username,
        hashed_password=hashed_pw,
        is_active=True,
        must_change_password=True,
        created_by=uuid.UUID(claims.get("user_id")) if claims.get("user_id") else None
    )
    db.add(new_user)
    db.flush()

    # Create the membership in this tenant
    membership = models.UserTenantMembership(
        user_id=new_user.user_id,
        tenant_id=uuid.UUID(tenant_id),
        role=payload.role
    )
    db.add(membership)
    db.commit()
    db.refresh(new_user)

    print(f"[USER ADMIN] Created user {new_user.username} with temp password: {temp_password}")

    return UserResponse(
        user_id=str(new_user.user_id),
        username=new_user.username,
        is_active=new_user.is_active,
        last_login_at=new_user.last_login_at,
        role_in_tenant=membership.role
    )

@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("users:write"))
):
    """Update user active status or role-within-current-tenant."""
    target_user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    tenant_id = claims.get("tenant_id")
    membership = db.query(models.UserTenantMembership).filter(
        models.UserTenantMembership.user_id == user_id,
        models.UserTenantMembership.tenant_id == tenant_id
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="User is not a member of the current tenant")

    # Update role logic
    if payload.role:
        creator_role = claims.get("role", "")
        # A tenant_admin cannot elevate someone to platform_admin
        if payload.role == "platform_admin" and creator_role != "platform_admin":
            raise HTTPException(status_code=403, detail="Only platform_admin can assign platform_admin role")
        membership.role = payload.role

    if payload.is_active is not None:
        target_user.is_active = payload.is_active

    db.commit()

    return UserResponse(
        user_id=str(target_user.user_id),
        username=target_user.username,
        is_active=target_user.is_active,
        last_login_at=target_user.last_login_at,
        role_in_tenant=membership.role
    )

@router.delete("/{user_id}")
def deactivate_user(
    user_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("users:write"))
):
    """Soft delete a user."""
    target_user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Ensure the user belongs to the current tenant to prevent a tenant_admin 
    # from disabling users outside their tenant.
    tenant_id = claims.get("tenant_id")
    membership = db.query(models.UserTenantMembership).filter(
        models.UserTenantMembership.user_id == user_id,
        models.UserTenantMembership.tenant_id == tenant_id
    ).first()

    if not membership and claims.get("role") != "platform_admin":
        raise HTTPException(status_code=403, detail="User is not in your tenant")

    target_user.is_active = False
    db.commit()
    return {"status": "User deactivated"}


# --- Cross-Tenant Management ---

@router.post("/{user_id}/tenants")
def grant_tenant_access(
    user_id: str,
    payload: TenantMembershipCreate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("users:grant_cross_tenant"))
):
    """Platform Admin only: Grant a user access to an additional tenant."""
    target_user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already a member
    membership = db.query(models.UserTenantMembership).filter(
        models.UserTenantMembership.user_id == user_id,
        models.UserTenantMembership.tenant_id == payload.tenant_id
    ).first()

    if membership:
        membership.role = payload.role
    else:
        membership = models.UserTenantMembership(
            user_id=user_id,
            tenant_id=uuid.UUID(payload.tenant_id),
            role=payload.role
        )
        db.add(membership)
    
    db.commit()
    return {"status": "Tenant access granted"}


@router.delete("/{user_id}/tenants/{tenant_id}")
def revoke_tenant_access(
    user_id: str,
    tenant_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("users:grant_cross_tenant"))
):
    """Platform Admin only: Revoke tenant access."""
    membership = db.query(models.UserTenantMembership).filter(
        models.UserTenantMembership.user_id == user_id,
        models.UserTenantMembership.tenant_id == tenant_id
    ).first()

    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    db.delete(membership)
    db.commit()
    return {"status": "Tenant access revoked"}
