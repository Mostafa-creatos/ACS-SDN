from app import db, models
from app.workers.sync_tasks import sync_topology_edges_task

def run_sync():
    print("Triggering sync_topology_edges_task...")
    res = sync_topology_edges_task()
    print("Sync Result:", res)

if __name__ == "__main__":
    run_sync()
