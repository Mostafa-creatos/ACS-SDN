import os
import ipaddress
import jwt
import uuid
import bcrypt
from typing import List, Dict, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text

from .config import settings
from .db import get_db, Base, engine, SessionLocal
from . import models, schemas

LIFECYCLE_COMPLIANT = "compliant_active"
from .drivers.dell_os10 import DellOS10Driver
from .drivers.arista_eos import AristaEosDriver
from .admin_ui import ADMIN_HTML
from .routers import inventory, discovery, auth, users, tenants, vrfs
from .auth import security, get_current_user_claims, verify_switch_access
from .auth_permissions import require_permission

# Initialize FastAPI App
app = FastAPI(title="Enterprise SDN Controller — Core Ingress & Validation Orchestrator")

app.include_router(inventory.router)
app.include_router(discovery.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tenants.router)
app.include_router(vrfs.router)

def migrate_db_columns(engine):
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "switches" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("switches")]
        with engine.begin() as conn:
            if "model" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN model VARCHAR(100) DEFAULT 'C9300-48P'"))
            if "os_version" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN os_version VARCHAR(100) DEFAULT 'IOS XE 17.9.4'"))
            if "status" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN status VARCHAR(32) DEFAULT 'Up'"))
            if "uptime" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN uptime VARCHAR(100) DEFAULT '2 weeks 0 days 18 hours'"))
            if "serial_number" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN serial_number VARCHAR(128) DEFAULT ''"))
            if "location" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN location VARCHAR(255) DEFAULT 'Casablanca, Morocco'"))
            if "device_type" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN device_type VARCHAR(64) DEFAULT 'Switch'"))
            if "os_type" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN os_type VARCHAR(64) DEFAULT 'IOS-XE'"))
            if "client_tenant" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN client_tenant VARCHAR(128) DEFAULT 'AtlasWave Maroc Demo'"))
            if "last_collection_timestamp" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN last_collection_timestamp TIMESTAMP DEFAULT NULL"))
            if "credentials_status" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN credentials_status VARCHAR(64) DEFAULT 'Valid'"))
            if "ports_up" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN ports_up INTEGER DEFAULT 24"))
            if "ports_all" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN ports_all INTEGER DEFAULT 24"))
            if "chassis_status" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN chassis_status VARCHAR(64) DEFAULT 'Ready'"))
            if "running_config" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN running_config TEXT DEFAULT ''"))
            if "startup_config" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN startup_config TEXT DEFAULT ''"))
            # Dell OS10 specific columns
            if "service_tag" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN service_tag VARCHAR(64) DEFAULT ''"))
            if "part_number" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN part_number VARCHAR(64) DEFAULT ''"))
            if "ppid" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN ppid VARCHAR(64) DEFAULT ''"))
            if "express_service_code" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN express_service_code VARCHAR(64) DEFAULT ''"))
            if "management_mac" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN management_mac VARCHAR(17) DEFAULT ''"))
            if "os10_license_status" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN os10_license_status VARCHAR(32) DEFAULT 'Licensed'"))
            if "temperature" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN temperature VARCHAR(16) DEFAULT 'Normal'"))
            if "cpu_usage" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN cpu_usage FLOAT DEFAULT NULL"))
            if "memory_usage" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN memory_usage FLOAT DEFAULT NULL"))

        # Migrate device_interfaces columns
        if "device_interfaces" in inspector.get_table_names():
            iface_cols = [c["name"] for c in inspector.get_columns("device_interfaces")]
            with engine.begin() as conn:
                if "switchport_mode" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN switchport_mode VARCHAR(16) DEFAULT 'trunk'"))
                if "transceiver_type" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN transceiver_type VARCHAR(32) DEFAULT NULL"))
                if "transceiver_serial" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN transceiver_serial VARCHAR(64) DEFAULT NULL"))
                if "transceiver_qualified" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN transceiver_qualified BOOLEAN DEFAULT TRUE"))
                if "mtu" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN mtu INTEGER DEFAULT 9216"))
                if "errors_in" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN errors_in BIGINT DEFAULT 0"))
                if "errors_out" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN errors_out BIGINT DEFAULT 0"))
                if "discards_in" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN discards_in BIGINT DEFAULT 0"))
                if "discards_out" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN discards_out BIGINT DEFAULT 0"))
                if "last_flapped" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN last_flapped TIMESTAMP DEFAULT NULL"))

# Ensure database tables exist on application startup (convenient local bootstrapping)
@app.on_event("startup")
def startup_db_configure():
    # In production, database migrations would be handled via Alembic
    Base.metadata.create_all(bind=engine)
    migrate_db_columns(engine)

    
    # Seed default developer records if database is empty
    db = SessionLocal()
    try:
        # 1. Seed tenant, fabric, and blueprint if empty
        if db.query(models.Tenant).count() == 0:
            print("[SDN SEED] Seeding default tenant, fabric, and blueprint...")
            # 1. Tenant
            tenant = models.Tenant(
                tenant_id=uuid.UUID("11111111-1111-1111-1111-11111111111a"),
                tenant_name="Acme-Enterprise"
            )
            db.add(tenant)
            
            # 2. Fabric Blueprint
            blueprint = models.FabricBlueprint(
                blueprint_id=uuid.UUID("22222222-2222-2222-2222-22222222222b"),
                name="L3-Leaf-Spine-Dev",
                underlay_p2p_cidr="10.100.0.0/16",
                loopback_cidr="10.200.0.0/16",
                vtep_cidr="10.250.0.0/16",
                system_mtu=9216
            )
            db.add(blueprint)
            db.flush()
            
            # 3. Fabric
            fabric = models.Fabric(
                fabric_id=uuid.UUID("33333333-3333-3333-3333-33333333333c"),
                fabric_name="DataCenter-East", 
                blueprint_id=blueprint.blueprint_id, 
                global_bgp_asn=65000
            )
            db.add(fabric)
            db.commit()
            print("[SDN SEED] Default tenant and fabric seeding completed.")

        # 2. Seed detailed multi-vendor switches if missing
        if db.query(models.Switch).filter(models.Switch.hostname == "AWM-CAS-AGG-SW02").count() == 0:
            print("[SDN SEED] Seeding detailed multi-vendor inventory switches...")
            # Find active fabric ID
            fabric = db.query(models.Fabric).filter(models.Fabric.fabric_name == "DataCenter-East").first()
            fabric_id = fabric.fabric_id if fabric else uuid.UUID("33333333-3333-3333-3333-33333333333c")

            # 4. Switches (Seeding the Dell Spines and Nokia Leafs + detailed inventory switches)
            spine1 = models.Switch(
                switch_id=uuid.uuid4(),
                fabric_id=fabric_id,
                hostname="spine-01",
                management_ip="172.20.20.10",
                vendor="dell_os10",
                role="spine",
                local_bgp_asn=65000,
                loopback_0_ip="10.200.1.10",
                vtep_ip="10.250.1.10",
                lifecycle_status="compliant_active",
                model="S5248F-ON",
                os_version="10.5.2.0",
                location="Casablanca, Morocco",
                serial_number="SN-DELL-SPINE1",
                service_tag="6KH8XZ2",
                part_number="S5248F-ON",
                ppid="TW-0GKK8W-28298-713-0026",
                express_service_code="909 144 413 2",
                management_mac="90:B1:1C:F4:A5:8C",
                os10_license_status="Licensed",
                temperature="Normal",
                device_type="Router",
                os_type="OS10",
                client_tenant="Acme-Enterprise",
                ports_up=8,
                ports_all=48,
                chassis_status="Ready"
            )
            spine2 = models.Switch(
                switch_id=uuid.uuid4(),
                fabric_id=fabric_id,
                hostname="spine-02",
                management_ip="172.20.20.13",
                vendor="dell_os10",
                role="spine",
                local_bgp_asn=65000,
                loopback_0_ip="10.200.1.13",
                vtep_ip="10.250.1.13",
                lifecycle_status="compliant_active",
                model="S5248F-ON",
                os_version="10.5.2.0",
                location="Casablanca, Morocco",
                serial_number="SN-DELL-SPINE2",
                service_tag="7PI8Z3K",
                part_number="S5248F-ON",
                ppid="TW-0GKK8W-28298-713-0027",
                express_service_code="909 144 413 3",
                management_mac="90:B1:1C:F4:A5:8D",
                os10_license_status="Licensed",
                temperature="Normal",
                device_type="Router",
                os_type="OS10",
                client_tenant="Acme-Enterprise",
                ports_up=8,
                ports_all=48,
                chassis_status="Ready"
            )
            leaf1 = models.Switch(
                switch_id=uuid.uuid4(),
                fabric_id=fabric_id,
                hostname="leaf-01",
                management_ip="172.20.20.11",
                vendor="nokia",
                role="leaf",
                local_bgp_asn=65001,
                loopback_0_ip="10.200.1.11",
                vtep_ip="10.250.1.11",
                lifecycle_status="compliant_active",
                model="7220 IXR-D2",
                os_version="23.10.1",
                location="Casablanca, Morocco",
                serial_number="SN-NOKIA-LEAF1",
                device_type="Switch",
                os_type="SR-Linux",
                client_tenant="Acme-Enterprise",
                ports_up=16,
                ports_all=32,
                chassis_status="Ready"
            )
            leaf2 = models.Switch(
                switch_id=uuid.uuid4(),
                fabric_id=fabric_id,
                hostname="leaf-02",
                management_ip="172.20.20.12",
                vendor="nokia",
                role="leaf",
                local_bgp_asn=65002,
                loopback_0_ip="10.200.1.12",
                vtep_ip="10.250.1.12",
                lifecycle_status="compliant_active",
                model="7220 IXR-D2",
                os_version="23.10.1",
                location="Rabat, Morocco",
                serial_number="SN-NOKIA-LEAF2",
                device_type="Switch",
                os_type="SR-Linux",
                client_tenant="Acme-Enterprise",
                ports_up=16,
                ports_all=32,
                chassis_status="Ready"
            )
            leaf3 = models.Switch(
                switch_id=uuid.uuid4(),
                fabric_id=fabric_id,
                hostname="leaf-03",
                management_ip="172.20.20.14",
                vendor="nokia",
                role="leaf",
                local_bgp_asn=65003,
                loopback_0_ip="10.200.1.14",
                vtep_ip="10.250.1.14",
                lifecycle_status="compliant_active",
                model="7220 IXR-D2",
                os_version="23.10.1",
                location="Casablanca, Morocco",
                serial_number="SN-NOKIA-LEAF3",
                device_type="Switch",
                os_type="SR-Linux",
                client_tenant="Acme-Enterprise",
                ports_up=16,
                ports_all=32,
                chassis_status="Ready"
            )
            leaf4 = models.Switch(
                switch_id=uuid.uuid4(),
                fabric_id=fabric_id,
                hostname="leaf-04",
                management_ip="172.20.20.15",
                vendor="nokia",
                role="leaf",
                local_bgp_asn=65004,
                loopback_0_ip="10.200.1.15",
                vtep_ip="10.250.1.15",
                lifecycle_status="compliant_active",
                model="7220 IXR-D2",
                os_version="23.10.1",
                location="Agadir, Morocco",
                serial_number="SN-NOKIA-LEAF4",
                device_type="Switch",
                os_type="SR-Linux",
                client_tenant="Acme-Enterprise",
                ports_up=16,
                ports_all=32,
                chassis_status="Ready"
            )
            leaf5 = models.Switch(
                switch_id=uuid.uuid4(),
                fabric_id=fabric_id,
                hostname="leaf-05",
                management_ip="172.20.20.16",
                vendor="nokia",
                role="leaf",
                local_bgp_asn=65005,
                loopback_0_ip="10.200.1.16",
                vtep_ip="10.250.1.16",
                lifecycle_status="compliant_active",
                model="7220 IXR-D2",
                os_version="23.10.1",
                location="Rabat, Morocco",
                serial_number="SN-NOKIA-LEAF5",
                device_type="Switch",
                os_type="SR-Linux",
                client_tenant="Acme-Enterprise",
                ports_up=16,
                ports_all=32,
                chassis_status="Ready"
            )
            leaf6 = models.Switch(
                switch_id=uuid.uuid4(),
                fabric_id=fabric_id,
                hostname="leaf-06",
                management_ip="172.20.20.17",
                vendor="nokia",
                role="leaf",
                local_bgp_asn=65006,
                loopback_0_ip="10.200.1.17",
                vtep_ip="10.250.1.17",
                lifecycle_status="compliant_active",
                model="7220 IXR-D2",
                os_version="23.10.1",
                location="Tangier, Morocco",
                serial_number="SN-NOKIA-LEAF6",
                device_type="Switch",
                os_type="SR-Linux",
                client_tenant="Acme-Enterprise",
                ports_up=16,
                ports_all=32,
                chassis_status="Ready"
            )

            db.add(spine1)
            db.add(spine2)
            db.add(leaf1)
            db.add(leaf2)
            db.add(leaf3)
            db.add(leaf4)
            db.add(leaf5)
            db.add(leaf6)
            db.commit()
            print("[SDN SEED] Seeding completed. Tenant ID: 11111111-1111-1111-1111-11111111111a available.")


        if db.query(models.User).count() == 0:
            print("[SDN SEED] Seeding default users (admin, operator, auditor)...")
            import secrets
            admin_pwd_str = os.getenv("SEED_ADMIN_PASSWORD", secrets.token_urlsafe(24))
            operator_pwd_str = os.getenv("SEED_OPERATOR_PASSWORD", secrets.token_urlsafe(24))
            auditor_pwd_str = os.getenv("SEED_AUDITOR_PASSWORD", secrets.token_urlsafe(24))
            admin_pwd = bcrypt.hashpw(admin_pwd_str.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            operator_pwd = bcrypt.hashpw(operator_pwd_str.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            auditor_pwd = bcrypt.hashpw(auditor_pwd_str.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

            # Try to get the Acme-Enterprise tenant
            acme_tenant = db.query(models.Tenant).filter(models.Tenant.tenant_name == "Acme-Enterprise").first()
            acme_tenant_id = acme_tenant.tenant_id if acme_tenant else uuid.UUID("11111111-1111-1111-1111-11111111111a")

            admin_user = models.User(
                username="admin",
                hashed_password=admin_pwd,
                role="Platform Admin",
                tenant_id=None
            )
            operator_user = models.User(
                username="operator",
                hashed_password=operator_pwd,
                role="Tenant Operator",
                tenant_id=acme_tenant_id
            )
            auditor_user = models.User(
                username="auditor",
                hashed_password=auditor_pwd,
                role="Tenant Auditor",
                tenant_id=acme_tenant_id
            )
            db.add(admin_user)
            db.add(operator_user)
            db.add(auditor_user)
            db.commit()
            print(f"[SDN SEED] Users seeding completed.")
            print(f"[SDN SEED] Generated admin password: {admin_pwd_str}")
            print(f"[SDN SEED] Generated operator password: {operator_pwd_str}")
            print(f"[SDN SEED] Generated auditor password: {auditor_pwd_str}")
    except Exception as e:
        db.rollback()
        print(f"[SDN SEED] Failed to seed database: {e}")
    finally:
        db.close()


@app.on_event("startup")
async def start_gnmi_discovery_background():
    import asyncio
    from .workers.sync_tasks import start_periodic_discovery_loop, start_periodic_telemetry_loop
    print("[gNMI STARTUP] Initiating background topology discovery and telemetry loops...")
    asyncio.create_task(start_periodic_discovery_loop(30))
    asyncio.create_task(start_periodic_telemetry_loop(10))


def resolve_southbound_driver(vendor: str):
    v = vendor.lower()
    if v == "dell_os10":
        return DellOS10Driver()
    elif v == "arista_eos":
        return AristaEosDriver()
    elif v in ["nokia", "nokia_srlinux", "timetra"]:
        from .drivers.nokia_srlinux import NokiaSrlinuxDriver
        return NokiaSrlinuxDriver()
    else:
        raise ValueError(f"Southbound network driver not implemented for vendor: {vendor}")

@app.post("/api/v5/orchestrator/policy-enforcement", status_code=status.HTTP_202_ACCEPTED)
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
    if user_role == "Tenant Operator" and str(user_tenant_id) != payload.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: Tenant Operator scope restricts operations to their own tenant context."
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
    print(f"[CELERY DISPATCH] Enqueued config sync jobs to southbound queue for switch serials: {payload.target_switch_serials}")

    return {
        "orchestrator_node_executed": settings.NODE_NAME_ID,
        "policy_verification": "SUCCESS_COMMITTED",
        "transaction_mode": "ACTIVE_PRODUCTION_ENFORCEMENT",
        "provisioned_anycast_gateway": calculated_anycast_gateway,
        "switches_queued": payload.target_switch_serials
    }

@app.post("/api/v5/orchestrator/policy-reconciliation", status_code=status.HTTP_200_OK)
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

    if user_role == "Tenant Operator" and str(user_tenant_id) != payload.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: Tenant Operator scope restricts operations to their own tenant context."
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

    print(f"[RECONCILIATION] Cleaned up state and enqueued rollbacks for subnet CIDR: {payload.subnet_cidr}")

    return {
        "orchestrator_node_executed": settings.NODE_NAME_ID,
        "policy_reconciliation": "SUCCESS_RECONCILED",
        "deleted_subnet_cidr": payload.subnet_cidr,
        "rollback_matrix": rollback_matrix
    }


# ==========================================
# ADMINISTRATIVE ENDPOINTS
# ==========================================

@app.post("/api/v5/admin/tenants", status_code=status.HTTP_201_CREATED)
def create_tenant(
    payload: schemas.TenantCreate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("tenants:create"))
):
    # Check if tenant name already exists
    existing = db.query(models.Tenant).filter(models.Tenant.tenant_name == payload.tenant_name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant with this name already exists."
        )
    
    new_tenant = models.Tenant(tenant_name=payload.tenant_name)
    db.add(new_tenant)
    db.commit()
    db.refresh(new_tenant)
    return {"tenant_id": str(new_tenant.tenant_id), "tenant_name": new_tenant.tenant_name}


@app.get("/api/v5/orchestrator/approvals")
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


@app.post("/api/v5/orchestrator/approvals/{approval_id}/approve")
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

    print(f"[CELERY DISPATCH] Enqueued authorized config sync jobs for serials: {serials}")

    return {
        "status": "APPROVED_COMMITTED",
        "detail": "Policy configuration successfully authorized and enqueued to fabric workers."
    }


@app.post("/api/v5/orchestrator/approvals/{approval_id}/reject")
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


@app.get("/", response_class=HTMLResponse)
async def serve_admin_dashboard():
    if os.path.exists("frontend/dist/index.html"):
        from fastapi.responses import FileResponse
        return FileResponse("frontend/dist/index.html")
    return ADMIN_HTML

# Mount React frontend static assets if the folder is present
from fastapi.staticfiles import StaticFiles
if os.path.exists("frontend/dist"):
    app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")

@app.get("/api/v5/admin/audit-logs")
def get_audit_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("audit:read"))
):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(limit).all()
    return [
        {
            "audit_id": str(l.audit_id),
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
            "user_id": str(l.user_id) if l.user_id else None,
            "tenant_id": str(l.tenant_id) if l.tenant_id else None,
            "action": l.action,
            "resource": l.resource,
            "status": l.status,
            "detail": l.detail,
        }
        for l in logs
    ]


@app.get("/api/v5/admin/stats")
def get_admin_stats(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")
    if user_role == "platform_admin":
        return {
            "tenants_count": db.query(models.Tenant).count(),
            "fabrics_count": db.query(models.Fabric).count(),
            "switches_count": db.query(models.Switch).count(),
            "subnets_count": db.query(models.IpamSubnet).count(),
            "ztp_pool_count": db.query(models.ZtpDiscoveryPool).count(),
        }
    else:
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        subnets_count = db.query(models.IpamSubnet).join(models.TenantVrf).filter(models.TenantVrf.tenant_id == t_uuid).count()
        fabrics_count = db.query(models.Fabric).join(models.IpamSubnet).join(models.TenantVrf).filter(models.TenantVrf.tenant_id == t_uuid).distinct().count()
        switches_count = db.query(models.Switch).join(models.Fabric).join(models.IpamSubnet).join(models.TenantVrf).filter(models.TenantVrf.tenant_id == t_uuid).distinct().count()
        return {
            "tenants_count": 1,
            "fabrics_count": fabrics_count,
            "switches_count": switches_count,
            "subnets_count": subnets_count,
            "ztp_pool_count": 0,
        }


@app.get("/api/v5/admin/tenants")
def get_admin_tenants(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    tenants = db.query(models.Tenant).all()
    return [{"tenant_id": str(t.tenant_id), "tenant_name": t.tenant_name} for t in tenants]


@app.get("/api/v5/admin/switches")
def get_admin_switches(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    switches = db.query(models.Switch).all()
    return [
        {
            "switch_id": str(s.switch_id),
            "hostname": s.hostname,
            "management_ip": s.management_ip,
            "vendor": s.vendor,
            "role": s.role,
            "local_bgp_asn": s.local_bgp_asn,
            "loopback_0_ip": s.loopback_0_ip,
            "vtep_ip": s.vtep_ip,
            "lifecycle_status": s.lifecycle_status,
        } for s in switches
    ]


@app.get("/api/v5/admin/ztp-pool")
def get_admin_ztp_pool(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    ztp_devices = db.query(models.ZtpDiscoveryPool).all()
    return [
        {
            "discovery_id": str(z.discovery_id),
            "mac_address": z.mac_address,
            "serial_number": z.serial_number,
            "hardware_vendor": z.hardware_vendor,
            "hardware_model": z.hardware_model,
            "current_dhcp_ip": z.current_dhcp_ip,
            "base_os_version": z.base_os_version,
        } for z in ztp_devices
    ]


@app.get("/api/v5/admin/subnets")
def get_admin_subnets(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    subnets = db.query(models.IpamSubnet).all()
    res = []
    for s in subnets:
        vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == s.vrf_id).first()
        # Calculate real dynamic stats
        try:
            net = ipaddress.ip_network(s.subnet_cidr)
            total_ips = net.num_addresses - 2 if net.version == 4 else 254
            if total_ips < 1: total_ips = 1
        except Exception:
            total_ips = 254
            
        used_ips = db.query(models.IpamIpAllocation).filter(models.IpamIpAllocation.subnet_id == s.subnet_id).count()
        res.append({
            "subnet_id": str(s.subnet_id),
            "vrf_name": vrf.vrf_name if vrf else "N/A",
            "tenant_id": str(vrf.tenant_id) if vrf else "N/A",
            "vlan_id": s.vlan_id,
            "layer2_vni": s.layer2_vni,
            "layer3_vni": vrf.layer3_vni if vrf else 0,
            "subnet_cidr": s.subnet_cidr,
            "anycast_gateway_ip": s.anycast_gateway_ip,
            "total_ips": total_ips,
            "used_ips": used_ips
        })
    return res


@app.get("/api/v5/ipam/search")
def search_ipam_ip(ip: str, db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    """Search for an IP address in discovered endpoints and static reservations."""
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid IP address format.")

    # 1. Search in discovered endpoints (live/active state)
    discovered_ep = db.query(models.DiscoveredEndpoint).filter(models.DiscoveredEndpoint.ip_address == ip).first()
    if discovered_ep:
        sw = db.query(models.Switch).filter(models.Switch.switch_id == discovered_ep.switch_id).first()
        return {
            "ip": ip,
            "switch_name": sw.hostname if sw else "unknown",
            "interface_name": discovered_ep.port,
            "vlan": discovered_ep.vlan_id,
            "vrf": "L2 Bridged Network",
            "last_seen": discovered_ep.last_seen.isoformat(),
            "status": "assigned"
        }

    # 2. Search in IPAM IP allocations (static/dynamic reservations)
    allocation = db.query(models.IpamIpAllocation).filter(models.IpamIpAllocation.ip_address == ip).first()
    if allocation:
        subnet = db.query(models.IpamSubnet).filter(models.IpamSubnet.subnet_id == allocation.subnet_id).first()
        vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == subnet.vrf_id).first() if subnet else None
        return {
            "ip": ip,
            "switch_name": "IPAM Controller Pool",
            "interface_name": "logical",
            "vlan": subnet.vlan_id if subnet else 1,
            "vrf": vrf.vrf_name if vrf else "unknown",
            "last_seen": allocation.allocated_at.isoformat(),
            "status": "assigned"
        }

    # 3. Otherwise return unassigned structure
    return {
        "ip": ip,
        "status": "unassigned"
    }


@app.get("/api/v5/admin/topology")
async def get_admin_topology(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    try:
        edges = db.query(models.TopologyEdge).filter(models.TopologyEdge.state == "up").all()
        if not edges:
            # Fallback list matching default topology to keep visual map working immediately
            return [
                {"ip": "172.20.20.10", "port": "ethernet-1/1", "remote_ip": "172.20.20.11", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
                {"ip": "172.20.20.10", "port": "ethernet-1/2", "remote_ip": "172.20.20.12", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
                {"ip": "172.20.20.11", "port": "ethernet-1/1", "remote_ip": "172.20.20.10", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
                {"ip": "172.20.20.12", "port": "ethernet-1/1", "remote_ip": "172.20.20.10", "remote_port": "ethernet-1/2", "protocol": "LLDP", "state": "up"},
                {"ip": "172.20.20.10", "port": "bgp-peer-1", "remote_ip": "172.20.20.11", "remote_port": "bgp-peer-1", "protocol": "BGP", "state": "up"},
                {"ip": "172.20.20.10", "port": "bgp-peer-2", "remote_ip": "172.20.20.12", "remote_port": "bgp-peer-1", "protocol": "BGP", "state": "up"},
            ]
        res = []
        for e in edges:
            local_sw = db.query(models.Switch).filter(models.Switch.hostname == e.local_switch).first()
            remote_sw = db.query(models.Switch).filter(models.Switch.hostname == e.remote_switch).first()
            if local_sw and remote_sw:
                res.append({
                    "ip": local_sw.management_ip,
                    "port": e.local_port,
                    "remote_ip": remote_sw.management_ip,
                    "remote_port": e.remote_port,
                    "protocol": e.protocol,
                    "state": e.state
                })
        return res
    except Exception as e:
        print("[ADMIN TOPOLOGY] DB fetch failed, returning fallback:", e)
        return [
            {"ip": "172.20.20.10", "port": "ethernet-1/1", "remote_ip": "172.20.20.11", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
            {"ip": "172.20.20.10", "port": "ethernet-1/2", "remote_ip": "172.20.20.12", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
            {"ip": "172.20.20.11", "port": "ethernet-1/1", "remote_ip": "172.20.20.10", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
            {"ip": "172.20.20.12", "port": "ethernet-1/1", "remote_ip": "172.20.20.10", "remote_port": "ethernet-1/2", "protocol": "LLDP", "state": "up"},
            {"ip": "172.20.20.10", "port": "bgp-peer-1", "remote_ip": "172.20.20.11", "remote_port": "bgp-peer-1", "protocol": "BGP", "state": "up"},
            {"ip": "172.20.20.10", "port": "bgp-peer-2", "remote_ip": "172.20.20.12", "remote_port": "bgp-peer-1", "protocol": "BGP", "state": "up"},
        ]

@app.get("/api/v5/topology/graph")
async def get_topology_graph(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    """
    Returns the real discovered topology nodes and edges formatted for Cytoscape.js.
    """
    try:
        switches = db.query(models.Switch).all()
        nodes_list = []
        switch_hostname_to_id = {}
        
        for sw in switches:
            sw_id_str = str(sw.switch_id)
            switch_hostname_to_id[sw.hostname] = sw_id_str
            
            # Map status representation
            status_map = "compliant_active"
            if sw.lifecycle_status == "drifted" or sw.status == "Drifted":
                status_map = "drifted"
            elif sw.status != "Up":
                status_map = "discovered"
                
            nodes_list.append({
                "id": sw_id_str,
                "label": sw.hostname,
                "ip": sw.management_ip,
                "status": status_map,
                "role": sw.role,
                "vendor": sw.vendor or "generic",
                "model": sw.model or "C9300-48P",
                "interfacesCount": sw.ports_all or 24
            })
            
        edges = db.query(models.TopologyEdge).filter(models.TopologyEdge.state == "up").all()
        edges_list = []
        
        for e in edges:
            source_id = switch_hostname_to_id.get(e.local_switch)
            target_id = switch_hostname_to_id.get(e.remote_switch)
            if source_id and target_id:
                edge_id = str(e.edge_id)
                edges_list.append({
                    "id": edge_id,
                    "source": source_id,
                    "target": target_id,
                    "sourcePort": e.local_port,
                    "targetPort": e.remote_port,
                    "protocol": e.protocol or "LLDP",
                    "label": f"{e.local_port} <-> {e.remote_port}"
                })
                
        return {
            "nodes": nodes_list,
            "edges": edges_list
        }
    except Exception as err:
        print("[TOPOLOGY GRAPH] Failed to build graph data:", err)
        return {"nodes": [], "edges": []}



@app.post("/api/v5/admin/sync-netdisco")
@app.post("/api/v5/admin/sync-gnmi")
async def trigger_admin_sync(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    from .workers.sync_tasks import run_topology_discovery_sync
    await run_topology_discovery_sync(db)
    return {"status": "SYNC_SUCCESSFUL"}


from pydantic import BaseModel
class DiscoverPayload(BaseModel):
    ip: str

@app.post("/api/v5/admin/trigger-discover")
async def trigger_admin_discover(payload: DiscoverPayload, db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):

    from .telemetry.gnmi_client import get_switch_lldp, parse_local_device_info
    import asyncio
    try:
        data = await asyncio.to_thread(get_switch_lldp, payload.ip)
        if not data:
            raise HTTPException(status_code=400, detail=f"Failed to connect to switch at {payload.ip} via gNMI")
            
        info = parse_local_device_info(data, payload.ip)
        if not info or not info.get("hostname"):
            raise HTTPException(status_code=400, detail=f"Invalid LLDP data returned from {payload.ip}")
            
        from .models import ZtpDiscoveryPool
        serial = f"SN-NOKIA-{info['hostname'].upper()}"
        mac = info["mac"] or "00:11:22:33:44:55"
        
        discovery_record = db.query(ZtpDiscoveryPool).filter(
            (ZtpDiscoveryPool.serial_number == serial) |
            (ZtpDiscoveryPool.mac_address == mac)
        ).first()
        
        if discovery_record:
            discovery_record.current_dhcp_ip = payload.ip
            discovery_record.base_os_version = info["os"]
        else:
            new_record = ZtpDiscoveryPool(
                serial_number=serial,
                mac_address=mac,
                hardware_vendor="nokia",
                hardware_model="7220 IXR-D2",
                current_dhcp_ip=payload.ip,
                base_os_version=info["os"] or "SRLinux"
            )
            db.add(new_record)
        db.commit()
        return {"status": "DISCOVERY_SUCCESS", "output": f"Successfully discovered switch {info['hostname']} ({payload.ip})"}
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Discovery error: {str(e)}")

# ==========================================
# NATIVE CONFIG & COMPLIANCE & TELEMETRY ENDPOINTS
# ==========================================

@app.post("/api/v5/visibility/snapshots", status_code=status.HTTP_201_CREATED)
def create_snapshot(
    switch_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:write"))
):
    sw_uuid = uuid.UUID(switch_id)
    verify_switch_access(db, sw_uuid, claims)
    
    from .workers.config_lifecycle import take_config_snapshot
    try:
        username = claims.get("username") or claims.get("email") or claims.get("role", "system")
        snap = take_config_snapshot(db, sw_uuid, username)
        return {"status": "SNAPSHOT_TAKEN", "snapshot_id": str(snap.snapshot_id), "hash": snap.config_hash}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/v5/visibility/snapshots")
def list_snapshots(switch_id: Optional[str] = None, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    
    query = db.query(models.ConfigSnapshot)
    if switch_id:
        sw_uuid = uuid.UUID(switch_id)
        verify_switch_access(db, sw_uuid, claims)
        query = query.filter(models.ConfigSnapshot.switch_id == sw_uuid)
        
    snaps = query.order_by(models.ConfigSnapshot.taken_at.desc()).all()
    res = []
    for s in snaps:
        sw = db.query(models.Switch).filter(models.Switch.switch_id == s.switch_id).first()
        res.append({
            "snapshot_id": str(s.snapshot_id),
            "switch_id": str(s.switch_id),
            "switch_hostname": sw.hostname if sw else "unknown",
            "taken_at": s.taken_at.isoformat(),
            "config_hash": s.config_hash,
            "taken_by": s.taken_by,
            "raw_config": s.raw_config
        })
    return res

class RollbackRequest(BaseModel):
    snapshot_id: str
    dry_run: bool = True

@app.post("/api/v5/visibility/rollback")
def trigger_rollback(
    payload: RollbackRequest,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("rollback:run"))
):
    from .workers.config_lifecycle import restore_config_snapshot
        
    snap = db.query(models.ConfigSnapshot).filter(models.ConfigSnapshot.snapshot_id == uuid.UUID(payload.snapshot_id)).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
        
    verify_switch_access(db, snap.switch_id, claims)
    
    try:
        res = restore_config_snapshot(db, uuid.UUID(payload.snapshot_id), claims, payload.dry_run)
        return res
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class AcceptDriftPayload(BaseModel):
    switch_id: str

@app.post("/api/v5/visibility/accept-drift")
def accept_switch_drift(
    payload: AcceptDriftPayload,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("rollback:run"))
):
    sw_uuid = uuid.UUID(payload.switch_id)
    verify_switch_access(db, sw_uuid, claims)
    
    switch = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
    if not switch:
        raise HTTPException(status_code=404, detail="Switch not found.")
        
    if not switch.running_config:
        raise HTTPException(status_code=400, detail="No live running configuration available to accept.")
        
    # Create new snapshot capturing the current running config as the baseline
    import hashlib
    import datetime
    
    raw_config = switch.running_config
    config_hash = hashlib.sha256(raw_config.encode('utf-8')).hexdigest()
    
    snapshot = models.ConfigSnapshot(
        snapshot_id=uuid.uuid4(),
        switch_id=sw_uuid,
        taken_at=datetime.datetime.utcnow(),
        raw_config=raw_config,
        config_hash=config_hash,
        is_baseline=True,
        taken_by=claims.get("username") or claims.get("email") or "operator"
    )
    db.add(snapshot)
    
    # Update switch status
    switch.configuration_checksum = config_hash
    switch.lifecycle_status = LIFECYCLE_COMPLIANT
    db.commit()
    
    return {
        "status": "DRIFT_ACCEPTED",
        "snapshot_id": str(snapshot.snapshot_id),
        "config_hash": config_hash
    }

@app.post("/api/v5/visibility/compliance/run")
def trigger_compliance_run(db: Session = Depends(get_db), claims: dict = Depends(require_permission("compliance:run"))):
    from .workers.config_lifecycle import run_compliance_check
    run = run_compliance_check(db)
    import json
    return {
        "run_id": str(run.run_id),
        "status": run.status,
        "started_at": run.started_at.isoformat(),
        "summary": json.loads(run.summary) if run.summary else {}
    }

@app.get("/api/v5/visibility/compliance/latest")
def get_latest_compliance(db: Session = Depends(get_db), claims: dict = Depends(require_permission("compliance:run"))):
    
    run = db.query(models.ComplianceRun).order_by(models.ComplianceRun.started_at.desc()).first()
    if not run:
        return {"status": "NO_RUNS_EVALUATED"}
    import json
    
    query = db.query(models.ComplianceFinding).filter(models.ComplianceFinding.compliance_run_id == run.run_id)
    findings = query.all()
    res = []
    for f in findings:
        sw = db.query(models.Switch).filter(models.Switch.switch_id == f.switch_id).first()
        res.append({
            "finding_id": str(f.finding_id),
            "switch_id": str(f.switch_id),
            "switch_hostname": sw.hostname if sw else "unknown",
            "rule_name": f.rule_name,
            "severity": f.severity,
            "detail": f.detail
        })
    return {
        "run_id": str(run.run_id),
        "started_at": run.started_at.isoformat(),
        "status": run.status,
        "summary": json.loads(run.summary) if run.summary else {},
        "findings": res
    }

@app.get("/api/v5/visibility/endpoints")
def get_discovered_endpoints(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    
    endpoints = db.query(models.DiscoveredEndpoint).order_by(models.DiscoveredEndpoint.last_seen.desc()).all()

    def _is_real_host_mac(mac: str) -> bool:
        """Filter out multicast, broadcast, all-zero MACs and known internal
        Nokia control-plane MACs.
        We do NOT filter locally-administered bit because Containerlab assigns
        those to real client containers.
        NOTE: Containerlab uses aa:c1:ab prefix for ALL device MACs including
        real client containers, so we do NOT filter it."""
        try:
            parts = mac.replace('-', ':').replace('.', ':').lower().strip().split(':')
            if len(parts) != 6:
                return False
            first = int(parts[0], 16)
            # Standard multicast (LSB of first byte = 1)
            if first & 0x01:
                return False
            # All zeros
            if all(p == '00' for p in parts):
                return False
            # Broadcast
            if all(p == 'ff' for p in parts):
                return False
            # Nokia internal control-plane pattern: last 3 octets are ff:00:01 or ff:00:02
            if parts[3] == 'ff' and parts[4] == '00' and parts[5] in ('01', '02'):
                return False
            return True
        except Exception:
            return False

    res = []
    for ep in endpoints:
        if not _is_real_host_mac(ep.mac_address):
            continue
        # Allow endpoints without IP address (frontend displays MAC suffix as fallback)
        sw = db.query(models.Switch).filter(models.Switch.switch_id == ep.switch_id).first()
        res.append({
            "endpoint_id": str(ep.endpoint_id),
            "mac_address": ep.mac_address,
            "ip_address": ep.ip_address,
            "vlan_id": ep.vlan_id,
            "port": ep.port,
            "switch_hostname": sw.hostname if sw else "unknown",
            "first_seen": ep.first_seen.isoformat(),
            "last_seen": ep.last_seen.isoformat()
        })
    return res

@app.get("/api/v5/visibility/telemetry")
def get_telemetry_metrics(
    switch_id: Optional[str] = None,
    metric_name: Optional[str] = None,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    query = db.query(models.TelemetryMetric)
    if switch_id:
        sw_uuid = uuid.UUID(switch_id)
        verify_switch_access(db, sw_uuid, claims)
        query = query.filter(models.TelemetryMetric.switch_id == sw_uuid)
    elif user_role != "platform_admin":
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        allowed_switch_ids = db.query(models.Switch.switch_id).join(
            models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
        ).join(
            models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).subquery()
        query = query.filter(models.TelemetryMetric.switch_id.in_(db.query(allowed_switch_ids.c.switch_id)))

    if metric_name:
        query = query.filter(models.TelemetryMetric.metric_name == metric_name)
    metrics = query.order_by(models.TelemetryMetric.timestamp.desc()).limit(100).all()
    res = []
    for m in metrics:
        sw = db.query(models.Switch).filter(models.Switch.switch_id == m.switch_id).first()
        res.append({
            "metric_id": str(m.metric_id),
            "switch_id": str(m.switch_id),
            "switch_hostname": sw.hostname if sw else "unknown",
            "metric_name": m.metric_name,
            "metric_value": m.metric_value,
            "timestamp": m.timestamp.isoformat()
        })
    return res


@app.get("/api/v5/visibility/stp")
def get_stp_states(db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if user_role == "platform_admin":
        switches = db.query(models.Switch).all()
    else:
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        switches = db.query(models.Switch).join(
            models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
        ).join(
            models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).distinct().all()
    
    res = []
    for sw in switches:
        stp_record = db.query(models.SwitchSTPState).filter(
            models.SwitchSTPState.switch_id == sw.switch_id
        ).first()
        
        if stp_record:
            res.append({
                "hostname": sw.hostname,
                "ip": sw.management_ip,
                "stp_enabled": stp_record.stp_enabled,
                "stp_mode": stp_record.stp_mode,
                "bridge_priority": stp_record.bridge_priority,
                "is_root_bridge": stp_record.is_root_bridge,
                "port_states": stp_record.port_states or [],
                "collected_at": stp_record.collected_at.isoformat() if stp_record.collected_at else None
            })
        else:
            res.append({
                "hostname": sw.hostname,
                "ip": sw.management_ip,
                "stp_enabled": False,
                "stp_mode": "not_applicable",
                "bridge_priority": None,
                "is_root_bridge": False,
                "port_states": [],
                "collected_at": None
            })
    return res


from fastapi.responses import StreamingResponse
import io
import csv

@app.get("/api/v5/visibility/reports/csv")
def export_reports_csv(
    report_type: str = "inventory",
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    output = io.StringIO()
    writer = csv.writer(output)

    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if report_type == "inventory":
        writer.writerow(["Hostname", "Management IP", "Vendor", "Role", "Serial Number", "Status"])
        if user_role == "platform_admin":
            switches = db.query(models.Switch).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            switches = db.query(models.Switch).join(
                models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
            ).join(
                models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
            ).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).distinct().all()
        for sw in switches:
            writer.writerow([
                sw.hostname,
                sw.management_ip,
                sw.vendor,
                sw.role,
                f"SN-{sw.vendor.upper()}-{sw.hostname.upper()}",
                sw.lifecycle_status
            ])
            
    elif report_type == "ipam":
        writer.writerow(["Subnet CIDR", "Gateway IP", "VLAN ID", "VRF Name", "Description"])
        if user_role == "platform_admin":
            subnets = db.query(models.IpamSubnet).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            subnets = db.query(models.IpamSubnet).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).all()
        for sub in subnets:
            vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == sub.vrf_id).first()
            writer.writerow([
                sub.subnet_cidr,
                sub.gateway_ip,
                sub.vlan_id,
                vrf.vrf_name if vrf else "unknown",
                sub.description or ""
            ])
            
    elif report_type == "compliance":
        writer.writerow(["Hostname", "Rule Name", "Severity", "Detail"])
        run = db.query(models.ComplianceRun).order_by(models.ComplianceRun.started_at.desc()).first()
        if run:
            findings = db.query(models.ComplianceFinding).filter(models.ComplianceFinding.compliance_run_id == run.run_id).all()
            for f in findings:
                sw = db.query(models.Switch).filter(models.Switch.switch_id == f.switch_id).first()
                writer.writerow([
                    sw.hostname if sw else "unknown",
                    f.rule_name,
                    f.severity,
                    f.detail
                ])
    else:
        raise HTTPException(status_code=400, detail="Invalid report_type parameter")
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=report_{report_type}.csv"}
    )


class ConfigPushRequest(BaseModel):
    switch_id: str
    config_data: str

@app.post("/api/v5/orchestrator/async-config-push")
def enqueue_config_push(
    payload: ConfigPushRequest,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:write"))
):
    from .auth import verify_switch_access
    from .workers.sync_tasks import sync_switch_config_task
    sw_uuid = uuid.UUID(payload.switch_id)
    verify_switch_access(db, sw_uuid, claims)
    task = sync_switch_config_task.delay(payload.switch_id, payload.config_data)
    return {"status": "ENQUEUED", "task_id": task.id}

