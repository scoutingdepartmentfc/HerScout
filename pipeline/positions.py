"""
pipeline/positions.py
Lógica de mapeo de formaciones tácticas y slots a las 11 posiciones estándar.
Preserva fielmente el mapeo del proyecto original de Scouting / Debrecen_app / Libreria Lucas.
"""

FORMATION_MAP = {
    '442': 2, '41212': 3, '433': 4, '451': 5, '4411': 6, '4141': 7,
    '4231': 8, '4321': 9, '532': 10, '541': 11, '352': 12, '343': 13,
    '4222': 15, '3511': 16, '3421': 17, '3412': 18, '3142': 19,
    '343d': 20, '4132': 21, '4240': 22, '4312': 23, '3241': 24, '3331': 25
}

def asignar_demarcacion(formation, slot):
    """
    Retorna una de las 11 demarcaciones estándar en español según formation y slot.
    `formation` admite el ID numérico de Opta (qualifier 130, p.ej. 8) o el string ('4231').
    """
    try:
        f_str = str(formation).strip()
        f = FORMATION_MAP.get(f_str, int(float(f_str)))
        s = int(float(slot))
    except (ValueError, TypeError):
        return None

    if s <= 0:
        return None

    if s == 1:
        return 'Portero'

    # Laterales
    if 2 <= f <= 23:
        if s == 2:
            return 'Lateral Derecho'
        if s == 3:
            return 'Lateral Izquierdo'

    # Centrales
    if (f in [2, 3, 4, 5, 6, 7, 8, 9, 15, 19, 21, 22, 23] and s == 5) or \
       (f in [11, 12, 13, 16, 17, 18, 20, 24, 25] and s == 6):
        return 'Central Derecho'
    if (f in [2, 3, 4, 5, 6, 7, 8, 9, 15, 19, 21, 22, 23] and s == 6) or \
       (f in [11, 12, 13, 16, 17, 18, 20, 24, 25] and s == 4):
        return 'Central Izquierdo'

    # Mediocentros y Pivotes
    if (f in [2, 6, 8, 15, 22] and s == 4) or \
       (f in [5, 12, 13, 16] and s == 8) or \
       (f in [11, 12] and s == 4) or \
       (f == 23 and s == 10) or \
       (f == 5 and s == 7):
        return 'Mediocentro'

    if (f in [24, 25] and s in [2, 3]) or \
       (f in [3, 4, 7, 9, 21, 23] and s == 4) or \
       (f in [10, 13, 17, 18] and s == 7) or \
       (f in [2, 6, 8, 11, 15, 17, 18, 19, 20, 25] and s == 8) or \
       (f in [5, 11] and s == 10) or \
       (f in [10, 12, 16] and s == 11):
        return 'Mediocentro Defensivo'

    # Mediapuntas
    if (f == 5 and s == 4) or \
       (f in [4, 15, 19, 20, 24, 25] and s == 7) or \
       (f in [3, 4, 7, 21, 23, 24] and s == 8) or \
       (f == 18 and s == 9) or \
       (f in [6, 7, 9, 12, 16, 21, 22] and s == 10) or \
       (f in [9, 15, 17, 19] and s == 11):
        return 'Mediapunta'

    # Extremos
    if (f in [2, 3, 5, 6, 7, 8, 11, 21, 22] and s == 7) or \
       (f in [4, 13, 20, 24, 25] and s == 10):
        return 'Extremo Derecho'
    if (f in [2, 3, 4, 5, 6, 7, 11, 13, 20, 21, 22, 24, 25] and s == 11):
        return 'Extremo Izquierdo'

    # Delanteros
    if (f in [2, 3, 6, 10, 12, 15, 16, 19, 21, 22, 23] and s in [9, 10]) or \
       (f in [4, 5, 8, 9, 11, 13, 17, 20, 24, 25] and s == 9):
        return 'Delantero'

    # Slot no mapeado para esa formación: mejor no clasificar que clasificar mal
    return None


def get_grupo_demarcacion(dem):
    """
    Agrupa en 7 familias tácticas para normalización de scores y percentiles.
    """
    if dem in ['Lateral Derecho', 'Lateral Izquierdo']:
        return 'Laterales'
    if dem in ['Central Derecho', 'Central Izquierdo']:
        return 'Centrales'
    if dem in ['Mediocentro', 'Mediocentro Defensivo']:
        return 'Medios'
    if dem == 'Mediapunta':
        return 'Mediapuntas'
    if dem in ['Extremo Derecho', 'Extremo Izquierdo']:
        return 'Extremos'
    if dem == 'Delantero':
        return 'Delanteros'
    return 'Porteros'


def demarcacion_por_posicion_opta(position, side):
    """
    Respaldo cuando la tabla formación/slot no cubre el caso (p.ej. 4-2-3-1 slots 10 y 11,
    4-1-4-1 slot 9, 4-3-2-1 slots 7 y 8): usa la posición oficial de Opta en matchstats
    (`position` + `positionSide` del titular que ocupaba ese slot).
    """
    pos = str(position or '').lower()
    side = str(side or '').lower()
    lado_izq = side == 'left'
    lado_der = side == 'right'

    if pos == 'goalkeeper':
        return 'Portero'
    if pos in ('defender', 'wing back'):
        if lado_izq:
            return 'Lateral Izquierdo'
        if lado_der:
            return 'Lateral Derecho'
        if pos == 'wing back':
            return 'Lateral Izquierdo' if 'left' in side else 'Lateral Derecho'
        return 'Central Izquierdo' if 'left' in side else 'Central Derecho'
    if pos == 'defensive midfielder':
        return 'Mediocentro Defensivo'
    if pos == 'midfielder':
        if lado_izq:
            return 'Extremo Izquierdo'
        if lado_der:
            return 'Extremo Derecho'
        return 'Mediocentro'
    if pos == 'attacking midfielder':
        if lado_izq:
            return 'Extremo Izquierdo'
        if lado_der:
            return 'Extremo Derecho'
        return 'Mediapunta'
    if pos in ('striker', 'forward', 'attacker'):
        if lado_izq:
            return 'Extremo Izquierdo'
        if lado_der:
            return 'Extremo Derecho'
        return 'Delantero'
    return None
