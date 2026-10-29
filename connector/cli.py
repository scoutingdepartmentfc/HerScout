#!/usr/bin/env python3
"""
HerScout Local Connector CLI
Usage:
    python3 -m connector.cli --file path/to/players.csv --dry-run
    python3 -m connector.cli --file path/to/players.csv --max-records 10
"""

import argparse
import json
import logging
import sys
from pathlib import Path

from .config import load_connector_config
from .sync import LocalSyncConnector

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

def main():
    parser = argparse.ArgumentParser(description="HerScout Local Data Connector")
    parser.add_argument("--file", type=str, required=True, help="Path to input CSV or JSON file")
    parser.add_argument("--dry-run", action="store_true", help="Validate and preview without persisting to Supabase")
    parser.add_argument("--max-records", type=int, default=None, help="Sample limit for testing")
    parser.add_argument("--batch-size", type=int, default=50, help="Batch size for upserts")

    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    try:
        config = load_connector_config(dry_run=args.dry_run)
        config.batch_size = args.batch_size
        connector = LocalSyncConnector(config)
        report = connector.sync_players(file_path, max_records=args.max_records)

        print("\n" + "=" * 50)
        print("--- HERSCOUT CONNECTOR EXECUTION REPORT ---")
        print("=" * 50)
        print(f"Job ID:          {report.job_id}")
        print(f"Status:          {report.status.upper()}")
        print(f"Dry Run:         {report.is_dry_run}")
        print(f"Total Read:      {report.total_read}")
        print(f"Valid Records:   {report.valid_count}")
        print(f"Inserted:        {report.inserted_count}")
        print(f"Updated:         {report.updated_count}")
        print(f"Invalid/Errors:  {report.invalid_count}")
        if report.row_errors:
            print("\nRow-Level Errors (first 5):")
            for err in report.row_errors[:5]:
                print(f" - Row {err.get('row')}: {err.get('error')}")
        print("=" * 50)

    except Exception as e:
        print(f"\n[FATAL ERROR] {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

