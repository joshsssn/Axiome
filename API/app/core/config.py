import os
import sys
from pydantic_settings import BaseSettings


def _get_data_dir() -> str:
    """Return the local data directory for Axiome (platform-aware)."""
    if sys.platform == "win32":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME", os.path.join(os.path.expanduser("~"), ".local", "share"))
    data_dir = os.path.join(base, "Axiome")
    os.makedirs(data_dir, exist_ok=True)
    return data_dir


class Settings(BaseSettings):
    PROJECT_NAME: str = "Axiome"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"

    # Local data directory
    DATA_DIR: str = _get_data_dir()

    # SQLite database (local file)
    DATABASE_URL: str = f"sqlite:///{os.path.join(_get_data_dir(), 'axiome.db')}"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
