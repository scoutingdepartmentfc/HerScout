"""Entrypoint for GitHub Actions daily job: Opta Matches & Ratings (1-10).

Downloads daily fixtures/schedules for Match and computes/stores 1-10
per-match player ratings for linked players.
"""

from __future__ import annotations

import os
import sys

from pipeline import sd_ligas


def main() -> int:
    comp_id = os.getenv("COMP_ID", "").strip()
    argv = ["sd_ligas.py", "opta-partidos"]
    if comp_id:
        argv.extend(["--liga", comp_id])
    sys.argv = argv
    sd_ligas.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

