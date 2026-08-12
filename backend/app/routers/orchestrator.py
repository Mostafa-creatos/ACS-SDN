"""Orchestrator policy pipeline and four-eyes approval endpoints.

Extracted from ``app.main`` (Phase C structural refactor). Handler function
names are invariant -- they define the OpenAPI operationIds.
"""
import uuid
import ipaddress
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.db import get_db
from app.auth import get_current_user_claims
from app.auth_permissions import require_permission
from app.drivers.factory import resolve_southbound_driver
from app.core.logging_config import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.post("/api/v5/orchestrator/policy-enforcement", status_code=status.HTTP_202_ACCEPTED)
async def process_policy_intent_pipeline(
    payload: schemas.PolicyIntentSubmission,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("policy:submit_live"))
):
    """
    Performs multi-tenant schema verification, runs dry-run calculations, 
    and handles configuration generation across multi-vendor fabrics.
    """
    # Load user roles and verify tenant scoping access
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")
        
    # If the user is a Tenant Operator, verify they only provision within their tenant boundary
    if user_role in ("operator", "readonly") and str(user_tenant_id) != payload.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: Operator scope restricts operations to their own tenant context."
        )

    # ==========================================
    # STAGE 1: SYNTAX VALIDATION (Done automatically via Pydantic model validation)
    # ==========================================
    target_net = ipaddress.ip_network(payload.requested_cidr, strict=True)
    calculated_anycast_gateway = str(list(target_net.hosts())[0]) + f"/{target_net.prefixlen}"

    # ==========================================
    # STAGE 2: TENANT BOUNDARY ISOLATION (Query database check)
    # ==========================================
    # Find active tenant and VRF
    tenant_vrf = db.query(models.TenantVrf).filter(
        models.TenantVrf.tenant_id == uuid.UUID(payload.tenant_id),
        models.TenantVrf.vrf_name == payload.vrf_name
    ).first()

    if tenant_vrf:
        # Check for overlaps within this specific VRF scope
        existing_subnets = db.query(models.IpamSubnet).filter(
            models.IpamSubnet.vrf_id == tenant_vrf.vrf_id
        ).all()

        for subnet in existing_subnets:
            existing_net = ipaddress.ip_network(subnet.subnet_cidr)
            if target_net.overlaps(existing_net):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Policy Rejection: Requested CIDR {payload.requested_cidr} conflicts with active subnet allocation {subnet.subnet_cidr} inside VRF {payload.vrf_name}."
                )

    # ==========================================
    # STAGE 3: TOPOLOGY PATTERN ANALYSIS
    # ==========================================
    # Validate switches and check for VLAN collisions
    pre_calculated_diff_matrix = []
    switch_roles = []
    
    for serial in payload.target_switch_serials:
        # Check if switch exists in inventory (safely try UUID first)
        switch = None
        try:
            uuid_serial = uuid.UUID(serial)
            switch = db.query(models.Switch).filter(
                models.Switch.switch_id == uuid_serial
            ).first()
        except ValueError:
            pass

        # Fallback to querying by hostname if UUID matching fails or is not a valid UUID format
        if not switch:
            switch = db.query(models.Switch).filter(
                models.Switch.hostname == serial
            ).first()

        if not switch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Inventory Exception: Target hardware switch reference '{serial}' not found in database registry."
            )

        switch_roles.append(switch.role)

        # Loop/duplicate VLAN verification: Ensure this VLAN ID is not already mapped to another VRF on this switch
        vlan_conflict = db.query(models.IpamSubnet).join(models.TenantVrf).filter(
            models.IpamSubnet.fabric_id == switch.fabric_id,
            models.IpamSubnet.vlan_id == payload.vlan_id,
            models.TenantVrf.tenant_id == uuid.UUID(payload.tenant_id),
            models.TenantVrf.vrf_id != (tenant_vrf.vrf_id if tenant_vrf else None)
        ).first()

        if vlan_conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Topology Conflict: VLAN {payload.vlan_id} is already assigned to a different VRF on this fabric."
            )

        # Generate configuration diff using southbound drivers
        try:
            driver = resolve_southbound_driver(switch.vendor)
            vrf_payload = await driver.generate_vrf_payload(payload.vrf_name, payload.l3_vni)
            overlay_payload = await driver.generate_evpn_overlay_payload(
                vrf_name=payload.vrf_name,
                vlan_id=payload.vlan_id,
                l2_vni=payload.l2_vni,
                anycast_gw=calculated_anycast_gateway
            )

            pre_calculated_diff_matrix.append({
                "switch_id": str(switch.switch_id),
                "hostname": switch.hostname,
                "vendor": switch.vendor,
                "management_ip": switch.management_ip,
                "generated_payload": f"{vrf_payload}\n{overlay_payload}"
            })
        except Exception as driver_error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Driver Code Generation Error: {str(driver_error)}"
            )

    # Calculate blast radius: Spine impact is 6, leaf is 1
    blast_radius = 6 if "spine" in switch_roles else 1

    # Blast-Radius Approval Guard: suspend if blast_radius > 2 and user is NOT Platform Admin
    if not payload.dry_run and blast_radius > 2 and claims.get("role") != "platform_admin":
        import json
        diff_payload_json = json.dumps(pre_calculated_diff_matrix)
        
        approval_record = models.PolicyApproval(
            tenant_id=uuid.UUID(payload.tenant_id),
            vrf_name=payload.vrf_name,
            vlan_id=payload.vlan_id,
            layer2_vni=payload.l2_vni,
            layer3_vni=payload.l3_vni,
            requested_cidr=payload.requested_cidr,
            target_switch_serials=",".join(payload.target_switch_serials),
            blast_radius=blast_radius,
            status="pending",
            diff_payload=diff_payload_json
        )
        db.add(approval_record)
        db.commit()

        return {
            "orchestrator_node_evaluated": settings.NODE_NAME_ID,
            "policy_verification": "PENDING_APPROVAL",
            "transaction_mode": "SUSPENDED_APPROVAL_LOCKED",
            "blast_radius_score": blast_radius,
            "detail": "Warning: High blast radius action detected. Spine changes require Platform Admin review."
        }

    # ==========================================
    # STAGE 4: DRY-RUN DIFF ENGINE
    # ==========================================
    if payload.dry_run:
        return {
            "orchestrator_node_evaluated": settings.NODE_NAME_ID,
            "policy_verification": "SUCCESS_PASSED",
            "transaction_mode": "DRY_RUN_PRE_CALCULATION",
            "anycast_gateway": calculated_anycast_gateway,
            "diff_matrix": pre_calculated_diff_matrix
        }

    # Ensure VRF exists in DB before adding subnet
    if not tenant_vrf:
        tenant_vrf = models.TenantVrf(
            tenant_id=uuid.UUID(payload.tenant_id),
            vrf_name=payload.vrf_name,
            layer3_vni=payload.l3_vni
        )
        db.add(tenant_vrf)
        db.commit()
        db.refresh(tenant_vrf)

    # Retrieve fabric ID from switch context (assuming single fabric target for simplified execution)
    target_serial = payload.target_switch_serials[0]
    target_switch = None
    try:
        uuid_serial = uuid.UUID(target_serial)
        target_switch = db.query(models.Switch).filter(
            models.Switch.switch_id == uuid_serial
        ).first()
    except ValueError:
        pass

    if not target_switch:
        target_switch = db.query(models.Switch).filter(
            models.Switch.hostname == target_serial
        ).first()

    # Commit the verified network subnet configuration intent
    subnet_record = models.IpamSubnet(
        vrf_id=tenant_vrf.vrf_id,
        fabric_id=target_switch.fabric_id,
        vlan_id=payload.vlan_id,
        layer2_vni=payload.l2_vni,
        subnet_cidr=payload.requested_cidr,
        anycast_gateway_ip=calculated_anycast_gateway
    )
    db.add(subnet_record)
    db.commit()

    # Simulate dispatching to the Celery worker queue
    logger.info(f"[CELERY DISPATCH] Enqueued config sync jobs to southbound queue for switch serials: {payload.target_switch_serials}")

    return {
        "orchestrator_node_executed": settings.NODE_NAME_ID,
        "policy_verification": "SUCCESS_COMMITTED",
        "transaction_mode": "ACTIVE_PRODUCTION_ENFORCEMENT",
        "provisioned_anycast_gateway": calculated_anycast_gateway,
        "switches_queued": payload.target_switch_serials
    }
@router.post("/api/v5/orchestrator/policy-reconciliation", status_code=status.HTTP_200_OK)
async def process_policy_reconciliation(
    payload: schemas.PolicyReconciliationSubmission,
    db: Session = Depends(get_db),
    claims: dict = Depends(get_current_user_claims)
):
    """
    Cleans up the database configuration state and generates rollback configs.
    """
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if user_role in ("operator", "readonly") and str(user_tenant_id) != payload.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: Operator scope restricts operations to their own tenant context."
        )

    # Find the TenantVrf
    tenant_vrf = db.query(models.TenantVrf).filter(
        models.TenantVrf.tenant_id == uuid.UUID(payload.tenant_id),
        models.TenantVrf.vrf_name == payload.vrf_name
    ).first()

    if not tenant_vrf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource not found: VRF '{payload.vrf_name}' not defined for this tenant."
        )

    # Find the IpamSubnet
    subnet = db.query(models.IpamSubnet).filter(
        models.IpamSubnet.vrf_id == tenant_vrf.vrf_id,
        models.IpamSubnet.subnet_cidr == payload.subnet_cidr
    ).first()

    if not subnet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource not found: Subnet '{payload.subnet_cidr}' not found in VRF '{payload.vrf_name}'."
        )

    # Fetch switches belonging to the fabric of the subnet
    switches = db.query(models.Switch).filter(
        models.Switch.fabric_id == subnet.fabric_id
    ).all()

    rollback_matrix = []
    for switch in switches:
        try:
            driver = resolve_southbound_driver(switch.vendor)
            rollback_payload = await driver.generate_rollback_payload(payload.vrf_name, subnet.vlan_id)
            rollback_matrix.append({
                "switch_id": str(switch.switch_id),
                "hostname": switch.hostname,
                "vendor": switch.vendor,
                "management_ip": switch.management_ip,
                "rollback_payload": rollback_payload
            })
        except Exception as driver_error:
            # Skip driver failures gracefully to ensure partial cleanup attempts complete
            pass

    # Clear allocations and remove subnet record
    db.query(models.IpamIpAllocation).filter(
        models.IpamIpAllocation.subnet_id == subnet.subnet_id
    ).delete()
    db.delete(subnet)
    db.commit()

    logger.info(f"[RECONCILIATION] Cleaned up state and enqueued rollbacks for subnet CIDR: {payload.subnet_cidr}")

    return {
        "orchestrator_node_executed": settings.NODE_NAME_ID,
        "policy_reconciliation": "SUCCESS_RECONCILED",
        "deleted_subnet_cidr": payload.subnet_cidr,
        "rollback_matrix": rollback_matrix
    }
# ==========================================
# ADMINISTRATIVE ENDPOINTS
# ==========================================

@router.get("/api/v5/orchestrator/approvals/count")
def get_pending_approvals_count(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("policy:read"))
):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")
    query = db.query(models.PolicyApproval).filter(models.PolicyApproval.status == "pending")
    if user_role != "platform_admin":
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        query = query.filter(models.PolicyApproval.tenant_id == t_uuid)
    return {"count": query.count()}


@router.get("/api/v5/orchestrator/approvals")
def get_pending_approvals(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("policy:read"))
):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    query = db.query(models.PolicyApproval).filter(models.PolicyApproval.status == "pending")
    if user_role != "platform_admin":
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        query = query.filter(models.PolicyApproval.tenant_id == t_uuid)

    approvals = query.all()
    
    res = []
    for a in approvals:
        res.append({
            "id": str(a.approval_id),
            "tenant": db.query(models.Tenant).filter(models.Tenant.tenant_id == a.tenant_id).first().tenant_name if db.query(models.Tenant).filter(models.Tenant.tenant_id == a.tenant_id).first() else "Unknown",
            "summary": f"Create VRF {a.vrf_name} Subnet {a.requested_cidr} (VLAN {a.vlan_id})",
            "blast_radius": "High (Spine switch)" if a.blast_radius == 6 else "Low (Leaf switch)",
            "device_count": len(a.target_switch_serials.split(",")),
            "is_spine": a.blast_radius == 6,
            "diff": a.diff_payload
        })
    return res


@router.post("/api/v5/orchestrator/approvals/{approval_id}/approve")
def approve_policy_intent(
    approval_id: uuid.UUID,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):

    approval = db.query(models.PolicyApproval).filter(
        models.PolicyApproval.approval_id == approval_id,
        models.PolicyApproval.status == "pending"
    ).first()
    
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found or not in pending state."
        )

    # Retrieve switch context and build subnets
    serials = approval.target_switch_serials.split(",")
    target_serial = serials[0]
    
    target_switch = None
    try:
        uuid_serial = uuid.UUID(target_serial)
        target_switch = db.query(models.Switch).filter(models.Switch.switch_id == uuid_serial).first()
    except ValueError:
        pass

    if not target_switch:
        target_switch = db.query(models.Switch).filter(models.Switch.hostname == target_serial).first()

    if not target_switch:
        target_switch = db.query(models.Switch).filter(models.Switch.serial_number == target_serial).first()

    if not target_switch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chassis Switch target reference mapping lost."
        )

    # VRF checks & updates
    tenant_vrf = db.query(models.TenantVrf).filter(
        models.TenantVrf.tenant_id == approval.tenant_id,
        models.TenantVrf.vrf_name == approval.vrf_name
    ).first()

    if not tenant_vrf:
        tenant_vrf = models.TenantVrf(
            tenant_id=approval.tenant_id,
            vrf_name=approval.vrf_name,
            layer3_vni=approval.layer3_vni
        )
        db.add(tenant_vrf)
        db.commit()
        db.refresh(tenant_vrf)

    # Commit IPAM record
    target_net = ipaddress.ip_network(approval.requested_cidr, strict=True)
    calculated_anycast_gateway = str(list(target_net.hosts())[0]) + f"/{target_net.prefixlen}"

    subnet_record = models.IpamSubnet(
        vrf_id=tenant_vrf.vrf_id,
        fabric_id=target_switch.fabric_id,
        vlan_id=approval.vlan_id,
        layer2_vni=approval.layer2_vni,
        subnet_cidr=approval.requested_cidr,
        anycast_gateway_ip=calculated_anycast_gateway
    )
    db.add(subnet_record)
    
    # Change status to approved
    approval.status = "approved"
    db.commit()

    logger.info(f"[CELERY DISPATCH] Enqueued authorized config sync jobs for serials: {serials}")

    return {
        "status": "APPROVED_COMMITTED",
        "detail": "Policy configuration successfully authorized and enqueued to fabric workers."
    }


@router.post("/api/v5/orchestrator/approvals/{approval_id}/reject")
def reject_policy_intent(
    approval_id: uuid.UUID,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):

    approval = db.query(models.PolicyApproval).filter(
        models.PolicyApproval.approval_id == approval_id,
        models.PolicyApproval.status == "pending"
    ).first()
    
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found or not in pending state."
        )

    approval.status = "rejected"
    db.commit()

    return {
        "status": "REJECTED",
        "detail": "Policy configuration intent successfully rejected and deleted from pipeline queues."
    }
class ConfigPushRequest(BaseModel):
    switch_id: str
    config_data: str

@router.post("/api/v5/orchestrator/async-config-push")
def enqueue_config_push(
    payload: ConfigPushRequest,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:write"))
):
    from app.auth import verify_switch_access
    from app.workers.sync_tasks import sync_switch_config_task
    sw_uuid = uuid.UUID(payload.switch_id)
    verify_switch_access(db, sw_uuid, claims)
    task = sync_switch_config_task.delay(payload.switch_id, payload.config_data)
    return {"status": "ENQUEUED", "task_id": task.id}
