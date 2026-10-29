"""
pipeline/events.py
Normalización de los feeds de Opta de un partido:
- matchevent → DataFrame de eventos con el mismo formato que usa Debrecen_app
  (columnas 'Event Name', 'Pass End X', qualifiers por nombre con valor o "Sí"/"No").
- matchstats + "Team set up" + "Player on" → alineación por jugador con minutos,
  formación, slot táctico, demarcación (incluidos suplentes), capitanía y stats oficiales.
"""

from typing import Any, Dict, List, Optional

import pandas as pd

from .positions import asignar_demarcacion, demarcacion_por_posicion_opta, get_grupo_demarcacion

EVENT_TYPE_MAPPING = {
    1: "Pass", 2: "Offside Pass", 3: "Take On", 4: "Foul", 5: "Out",
    6: "Corner Awarded", 7: "Tackle", 8: "Interception", 10: "Save",
    11: "Claim", 12: "Clearance", 13: "Miss", 14: "Post", 15: "Attempt Saved",
    16: "Goal", 17: "Card", 18: "Player off", 19: "Player on", 20: "Player retired",
    21: "Player returns", 22: "Player becomes goalkeeper", 23: "Goalkeeper becomes player",
    24: "Condition change", 25: "Official change", 27: "Start delay", 28: "End delay",
    29: "Temporary stop", 30: "End", 32: "Start", 34: "Team set up",
    36: "Player changed Jersey number", 37: "Collection End", 38: "Temp Goal",
    39: "Temp Attempt", 40: "Formation change", 41: "Punch", 42: "Good skill",
    43: "Deleted event", 44: "Aerial", 45: "Challenge", 47: "Rescinded card",
    49: "Ball recovery", 50: "Dispossessed", 51: "Error", 52: "Keeper pick-up",
    53: "Cross not claimed", 54: "Smother", 55: "Offside provoked", 56: "Shield ball opp",
    57: "Foul throw-in", 58: "Penalty faced", 59: "Keeper Sweeper", 60: "Chance missed",
    61: "Ball touch", 63: "Temp Save", 64: "Resume", 65: "Contentious referee decision",
    67: "50/50", 68: "Referee Drop Ball", 69: "Failed to Block", 70: "Injury Time Announcement",
    71: "Coach Setup", 72: "Caught Offside", 73: "Other Ball Contact", 74: "Blocked Pass",
    75: "Delayed start", 76: "Early end", 79: "Coverage interruption", 80: "Drop of Ball",
    81: "Obstacle", 82: "Control", 83: "Attempted tackle", 84: "Deleted After Review"
}

# Solo los qualifiers que usan el motor de métricas y los modelos xG/xA
QUALIFIER_MAPPING = {
    1: "Long ball", 2: "Cross", 3: "Head pass", 4: "Through ball", 5: "Free kick taken",
    6: "Corner taken", 9: "Penalty", 15: "Head", 20: "Right footed", 21: "Other body part",
    23: "Fast break", 25: "From corner", 26: "Free kick", 28: "Own Goal",
    30: "Involved", 31: "Yellow Card", 32: "Second yellow", 33: "Red Card",
    36: "Violent Conduct", 59: "Jersey Number", 72: "Left footed", 89: "1 on 1",
    107: "Throw in", 108: "Volley", 130: "Team Formation", 131: "Team Player Formation",
    140: "Pass End X", 141: "Pass End Y", 145: "Formation slot", 155: "Chipped",
    159: "Foul and Abusive Language", 168: "Flick-on", 194: "Captain", 196: "Switch of play",
    210: "Assist", 212: "Length", 214: "Big chance", 215: "Individual play",
    236: "Blocked pass", 245: "Serious Foul", 328: "First Touch", 348: "Penalty taker ID",
    386: "Driven cross", 387: "Floated cross", 465: "Take on overtake", 467: "Defensive 1 v 1",
}

# Eventos que no son acciones reales de juego
EVENTOS_DESCARTADOS = {43, 84}
# Periodo 5 = tanda de penaltis (no cuenta para métricas de juego)
PERIODOS_DESCARTADOS = {5}


def _split_csv(val: Any) -> List[str]:
    return [x.strip() for x in str(val or '').split(',') if x.strip()]


def events_to_dataframe(match_events: Dict[str, Any]) -> pd.DataFrame:
    """Convierte el JSON de matchevent al DataFrame plano con columnas por nombre de qualifier."""
    match_info = match_events.get('matchInfo', {})
    match_id = match_info.get('id')
    events = match_events.get('liveData', {}).get('event', []) or []

    rows = []
    for ev in events:
        type_id = ev.get('typeId')
        if type_id in EVENTOS_DESCARTADOS or ev.get('periodId') in PERIODOS_DESCARTADOS:
            continue
        row = {
            'Match ID': match_id,
            'EventId': ev.get('eventId'),
            'typeId': type_id,
            'Event Name': EVENT_TYPE_MAPPING.get(type_id, f"Type {type_id}"),
            'periodId': ev.get('periodId'),
            'timeMin': ev.get('timeMin'),
            'timeSec': ev.get('timeSec'),
            'timeStamp': ev.get('timeStamp'),
            'Team ID': ev.get('contestantId'),
            'playerId': ev.get('playerId'),
            'playerName': ev.get('playerName'),
            'outcome': ev.get('outcome'),
            'x': ev.get('x'),
            'y': ev.get('y'),
        }
        for q in ev.get('qualifier', []) or []:
            try:
                qid = int(q.get('qualifierId'))
            except (TypeError, ValueError):
                continue
            name = QUALIFIER_MAPPING.get(qid)
            if not name:
                continue
            val = q.get('value')
            row[name] = str(val) if val is not None else "Sí"
        # Los autogoles no cuentan como goles del jugador
        if type_id == 16 and 'Own Goal' in row:
            row['Event Name'] = 'Own goal'
        rows.append(row)

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    for name in QUALIFIER_MAPPING.values():
        if name not in df.columns:
            df[name] = "No"
        else:
            df[name] = df[name].fillna("No")
    return df


def _stats_dict(player: Dict[str, Any]) -> Dict[str, float]:
    out = {}
    for st in player.get('stat', []) or []:
        try:
            out[st.get('type')] = float(st.get('value'))
        except (TypeError, ValueError):
            continue
    return out


def build_lineups(match_stats: Optional[Dict[str, Any]], df_events: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
    """
    Devuelve {player_id: info} para todos los jugadores que disputaron minutos.
    - Titulares: formación y slot del evento "Team set up" (qualifiers 130/131/30),
      con respaldo en `formationUsed`/`formationPlace` de matchstats.
    - Suplentes: slot del evento "Player on" (qualifier 145) con la formación vigente al entrar.
    - Cambios de formación (evento 40): se reparten los minutos por tramos y se queda
      la demarcación en la que más minutos jugó en el partido.
    """
    setup_formation: Dict[str, Any] = {}
    captains = set()
    # Tramos (minuto, formación, slot) de cada jugador: la formación puede cambiar durante el partido
    # (evento 40) y el slot de un suplente (evento 19) se refiere a la formación vigente al entrar.
    tramos: Dict[str, List[Any]] = {}
    salida: Dict[str, float] = {}
    fin_partido = 90.0
    if not df_events.empty:
        fin_partido = max(90.0, float(pd.to_numeric(df_events['timeMin'], errors='coerce').max() or 90))
        formacion_actual: Dict[str, Any] = {}
        cambios = df_events[df_events['typeId'].isin([34, 40, 19, 18])].copy()
        cambios['_t'] = pd.to_numeric(cambios['timeMin'], errors='coerce').fillna(0) \
            + pd.to_numeric(cambios['timeSec'], errors='coerce').fillna(0) / 60
        for _, row in cambios.sort_values(['_t', 'EventId']).iterrows():
            tid, t, tipo = row['Team ID'], (0.0 if row['typeId'] == 34 else row['_t']), row['typeId']
            if tipo in (34, 40):
                formation = row.get('Team Formation')
                if formation not in (None, 'No', ''):
                    formacion_actual[tid] = formation
                    if tipo == 34:
                        setup_formation[tid] = formation
                for pid, slot in zip(_split_csv(row.get('Involved')), _split_csv(row.get('Team Player Formation'))):
                    try:
                        slot_i = int(float(slot))
                    except ValueError:
                        continue
                    if slot_i > 0:  # los suplentes (aún sin entrar) aparecen con slot 0
                        tramos.setdefault(pid, []).append((t, formacion_actual.get(tid), slot_i))
                if tipo == 34:
                    cap = row.get('Captain')
                    if cap not in (None, 'No', '', 'Sí'):
                        captains.add(str(cap))
            elif tipo == 19:
                slot = row.get('Formation slot')
                if row.get('playerId') and slot not in (None, 'No', ''):
                    try:
                        tramos.setdefault(row['playerId'], []).append((t, formacion_actual.get(tid), int(float(slot))))
                    except ValueError:
                        pass
            elif tipo == 18 and row.get('playerId'):
                salida[row['playerId']] = t

    def demarcacion_dominante(pid: str, slot_posicion: Dict[int, Any]):
        """Demarcación con más minutos del jugador en el partido y su (formación, slot)."""
        lista = tramos.get(pid) or []
        minutos: Dict[str, float] = {}
        origen: Dict[str, Any] = {}
        for i, (t, formation, slot) in enumerate(lista):
            fin = lista[i + 1][0] if i + 1 < len(lista) else salida.get(pid, fin_partido)
            dem = asignar_demarcacion(formation, slot) or (
                demarcacion_por_posicion_opta(*slot_posicion[slot]) if slot in slot_posicion else None)
            if dem:
                # max(.., 0.01): un tramo de duración 0 (cambio en el mismo minuto) sigue contando si es el único
                minutos[dem] = minutos.get(dem, 0) + max(fin - t, 0.01)
                origen.setdefault(dem, (formation, slot))
        if not minutos:
            return None, None, None
        dem = max(minutos, key=minutos.get)
        return dem, origen[dem][0], origen[dem][1]

    lineups: Dict[str, Dict[str, Any]] = {}
    live = (match_stats or {}).get('liveData', {})
    for team in live.get('lineUp', []) or []:
        tid = team.get('contestantId')
        formation = setup_formation.get(tid) or team.get('formationUsed')
        # Posición oficial Opta de cada slot (la heredan los suplentes que entran en ese slot)
        slot_posicion = {}
        for p in team.get('player', []) or []:
            if p.get('formationPlace') and p.get('position') != 'Substitute':
                slot_posicion[int(float(p['formationPlace']))] = (p.get('position'), p.get('positionSide'))
        for p in team.get('player', []) or []:
            pid = p.get('playerId')
            if not pid:
                continue
            stats = _stats_dict(p)
            mins = stats.get('minsPlayed', 0.0)
            if mins < 1:
                continue
            dem, form_dem, slot = demarcacion_dominante(pid, slot_posicion)
            if dem is None:
                # Sin eventos de alineación: respaldo con formationPlace de matchstats
                form_dem = formation
                slot = int(float(p['formationPlace'])) if p.get('formationPlace') else None
                dem = asignar_demarcacion(formation, slot) if slot else None
                if not dem and slot in slot_posicion:
                    dem = demarcacion_por_posicion_opta(*slot_posicion[slot])
                if not dem and p.get('subPosition'):
                    # Suplente sin evento "Player on": posición oficial con la que entró
                    dem = demarcacion_por_posicion_opta(p['subPosition'], p.get('positionSide'))
            lineups[pid] = {
                'player_id': pid,
                'team_id': tid,
                'match_name': p.get('matchName'),
                'first_name': p.get('firstName'),
                'last_name': p.get('lastName'),
                'shirt_number': p.get('shirtNumber'),
                'minutes': mins,
                'is_starter': stats.get('gameStarted', 0) > 0 or p.get('position') != 'Substitute',
                'is_captain': p.get('captain') == 'yes' or pid in captains,
                'formation': str(form_dem) if form_dem is not None else None,
                'slot': slot,
                'demarcacion': dem,
                'grupo_demarcacion': get_grupo_demarcacion(dem) if dem else None,
                'stats': stats,
            }
    return lineups


def match_metadata(fixture: Dict[str, Any], match_stats: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Datos básicos del partido: equipos local/visitante, fecha y marcador final."""
    info = (match_stats or {}).get('matchInfo') or fixture.get('matchInfo', {})
    live = (match_stats or {}).get('liveData') or fixture.get('liveData', {})
    contestants = info.get('contestant', []) or []
    home = next((c for c in contestants if c.get('position') == 'home'), contestants[0] if contestants else {})
    away = next((c for c in contestants if c.get('position') == 'away'), contestants[1] if len(contestants) > 1 else {})
    ft = live.get('matchDetails', {}).get('scores', {}).get('ft', {}) or {}
    date = info.get('date', '').replace('Z', '')
    time_ = (info.get('time') or '').replace('Z', '')
    return {
        'id': info.get('id'),
        'home': home,
        'away': away,
        'match_date': f"{date}T{time_}Z" if date and time_ else (f"{date}T00:00:00Z" if date else None),
        'home_score': ft.get('home'),
        'away_score': ft.get('away'),
    }
