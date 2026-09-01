#!/bin/bash
set -e
docker rm -f sdn_controller_app sdn_celery_worker sdn_flower sdn_frontend 2>/dev/null || true

# Run app
docker run -d --name sdn_controller_app \
  --network sdn-controller_default \
  --network-alias app \
  -p 8000:8000 \
  -e DATABASE_URL=postgresql://sdn_admin:sdn_secure_password@db:5432/sdn_controller \
  -e REDIS_URL=redis://redis-master:6379/0 \
  -e "REDIS_SENTINEL_HOSTS=redis-sentinel-1:26379;redis-sentinel-2:26379;redis-sentinel-3:26379" \
  -e REDIS_SENTINEL_MASTER=mymaster \
  -e SEED_ADMIN_PASSWORD=admin_password_123! \
  -e SEED_OPERATOR_PASSWORD=operator_password_123! \
  -e SEED_AUDITOR_PASSWORD=auditor_password_123! \
  -e SEED_ON_STARTUP=false \
  -e GNMI_DEFAULT_PASSWORD=NokiaSrl1! \
  --restart unless-stopped \
  sdn-controller_app:latest

# Run worker
docker run -d --name sdn_celery_worker \
  --network sdn-controller_default \
  --network-alias celery-worker \
  -e DATABASE_URL=postgresql://sdn_admin:sdn_secure_password@db:5432/sdn_controller \
  -e REDIS_URL=redis://redis-master:6379/0 \
  -e "REDIS_SENTINEL_HOSTS=redis-sentinel-1:26379;redis-sentinel-2:26379;redis-sentinel-3:26379" \
  -e REDIS_SENTINEL_MASTER=mymaster \
  -e SEED_ADMIN_PASSWORD=admin_password_123! \
  -e SEED_OPERATOR_PASSWORD=operator_password_123! \
  -e SEED_AUDITOR_PASSWORD=auditor_password_123! \
  -e SEED_ON_STARTUP=false \
  -e GNMI_DEFAULT_PASSWORD=NokiaSrl1! \
  --restart unless-stopped \
  sdn-controller_celery-worker:latest \
  celery -A app.workers.celery_app worker --loglevel=info

# Run flower
docker run -d --name sdn_flower \
  --network sdn-controller_default \
  --network-alias flower \
  -p 5555:5555 \
  -e REDIS_URL=redis://redis-master:6379/0 \
  -e "REDIS_SENTINEL_HOSTS=redis-sentinel-1:26379;redis-sentinel-2:26379;redis-sentinel-3:26379" \
  -e REDIS_SENTINEL_MASTER=mymaster \
  --restart unless-stopped \
  sdn-controller_flower:latest \
  celery -A app.workers.celery_app flower --port=5555 --basic_auth=admin:admin

# Run frontend
docker run -d --name sdn_frontend \
  --network sdn-controller_default \
  -p 8080:80 \
  --restart unless-stopped \
  sdn-controller_frontend:latest

# Nginx configurations reload
echo "Waiting 5s for frontend container to stabilize..."
sleep 5
docker exec -i sdn_frontend chown -R nginx:nginx /usr/share/nginx/html
docker exec -i sdn_frontend chmod -R 755 /usr/share/nginx/html
docker exec -i sdn_frontend nginx -s reload
echo "All containers started successfully!"
