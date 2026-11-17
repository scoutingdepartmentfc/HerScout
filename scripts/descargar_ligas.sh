#!/usr/bin/env bash
# Descarga de ligas en local: lo mismo que el GitHub Action (.github/workflows/pipeline.yml), sin gastar
# minutos de GitHub. Usa las claves de .env.local y el entorno Python .venv (se crea la primera vez).
#
#   scripts/descargar_ligas.sh                       Martes: Opta, última temporada de cada liga de /admin
#   scripts/descargar_ligas.sh opta --liga ESP1      Solo una liga (código Soccerdonna de /admin)
#   scripts/descargar_ligas.sh opta --todas-temporadas
#   scripts/descargar_ligas.sh soccerdonna           Día 1: fichas, valor de mercado, traspasos, lesiones
#   scripts/descargar_ligas.sh todo                  Ambas, todas las temporadas elegidas
#   scripts/descargar_ligas.sh recalcular            Notas desde la caché, sin descargar
#   ... --escoba                                     Al final, coche escoba ceroacero.es (máx. 60 min)
#
# Cualquier otro flag se pasa tal cual a `python -m pipeline.sd_ligas` (--limit N, --max-matches N, ...).
set -euo pipefail

cd "$(dirname "$0")/.."
VENV=.venv

# Claves de Supabase / Opta desde .env.local (sin imprimirlas)
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi
export SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
if [ -z "$SUPABASE_URL" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "✗ Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local" >&2
  exit 1
fi

if [ ! -x "$VENV/bin/python" ]; then
  echo "▶ Creando entorno Python en $VENV (solo la primera vez)"
  python3.11 -m venv "$VENV" 2>/dev/null || python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r pipeline/requirements.txt -c pipeline/constraints.txt
fi
PY="$VENV/bin/python"

MODO="${1:-opta}"
[ $# -gt 0 ] && shift

ACCION=
case "$MODO" in
  opta) ACCION=actualizar-opta ;;
  soccerdonna) ACCION=actualizar-soccerdonna ;;
  recalcular) ACCION=recalcular ;;
  todo) ACCION=todo ;;
  *) echo "✗ Modo desconocido: $MODO (opta | soccerdonna | todo | recalcular)" >&2; exit 1 ;;
esac

ESCOBA=0
ARGS=(--refresco-dias 25 --sin-coche-escoba)
for a in "$@"; do
  if [ "$a" = "--escoba" ]; then ESCOBA=1; else ARGS+=("$a"); fi
done

echo "▶ Tests del motor"
"$PY" -m unittest discover -s tests/pipeline -t tests/pipeline -q

echo "▶ python -m pipeline.sd_ligas $ACCION ${ARGS[*]}"
"$PY" -m pipeline.sd_ligas "$ACCION" "${ARGS[@]}"

if [ "$ESCOBA" = 1 ]; then
  echo "▶ Coche escoba (ceroacero.es)"
  "$PY" -m pipeline.ceroacero --refresh-days 30 --max-minutos 60 || echo "⚠ Coche escoba con errores (no afecta a lo descargado)"
fi

echo "✓ Descarga completada"
