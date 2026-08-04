import sys
sys.path.append("/app")
import sqlalchemy
from sqlalchemy import create_engine

engine = create_engine("postgresql://sdn_user:sdn_password@localhost:5432/sdn_controller")
with engine.connect() as conn:
    res = conn.execute(sqlalchemy.text("SELECT count(*) FROM switches")).fetchone()
    print("Number of switches in DB:", res[0])
    
    res2 = conn.execute(sqlalchemy.text("SELECT hostname, client_tenant FROM switches")).fetchall()
    print("Switches:", res2)
