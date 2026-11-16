"""Entrypoint for GitHub Actions job: 4. Descarga Stats y Eventing Opta.

Downloads Opta player stats and eventing for enabled leagues across their
selected `sd_leagues.opta_season_ids`.
"""

from __future__ import annotations

import os
import sys

from pipeline import sd_ligas


def main() -> int:
    comp_id = os.getenv("COMP_ID", "").strip()
    argv = ["sd_ligas.py", "opta", "--todas-temporadas"]
    if comp_id:
        argv.extend(["--liga", comp_id])
    sys.argv = argv
    sd_ligas.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

