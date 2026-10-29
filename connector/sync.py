import csv
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Generator, List, Tuple

from pydantic import ValidationError
from supabase import create_client, Client

from .config import ConnectorConfig
from .models import PlayerRecord, SyncExecutionReport

logger = logging.getLogger("HerScoutConnector")

class LocalSyncConnector:
    """
    Secure client connector reading authorized local data and pushing validated
    upserts to Supabase PostgreSQL over HTTPS.
    """

    def __init__(self, config: ConnectorConfig):
        self.config = config
        self.client: Client = create_client(config.supabase_url, config.supabase_key)

    def read_records_from_csv(self, file_path: Path) -> Generator[Tuple[int, Dict[str, Any]], None, None]:
        """
        Reads CSV safely line by line without holding massive memory buffers.
        """
        if not file_path.exists():
            raise FileNotFoundError(f"Source file not found: {file_path}")

        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row_idx, row in enumerate(reader, start=1):
                yield row_idx, row

    def read_records_from_json(self, file_path: Path) -> Generator[Tuple[int, Dict[str, Any]], None, None]:
        """
        Reads structured JSON lists.
        """
        if not file_path.exists():
            raise FileNotFoundError(f"Source file not found: {file_path}")

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                for row_idx, item in enumerate(data, start=1):
                    if isinstance(item, dict):
                        yield row_idx, item
            elif isinstance(data, dict):
                yield 1, data

    def sync_players(
        self,
        source_file: Path,
        max_records: int = None,
    ) -> SyncExecutionReport:
        """
        Validates records, checks for existing entries, and performs idempotent upserts.
        Preserves provenance and never deletes absent records.
        """
        job_id = str(uuid.uuid4())
        started_at = datetime.now(timezone.utc)
        report = SyncExecutionReport(
            job_id=job_id,
            started_at=started_at,
            source_path=str(source_file),
            is_dry_run=self.config.dry_run,
        )

        logger.info(f"Starting synchronization job {job_id} (dry_run={self.config.dry_run})")

        # Determine file type
        if source_file.suffix.lower() == ".csv":
            stream = self.read_records_from_csv(source_file)
        elif source_file.suffix.lower() == ".json":
            stream = self.read_records_from_json(source_file)
        else:
            raise ValueError(f"Unsupported file format: {source_file.suffix}")

        valid_batch: List[Dict[str, Any]] = []
        batch_ids: List[str] = []

        for row_idx, raw_row in stream:
            if max_records and report.total_read >= max_records:
                break

            report.total_read += 1

            # Validate schema
            try:
                record = PlayerRecord(**raw_row)
                report.valid_count += 1
                clean_dict = record.model_dump(exclude_none=True)
                valid_batch.append(clean_dict)
                batch_ids.append(record.id)
            except ValidationError as ve:
                report.invalid_count += 1
                report.row_errors.append({
                    "row": row_idx,
                    "error": str(ve),
                    "raw_id": raw_row.get("id"),
                })
                continue

            # Process in batches
            if len(valid_batch) >= self.config.batch_size:
                self._process_batch(valid_batch, batch_ids, report)
                valid_batch = []
                batch_ids = []

        # Flush remaining
        if valid_batch:
            self._process_batch(valid_batch, batch_ids, report)

        report.finished_at = datetime.now(timezone.utc)
        report.status = "dry_run" if self.config.dry_run else ("completed" if report.invalid_count == 0 else "completed_with_errors")

        logger.info(
            f"Job {job_id} finished: read={report.total_read}, valid={report.valid_count}, "
            f"inserted={report.inserted_count}, updated={report.updated_count}, errors={report.invalid_count}"
        )
        return report

    def _process_batch(
        self,
        batch: List[Dict[str, Any]],
        ids: List[str],
        report: SyncExecutionReport
    ):
        if self.config.dry_run:
            # Check duplicates in DB without writing
            try:
                existing_res = self.client.table("players").select("id").in_("id", ids).execute()
                existing_ids = {row["id"] for row in existing_res.data}
                for item in batch:
                    if item["id"] in existing_ids:
                        report.updated_count += 1
                    else:
                        report.inserted_count += 1
            except Exception as e:
                logger.warning(f"Dry run lookup warning: {e}")
                report.inserted_count += len(batch)
            return

        # Check existing IDs to differentiate inserts vs updates
        try:
            existing_res = self.client.table("players").select("id").in_("id", ids).execute()
            existing_ids = {row["id"] for row in existing_res.data}
        except Exception as e:
            existing_ids = set()
            logger.warning(f"Could not check existing IDs, defaulting to upsert: {e}")

        # Execute idempotent upsert
        try:
            res = self.client.table("players").upsert(batch, on_conflict="id").execute()
            for item in batch:
                if item["id"] in existing_ids:
                    report.updated_count += 1
                else:
                    report.inserted_count += 1
        except Exception as e:
            logger.error(f"Error during batch upsert: {e}")
            report.invalid_count += len(batch)
            report.row_errors.append({
                "batch_size": len(batch),
                "error": str(e),
                "ids": ids,
            })

