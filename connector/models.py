from datetime import date, datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, field_validator

class PlayerRecord(BaseModel):
    id: str = Field(..., description="Stable provider alphanumeric identifier")
    name: str = Field(..., min_length=1, description="Full player name")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    match_name: Optional[str] = None
    country: Optional[str] = None
    birth_date: Optional[str] = None
    primary_position: Optional[str] = "Desconocida"
    grupo_demarcacion: Optional[str] = "Sin clasificar"
    shirt_number: Optional[int] = None
    height: Optional[int] = None
    weight: Optional[int] = None
    preferred_foot: Optional[str] = None
    current_team_id: Optional[str] = None
    photo_url: Optional[str] = None
    market_value: Optional[int] = None
    contract_until: Optional[str] = None

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Player ID cannot be empty")
        return clean

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Player name cannot be empty")
        return clean

class SyncExecutionReport(BaseModel):
    job_id: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str = "pending" # pending, in_progress, completed, failed, dry_run
    source_path: str
    total_read: int = 0
    valid_count: int = 0
    invalid_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    row_errors: List[Dict[str, Any]] = Field(default_factory=list)
    is_dry_run: bool = False

