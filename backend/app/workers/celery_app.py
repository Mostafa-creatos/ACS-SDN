import os
from celery import Celery

REDIS_SENTINEL_HOSTS = os.getenv("REDIS_SENTINEL_HOSTS", "")
REDIS_SENTINEL_MASTER = os.getenv("REDIS_SENTINEL_MASTER", "mymaster")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

if REDIS_SENTINEL_HOSTS:
    # Format: host1:port1,host2:port2,... or host1:port1;host2:port2;...
    sentinels_list = []
    separator = ',' if ',' in REDIS_SENTINEL_HOSTS else ';'
    for item in REDIS_SENTINEL_HOSTS.split(separator):
        if ':' in item:
            host, port = item.split(':')
            sentinels_list.append((host.strip(), int(port.strip())))
        else:
            sentinels_list.append((item.strip(), 26379))
            
    broker_url = f"sentinel://{sentinels_list[0][0]}:{sentinels_list[0][1]}"
    backend_url = f"redis+sentinel://{sentinels_list[0][0]}:{sentinels_list[0][1]}/0"
    
    broker_transport_options = {
        'master_name': REDIS_SENTINEL_MASTER,
        'sentinels': sentinels_list,
        'socket_timeout': 5.0,
    }
else:
    broker_url = REDIS_URL
    backend_url = REDIS_URL
    broker_transport_options = {}

celery_app = Celery(
    'sdn_tasks',
    broker=broker_url,
    backend=backend_url
)

celery_app.conf.update(
    broker_transport_options=broker_transport_options,
    result_backend_transport_options=broker_transport_options,
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)

# Import tasks to register them with the celery worker
# We will define tasks in sync_tasks.py
import app.workers.sync_tasks
