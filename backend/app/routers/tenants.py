from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from .. import models, schemas
from ..db import get_db
from ..auth_permissions import require_permission

router = APIRouter(prefix="/api/v5/admin/tenants", tags=["tenants"])

class TenantResponse(BaseModel):
    tenant_id: str
    tenant_name: str

@router.get("", response_model=List[TenantResponse])
def list_tenants(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """List all tenants in the system."""
    tenants = db.query(models.Tenant).all()
    return [{"tenant_id": str(t.tenant_id), "tenant_name": t.tenant_name} for t in tenants]

@router.post("", response_model=TenantResponse)
def create_tenant(
    payload: schemas.TenantCreate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Create a new tenant."""
    existing = db.query(models.Tenant).filter(models.Tenant.tenant_name == payload.tenant_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tenant with this name already exists")
    
    new_tenant = models.Tenant(tenant_name=payload.tenant_name)
    db.add(new_tenant)
    db.commit()
    db.refresh(new_tenant)

    # Automatically add the creator (platform_admin) as a member so they can switch to it
    user_id = claims.get("user_id")
    if user_id:
        membership = models.UserTenantMembership(
            user_id=user_id,
            tenant_id=new_tenant.tenant_id,
            role="platform_admin"
        )
        db.add(membership)
        db.commit()

    return {"tenant_id": str(new_tenant.tenant_id), "tenant_name": new_tenant.tenant_name}

@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Delete a tenant."""
    tenant = db.query(models.Tenant).filter(models.Tenant.tenant_id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Optional: Prevent deleting the primary/default tenant
    if tenant.tenant_name == "AtlasWave Maroc Demo":
        raise HTTPException(status_code=400, detail="Cannot delete the default platform tenant")

    db.delete(tenant)
    db.commit()
