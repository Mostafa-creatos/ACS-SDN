import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.db import SessionLocal
from app.workers.config_lifecycle import run_compliance_check

db = SessionLocal()
try:
    print("Executing compliance audit...")
    r = run_compliance_check(db)
    print(f"Compliance audit complete! Run ID: {r.run_id}, Status: {r.status}")
finally:
    db.close()
