from app import db, models

def clean_edges():
    s = db.SessionLocal()
    deleted = s.query(models.TopologyEdge).filter(
        (models.TopologyEdge.local_port == "mgmt1/1/1") | 
        (models.TopologyEdge.remote_port == "mgmt1/1/1") |
        (models.TopologyEdge.protocol == "OOB-MGMT")
    ).delete(synchronize_session=False)
    s.commit()
    print(f"Purged {deleted} mgmt1/1/1 and OOB-MGMT false-positive edges from topology_edges table!")

if __name__ == "__main__":
    clean_edges()
