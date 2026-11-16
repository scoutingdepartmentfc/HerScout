"""Entrypoint for GitHub Actions job: 3. Vincular ligas y jugadoras con Opta.

Links Soccerdonna teams and players to Opta IDs (`players.opta_id`) using
`sd_leagues.opta_competition_id` for all enabled leagues (or `COMP_ID`).
"""

from __future__ import annotations

import os
import sys

from pipeline import sd_ligas


def main() -> int:
    comp_id = os.getenv("COMP_ID", "").strip()
    argv = ["sd_ligas.py", "vincular"]
    if comp_id:
        argv.extend(["--liga", comp_id])
    sys.argv = argv
    sd_ligas.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

