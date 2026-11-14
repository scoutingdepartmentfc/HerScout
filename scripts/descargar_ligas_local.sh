#!/usr/bin/env bash
# Descarga ligas de Soccerdonna desde el Mac (sin gastar minutos de GitHub Actions).
# Uso:  scripts/descargar_ligas_local.sh SUI1 NOR1 ISL1 ...
# Por cada liga: plantillas + fichas Soccerdonna → vincular con Opta → escudos → fotos.
# Al final, una sola vez: completar (jugadoras de Opta sin ficha). Reanudable: si se corta, vuelve a lanzarlo.
# Logs en logs/descarga_<fecha>.log
set -u
cd "$(dirname "$0")/.."
PY=.venv/bin/python
mkdir -p logs
LOG="logs/descarga_$(date +%Y%m%d_%H%M).log"
[ $# -eq 0 ] && { echo "Uso: $0 CODIGO [CODIGO...]"; exit 1; }

{
  for LIGA in "$@"; do
    echo "════════ $LIGA ($(date +%H:%M)) ════════"
    $PY -m pipeline.sd_ligas descargar --liga "$LIGA" || { echo "✗ $LIGA falló en descargar"; continue; }
    $PY -m pipeline.sd_ligas vincular --liga "$LIGA" || echo "✗ $LIGA falló en vincular"
    $PY -m pipeline.sd_ligas escudos  --liga "$LIGA" || echo "✗ $LIGA falló en escudos"
    $PY -m pipeline.sd_ligas fotos    --liga "$LIGA" || echo "✗ $LIGA falló en fotos"
    echo "✓ $LIGA terminada ($(date +%H:%M))"
  done
  echo "════════ completar ════════"
  $PY -m pipeline.sd_ligas completar
  echo "✓ Todo terminado ($(date +%H:%M))"
} 2>&1 | tee "$LOG"
