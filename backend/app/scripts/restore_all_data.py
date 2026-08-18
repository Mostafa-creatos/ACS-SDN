import uuid
from app.db import SessionLocal
from app import models

def restore_all():
    db = SessionLocal()
    try:
        print("[RESTORE] Restoring Tenants...")
        # 1. Tenants
        t_ent = db.query(models.Tenant).filter(models.Tenant.tenant_name == "Test-Enterprise-01").first()
        if not t_ent:
            t_ent = models.Tenant(tenant_id=uuid.UUID("023966c9-a945-4249-b51e-0bfb6c36acd2"), tenant_name="Test-Enterprise-01")
            db.add(t_ent)
            
        t_fin = db.query(models.Tenant).filter(models.Tenant.tenant_name == "Finance-Dept-Tenant").first()
        if not t_fin:
            t_fin = models.Tenant(tenant_id=uuid.UUID("7f4a448b-f8f1-4c64-b53d-aae30278f582"), tenant_name="Finance-Dept-Tenant")
            db.add(t_fin)
        db.commit()

        # Fetch fabrics
        fab1 = db.query(models.Fabric).filter(models.Fabric.fabric_name == "Fabric 1").first()
        fab2 = db.query(models.Fabric).filter(models.Fabric.fabric_name == "Fabric 2").first()

        # 2. VRFs for Test-Enterprise-01
        print("[RESTORE] Restoring VRFs...")
        vrf_test = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_name == "VRF_TEST_01").first()
        if not vrf_test:
            vrf_test = models.TenantVrf(
                vrf_id=uuid.UUID("11111111-2222-3333-4444-555555555501"),
                tenant_id=t_ent.tenant_id,
                vrf_name="VRF_TEST_01",
                layer3_vni=5001,
                route_distinguisher="auto",
                route_target="both auto"
            )
            db.add(vrf_test)

        vrf_guest = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_name == "VRF_GUEST_01").first()
        if not vrf_guest:
            vrf_guest = models.TenantVrf(
                vrf_id=uuid.UUID("11111111-2222-3333-4444-555555555502"),
                tenant_id=t_ent.tenant_id,
                vrf_name="VRF_GUEST_01",
                layer3_vni=5002,
                route_distinguisher="auto",
                route_target="both auto"
            )
            db.add(vrf_guest)

        # 3. VRF for Finance-Dept-Tenant
        vrf_fin = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_name == "VRF_FINANCE_SECURE").first()
        if not vrf_fin:
            vrf_fin = models.TenantVrf(
                vrf_id=uuid.UUID("11111111-2222-3333-4444-555555555510"),
                tenant_id=t_fin.tenant_id,
                vrf_name="VRF_FINANCE_SECURE",
                layer3_vni=5010,
                route_distinguisher="auto",
                route_target="both auto"
            )
            db.add(vrf_fin)
        db.commit()

        # 4. Subnets
        print("[RESTORE] Restoring Subnets...")
        subnets_data = [
            # VRF_TEST_01 Subnets
            {"vrf_id": vrf_test.vrf_id, "tenant_id": t_ent.tenant_id, "fabric_id": fab1.fabric_id if fab1 else None, "cidr": "10.10.1.0/24", "gw": "10.10.1.1", "vlan": 100, "vni": 10100},
            {"vrf_id": vrf_test.vrf_id, "tenant_id": t_ent.tenant_id, "fabric_id": fab2.fabric_id if fab2 else None, "cidr": "10.10.2.0/24", "gw": "10.10.2.1", "vlan": 200, "vni": 10200},
            # VRF_GUEST_01 Subnet
            {"vrf_id": vrf_guest.vrf_id, "tenant_id": t_ent.tenant_id, "fabric_id": fab1.fabric_id if fab1 else None, "cidr": "192.168.99.0/24", "gw": "192.168.99.1", "vlan": 999, "vni": 10999},
            # VRF_FINANCE_SECURE Subnet
            {"vrf_id": vrf_fin.vrf_id, "tenant_id": t_fin.tenant_id, "fabric_id": fab2.fabric_id if fab2 else None, "cidr": "172.16.10.0/24", "gw": "172.16.10.1", "vlan": 300, "vni": 10300},
        ]

        for s in subnets_data:
            existing = db.query(models.IpamSubnet).filter(models.IpamSubnet.subnet_cidr == s["cidr"]).first()
            if not existing:
                db.add(models.IpamSubnet(
                    subnet_id=uuid.uuid4(),
                    vrf_id=s["vrf_id"],
                    fabric_id=s["fabric_id"],
                    subnet_cidr=s["cidr"],
                    anycast_gateway_ip=s["gw"],
                    vlan_id=s["vlan"],
                    layer2_vni=s["vni"]
                ))
        db.commit()

        # 5. Restore Switch Tenant Associations
        switches = db.query(models.Switch).all()
        for sw in switches:
            sw.client_tenant = "Test-Enterprise-01"
            if fab1 and sw.management_ip in ["172.20.20.10", "172.20.20.11", "172.20.20.12"]:
                sw.fabric_id = fab1.fabric_id
            elif fab2 and sw.management_ip in ["172.20.20.13", "172.20.20.14", "172.20.20.15"]:
                sw.fabric_id = fab2.fabric_id
        db.commit()
        print("[RESTORE] Restoration script completed successfully.")
    except Exception as e:
        db.rollback()
        print(f"[RESTORE ERROR] {e}")
    finally:
        db.close()

if __name__ == "__main__":
    restore_all()
