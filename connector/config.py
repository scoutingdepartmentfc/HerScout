import os
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional

class ConnectorConfig(BaseModel):
    supabase_url: str
    supabase_key: str
    source_dir: Path
    batch_size: int = 100
    dry_run: bool = False

def load_connector_config(dry_run: bool = False, source_path: Optional[str] = None) -> ConnectorConfig:
    """
    Safely loads configuration prioritizing SUPABASE_SERVICE_ROLE_KEY for pipeline upserts
    (which bypasses RLS), falling back to ANON_KEY for read-only checks.
    """
    env_dict = {}
    
    # Check fallback .env file
    env_fallback = Path("/Users/imac/Programas/Scouting_jugadores/.env")
    if env_fallback.exists():
        with open(env_fallback, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_dict[k.strip()] = v.strip()

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or env_dict.get("VITE_SUPABASE_URL") or env_dict.get("SUPABASE_URL")
    
    # Ingestion needs service role key to insert into shared intelligence tables
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or env_dict.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or env_dict.get("VITE_SUPABASE_ANON_KEY")
    )

    if not url or not key:
        raise ValueError("Supabase URL and Key must be configured via environment variables or .env file.")

    default_source = Path(source_path) if source_path else Path("/Users/imac/Programas/Scouting_jugadores")
    if not default_source.exists():
        raise FileNotFoundError(f"Authorized source directory does not exist: {default_source}")

    return ConnectorConfig(
        supabase_url=url,
        supabase_key=key,
        source_dir=default_source.resolve(),
        dry_run=dry_run,
    )
