#!/usr/bin/env python3
"""
Selector interactivo con flechas en la terminal para ejecutar el coche escoba
de Ceroacero sobre jugadoras filtradas por Liga o por País completo.
"""

import os
import sys

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import curses
from collections import Counter
from typing import Dict, List, Optional, Tuple

def load_env():
    env_path = os.path.join(ROOT_DIR, ".env.local")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip("\"'"))

load_env()

from pipeline.storage import Store, get_supabase_client
from pipeline.ceroacero import CeroaceroSync


def obtener_datos(store: Store) -> Tuple[List[Tuple[str, int]], List[Tuple[str, int]]]:
    """Obtiene conteos de jugadoras agrupadas por liga y agrupadas por país."""
    print("⏳ Conectando con la base de datos y cargando jugadoras y ligas...")
    players = store.select_all("players", "id,current_league_name,sd_league_code,country,citizenship,current_team_id")
    sd_leagues = store.select_all("sd_leagues", "code,name,country")
    teams = store.select_all("teams", "id,country,league_name,sd_league_code")

    league_to_country = {}
    for l in sd_leagues:
        c = (l.get("country") or "").strip()
        if c:
            if l.get("code"):
                league_to_country[l["code"].lower()] = c
            if l.get("name"):
                league_to_country[l["name"].lower()] = c

    team_to_country = {}
    for t in teams:
        c = (t.get("country") or "").strip()
        if not c:
            t_sd = (t.get("sd_league_code") or "").lower()
            t_lg = (t.get("league_name") or "").lower()
            c = league_to_country.get(t_sd) or league_to_country.get(t_lg) or ""
        if c:
            team_to_country[t["id"]] = c

    league_counts = Counter()
    country_counts = Counter()

    for p in players:
        lname = p.get("current_league_name") or p.get("sd_league_code")
        if lname:
            league_counts[lname] += 1

        # Determinar país
        p_c = (p.get("country") or p.get("citizenship") or "").strip()
        if not p_c:
            team_id = p.get("current_team_id")
            if team_id and team_id in team_to_country:
                p_c = team_to_country[team_id]
        if not p_c and lname:
            p_c = league_to_country.get(lname.lower(), "")

        if p_c:
            country_counts[p_c] += 1

    return league_counts.most_common(), country_counts.most_common()


def interactive_menu(stdscr, ligas: List[Tuple[str, int]], paises: List[Tuple[str, int]]) -> Tuple[str, Optional[str], bool]:
    """
    Menú interactivo con soporte de pestañas: [1] Por País, [2] Por Liga.
    Devuelve (tipo_filtro, valor, modo_prueba).
    """
    curses.curs_set(0)
    curses.use_default_colors()

    # Colores
    curses.init_pair(1, curses.COLOR_BLACK, curses.COLOR_GREEN)
    curses.init_pair(2, curses.COLOR_CYAN, -1)
    curses.init_pair(3, curses.COLOR_YELLOW, -1)
    curses.init_pair(4, curses.COLOR_GREEN, -1)
    curses.init_pair(5, curses.COLOR_MAGENTA, -1)

    tab = 0  # 0: PAÍSES, 1: LIGAS
    current_idx = 0
    top_idx = 0
    modo_prueba = False

    options_paises = [("TODOS LOS PAÍSES (Global)", sum(c for _, c in paises))] + paises
    options_ligas = [("TODAS LAS LIGAS (Global)", sum(c for _, c in ligas))] + ligas

    while True:
        options = options_paises if tab == 0 else options_ligas
        stdscr.clear()
        h, w = stdscr.getmaxyx()

        # Cabecera
        titulo = " HerScout · PROCESO ESCOBA CEROACERO (FOTOS Y DATOS) "
        stdscr.attron(curses.color_pair(2) | curses.A_BOLD)
        stdscr.addstr(1, max(2, (w - len(titulo)) // 2), titulo)
        stdscr.attroff(curses.color_pair(2) | curses.A_BOLD)

        # Tabs de selección
        tab_str = "[ TAB / 1: POR PAÍS ]" if tab == 0 else "  TAB / 1: POR PAÍS  "
        tab_str2 = "[ TAB / 2: POR LIGA ]" if tab == 1 else "  TAB / 2: POR LIGA  "
        tabs_line = f"  Vista: {tab_str}   {tab_str2}"
        stdscr.attron(curses.color_pair(5) | curses.A_BOLD)
        stdscr.addstr(2, max(2, (w - len(tabs_line)) // 2), tabs_line)
        stdscr.attroff(curses.color_pair(5) | curses.A_BOLD)

        # Instrucciones
        instrucciones = "↑ / ↓: Navegar  ·  [TAB]: Cambiar País/Liga  ·  [ESPACIO]: Modo Prueba  ·  [ENTER]: EJECUTAR  ·  [Q]: Salir"
        stdscr.addstr(3, max(2, (w - len(instrucciones)) // 2), instrucciones, curses.A_DIM)

        # Estado del modo prueba
        prueba_str = f"Modo actual: {'[MODO PRUEBA (solo lectura)]' if modo_prueba else '[MODO REAL (guarda fotos y datos en BD)]'}"
        stdscr.addstr(4, max(2, (w - len(prueba_str)) // 2), prueba_str, curses.color_pair(3 if modo_prueba else 4) | curses.A_BOLD)

        # Separador
        stdscr.addstr(5, 2, "─" * (w - 4), curses.A_DIM)

        # Lista paginada
        visible_lines = h - 8
        if current_idx < top_idx:
            top_idx = current_idx
        elif current_idx >= top_idx + visible_lines:
            top_idx = current_idx - visible_lines + 1

        for i in range(visible_lines):
            item_idx = top_idx + i
            if item_idx >= len(options):
                break

            name, count = options[item_idx]
            prefix_type = "País: " if tab == 0 and item_idx > 0 else ("Liga: " if tab == 1 and item_idx > 0 else "")
            display_name = f"{prefix_type}{name}".ljust(46)
            line_str = f"  {display_name} ({count} jugadoras)  "
            y = 6 + i
            x = 4

            if item_idx == current_idx:
                stdscr.attron(curses.color_pair(1) | curses.A_BOLD)
                stdscr.addstr(y, x, f" ► {line_str[:w - 10]}")
                stdscr.attroff(curses.color_pair(1) | curses.A_BOLD)
            else:
                stdscr.addstr(y, x, f"   {line_str[:w - 10]}")

        stdscr.refresh()

        key = stdscr.getch()
        if key in (curses.KEY_UP, ord('k'), ord('K')):
            current_idx = (current_idx - 1) % len(options)
        elif key in (curses.KEY_DOWN, ord('j'), ord('J')):
            current_idx = (current_idx + 1) % len(options)
        elif key in (ord('\t'), ord('1'), ord('2')):
            if key == ord('1'):
                tab = 0
            elif key == ord('2'):
                tab = 1
            else:
                tab = 1 - tab
            current_idx = 0
            top_idx = 0
        elif key in (curses.KEY_PPAGE,):
            current_idx = max(0, current_idx - visible_lines)
        elif key in (curses.KEY_NPAGE,):
            current_idx = min(len(options) - 1, current_idx + visible_lines)
        elif key == ord(' '):
            modo_prueba = not modo_prueba
        elif key in (ord('\n'), ord('\r'), curses.KEY_ENTER):
            choice = options[current_idx][0]
            if tab == 0:
                val = None if "TODOS" in choice else choice
                return "country", val, modo_prueba
            else:
                val = None if "TODAS" in choice else choice
                return "league", val, modo_prueba
        elif key in (ord('q'), ord('Q'), 27):  # ESC o Q
            sys.exit(0)


def main():
    store = Store(get_supabase_client())
    ligas, paises = obtener_datos(store)

    if not ligas and not paises:
        print("No se encontraron jugadoras en la base de datos.")
        return

    try:
        tipo_filtro, valor_elegido, modo_prueba = curses.wrapper(interactive_menu, ligas, paises)
    except KeyboardInterrupt:
        sys.exit(0)

    print("\n" + "=" * 60)
    print(f"🚀 Iniciando proceso escoba de Ceroacero...")
    if tipo_filtro == "country":
        print(f"🌍 Filtro por PAÍS: {valor_elegido or 'TODOS LOS PAÍSES'}")
        sync = CeroaceroSync(refresh_days=30, prueba=modo_prueba, country=valor_elegido)
    else:
        print(f"🏆 Filtro por LIGA: {valor_elegido or 'TODAS LAS LIGAS'}")
        sync = CeroaceroSync(refresh_days=30, prueba=modo_prueba, league=valor_elegido)

    print(f"🛠️  Modo: {'SOLO LECTURA / PRUEBA (sin escribir en BD)' if modo_prueba else 'REAL (actualizando fotos sin fondo y datos en BD)'}")
    print("=" * 60 + "\n")

    sync.run()
    print("\n✓ Proceso completado exitosamente.")


if __name__ == "__main__":
    main()
