import json
from app.main import app

# Force generation of the openapi schema
openapi_schema = app.openapi()
print(json.dumps(openapi_schema))
