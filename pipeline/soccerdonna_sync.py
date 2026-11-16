"""Entrypoint for GitHub Actions job: 1. Descarga Soccerdonna (incremental).

Reads enabled leagues from `sd_leagues` (or `COMP_ID` env var if provided)
and runs `pipeline.sd_ligas` in incremental mode so new players, club changes,
injuries, market values, transfers, and national team caps are upserted.
"""

from __future__ import annotations

import os
import sys

from pipeline import sd_ligas


def main() -> int:
    comp_id = os.getenv("COMP_ID", "").strip()
    argv = ["sd_ligas.py", "actualizar-soccerdonna"]
    if comp_id:
        argv.extend(["--liga", comp_id])
    sys.argv = argv
    sd_ligas.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

