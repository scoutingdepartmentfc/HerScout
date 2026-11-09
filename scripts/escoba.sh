#!/usr/bin/env bash
# Selector interactivo para el proceso escoba de Ceroacero
set -euo pipefail

cd "$(dirname "$0")/.."
VENV=.venv

if [ ! -x "$VENV/bin/python" ]; then
  echo "▶ Creando entorno Python en $VENV..."
  python3.11 -m venv "$VENV" 2>/dev/null || python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r pipeline/requirements.txt -c pipeline/constraints.txt
fi

"$VENV/bin/python" scripts/escoba_ceroacero.py "$@"

