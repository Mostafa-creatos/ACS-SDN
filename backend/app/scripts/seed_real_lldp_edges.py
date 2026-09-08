from app import db, models

EDGES = [
    # DC1-Spine-1 links
    ("DC1-Spine-1", "ethernet1/1/1", "DC1-Leaf-1", "ethernet1/1/1", "LLDP"),
    ("DC1-Spine-1", "ethernet1/1/2", "DC1-Leaf-2", "ethernet1/1/1", "LLDP"),
    ("DC1-Spine-1", "ethernet1/1/3", "DC1-Leaf-3", "ethernet1/1/1", "LLDP"),
    ("DC1-Spine-1", "ethernet1/1/4", "DC1-Leaf-4", "ethernet1/1/1", "LLDP"),
    ("DC1-Spine-1", "ethernet1/1/5", "DC1-Leaf-5", "ethernet1/1/1", "LLDP"),
    ("DC1-Spine-1", "ethernet1/1/6", "DC1-Leaf-6", "ethernet1/1/1", "LLDP"),
    ("DC1-Spine-1", "ethernet1/1/7", "DC1-Leaf-7", "ethernet1/1/1", "LLDP"),
    ("DC1-Spine-1", "ethernet1/1/8", "DC1-Leaf-8", "ethernet1/1/1", "LLDP"),
    ("DC1-Spine-1", "ethernet1/1/14", "DC2-Spine-1", "ethernet1/1/14", "LLDP"),

    # DC1-Spine-2 links
    ("DC1-Spine-2", "ethernet1/1/1", "DC1-Leaf-1", "ethernet1/1/2", "LLDP"),
    ("DC1-Spine-2", "ethernet1/1/2", "DC1-Leaf-2", "ethernet1/1/2", "LLDP"),
    ("DC1-Spine-2", "ethernet1/1/3", "DC1-Leaf-3", "ethernet1/1/2", "LLDP"),
    ("DC1-Spine-2", "ethernet1/1/4", "DC1-Leaf-4", "ethernet1/1/2", "LLDP"),
    ("DC1-Spine-2", "ethernet1/1/5", "DC1-Leaf-5", "ethernet1/1/2", "LLDP"),
    ("DC1-Spine-2", "ethernet1/1/6", "DC1-Leaf-6", "ethernet1/1/2", "LLDP"),
    ("DC1-Spine-2", "ethernet1/1/7", "DC1-Leaf-7", "ethernet1/1/2", "LLDP"),
    ("DC1-Spine-2", "ethernet1/1/8", "DC1-Leaf-8", "ethernet1/1/2", "LLDP"),
    ("DC1-Spine-2", "ethernet1/1/15", "DC2-Spine-2", "ethernet1/1/15", "LLDP"),

    # DC2-Spine-1 & DC2-Spine-2 links to DC2 Leafs
    ("DC2-Spine-1", "ethernet1/1/1", "DC2-Leaf-1", "ethernet1/1/1", "LLDP"),
    ("DC2-Spine-1", "ethernet1/1/2", "DC2-Leaf-2", "ethernet1/1/1", "LLDP"),
    ("DC2-Spine-2", "ethernet1/1/1", "DC2-Leaf-1", "ethernet1/1/2", "LLDP"),
    ("DC2-Spine-2", "ethernet1/1/2", "DC2-Leaf-2", "ethernet1/1/2", "LLDP"),
]

def seed_topology():
    s = db.SessionLocal()
    # Purge old LLDP edges
    s.query(models.TopologyEdge).filter(models.TopologyEdge.protocol == "LLDP").delete()
    
    for l_sw, l_pt, r_sw, r_pt, proto in EDGES:
        edge = models.TopologyEdge(
            local_switch=l_sw,
            local_port=l_pt,
            remote_switch=r_sw,
            remote_port=r_pt,
            protocol=proto
        )
        s.add(edge)

    s.commit()
    print(f"Successfully seeded {len(EDGES)} clean LLDP topology edges in PostgreSQL database!")

if __name__ == "__main__":
    seed_topology()
