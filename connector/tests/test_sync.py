import unittest
from pathlib import Path
import sys

# Ensure HerScout root is in python path
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from connector.config import load_connector_config
from connector.sync import LocalSyncConnector
from connector.models import PlayerRecord

class TestSyncConnector(unittest.TestCase):

    def test_player_record_validation(self):
        # Valid record
        p = PlayerRecord(id="p-1", name="Aitana Bonmati", primary_position="CMF")
        self.assertEqual(p.id, "p-1")
        self.assertEqual(p.name, "Aitana Bonmati")

        # Invalid empty ID
        with self.assertRaises(Exception):
            PlayerRecord(id="", name="Valid Name")

        # Invalid empty name
        with self.assertRaises(Exception):
            PlayerRecord(id="p-2", name="")

    def test_dry_run_sync_execution(self):
        config = load_connector_config(dry_run=True)
        connector = LocalSyncConnector(config)
        fixtures_file = Path(__file__).parent.parent / "fixtures" / "mixed_players.csv"
        
        report = connector.sync_players(fixtures_file)
        self.assertEqual(report.total_read, 4)
        self.assertEqual(report.valid_count, 2)
        self.assertEqual(report.invalid_count, 2)
        self.assertTrue(report.is_dry_run)
        self.assertEqual(len(report.row_errors), 2)
        self.assertEqual(report.row_errors[0]["row"], 2) # Missing ID
        self.assertEqual(report.row_errors[1]["row"], 3) # Empty name

    def test_live_sample_upsert_and_repeat_idempotency(self):
        """
        Tests live upsert of small test batch, then repeats to verify idempotency (0 duplicates created).
        """
        config = load_connector_config(dry_run=False)
        connector = LocalSyncConnector(config)
        valid_file = Path(__file__).parent.parent / "fixtures" / "valid_players.csv"

        # Initial Run
        initial_report = connector.sync_players(valid_file)
        self.assertEqual(initial_report.valid_count, 3)
        self.assertEqual(initial_report.invalid_count, 0)

        # Repeat Run (Must not duplicate or fail)
        repeat_report = connector.sync_players(valid_file)
        self.assertEqual(repeat_report.valid_count, 3)
        self.assertEqual(repeat_report.invalid_count, 0)
        self.assertEqual(repeat_report.updated_count, 3)
        self.assertEqual(repeat_report.inserted_count, 0)

        # Cleanup test records
        client = connector.client
        test_ids = ["sample_val_01", "sample_val_02", "sample_val_03"]
        client.table("players").delete().in_("id", test_ids).execute()

if __name__ == "__main__":
    unittest.main()
