import os
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

class Settings:
    NODE_NAME_ID: str = os.getenv("NODE_NAME_ID", "node-01")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://sdn_admin:sdn_secure_password@localhost:5432/sdn_controller")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_SENTINEL_HOSTS: str = os.getenv("REDIS_SENTINEL_HOSTS", "")
    REDIS_SENTINEL_MASTER: str = os.getenv("REDIS_SENTINEL_MASTER", "mymaster")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "sdn_super_secret_jwt_key_change_me_in_production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRY_HOURS: int = int(os.getenv("JWT_EXPIRY_HOURS", "8"))
    JWT_REFRESH_EXPIRY_DAYS: int = int(os.getenv("JWT_REFRESH_EXPIRY_DAYS", "7"))
    VAULT_URL: str = os.getenv("VAULT_URL", "http://localhost:8200")
    VAULT_TOKEN: str = os.getenv("VAULT_TOKEN", "sdn_vault_dev_token")

    # Netdisco Configs
    NETDISCO_URL: str = os.getenv("NETDISCO_URL", "http://localhost:5000")
    NETDISCO_USER: str = os.getenv("NETDISCO_USER", "netdisco")
    NETDISCO_PASSWORD: str = os.getenv("NETDISCO_PASSWORD", "netdisco_web_pass")
    NETDISCO_SYNC_INTERVAL_SEC: int = int(os.getenv("NETDISCO_SYNC_INTERVAL_SEC", "300"))

settings = Settings()

if settings.JWT_SECRET_KEY == "sdn_super_secret_jwt_key_change_me_in_production" and settings.ENVIRONMENT == "production":
    import warnings
    warnings.warn(
        "CRITICAL: JWT_SECRET_KEY is the default value! Set a unique secret via the JWT_SECRET_KEY env var.",
        RuntimeWarning, stacklevel=2
    )
