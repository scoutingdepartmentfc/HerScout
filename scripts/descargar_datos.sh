#!/usr/bin/env bash
# Descarga local de datos (lo mismo que hace el GitHub Action de los martes) contra el Supabase de .env.local.
#
#   scripts/descargar_datos.sh                 Descarga incremental: solo partidos nuevos de las ligas de /admin
#   scripts/descargar_datos.sh --desde-cero    Borra todo lo descargado y lo vuelve a descargar entero
#   scripts/descargar_datos.sh --desde-cero --si   Igual, sin pedir confirmación
#
# Pasos: 1) Opta: plantillas, partidos, estadísticas, notas  2) Fotos FotMob (matchName + dorsal + nacimiento)
#        3) Soccerdonna: perfil, valor, traspasos, lesiones y selección (nacimiento + lugar + dorsal + club)
set -euo pipefail

cd "$(dirname "$0")/.."
VENV=.venv

if [ ! -x "$VENV/bin/python" ]; then
  echo "▶ Creando entorno Python en $VENV (solo la primera vez)"
  python3.11 -m venv "$VENV" 2>/dev/null || python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r pipeline/requirements.txt -c pipeline/constraints.txt
fi
PY="$VENV/bin/python"

INGEST_ARGS=()
if [ "${1:-}" = "--desde-cero" ]; then
  if [ "${2:-}" != "--si" ]; then
    read -r -p "Se borrarán TODAS las jugadoras, partidos y estadísticas descargados. ¿Seguir? [s/N] " ok
    [ "$ok" = "s" ] || [ "$ok" = "S" ] || { echo "Cancelado"; exit 1; }
  fi
  echo "▶ Borrando datos descargados (se conservan las ligas elegidas en /admin)"
  # Las fichas de Soccerdonna en caché se conservan: no cambian y evitan miles de peticiones a la web
  "$PY" -m pipeline.reset --confirmar --mantener-cache-soccerdonna
  INGEST_ARGS+=(--rebuild --refresh-photos)
fi

echo "▶ Tests del motor"
"$PY" -m unittest discover -s tests/pipeline -t tests/pipeline -q

echo "▶ Opta + fotos FotMob"
"$PY" -m pipeline.ingest "${INGEST_ARGS[@]+"${INGEST_ARGS[@]}"}"

echo "▶ Soccerdonna"
"$PY" -m pipeline.soccerdonna --refresh-days 30

echo "✓ Descarga completada"
