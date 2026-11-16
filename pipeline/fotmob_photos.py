"""Entrypoint for GitHub Actions job: 2. Fotos FotMob (por parecido).

Searches FotMob for players that do not yet have `fotmob_id` / `fotmob_photo_url`,
keeping the Soccerdonna photo as fallback when no reliable match is found.
"""

from __future__ import annotations

import sys

from pipeline import fotos_jugadoras


def main() -> int:
    if hasattr(fotos_jugadoras, "main"):
        sys.argv = ["fotos_jugadoras.py"]
        fotos_jugadoras.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

