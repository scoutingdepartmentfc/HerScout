"""
tests/test_scouting_pipeline.py
Pruebas unitarias de equivalencia y robustez para el motor de scouting.
Verifica:
1. Asignación de demarcaciones (tabla formación/slot y respaldo con la posición Opta).
2. Alineaciones: minutos reales, suplentes heredan el slot del "Player on", capitán.
3. Motor de métricas: goles, tarjetas, xG solo en tiros y xA solo en pases clave.
4. Escala 0-9.9, ponderaciones del score general y percentiles.
5. Emparejamiento de jugadores con FotMob.
"""

import unittest

import numpy as np
import pandas as pd

from pipeline.events import build_lineups, events_to_dataframe
from pipeline.metrics_engine import MetricsEngine
from pipeline.photos import emparejar_equipos, emparejar_jugador, normalizar
from pipeline.positions import asignar_demarcacion, demarcacion_por_posicion_opta, get_grupo_demarcacion
from pipeline.scoring import PESOS, calcular_temporada, scale_0_10


def q(qid, value=None):
    d = {"qualifierId": qid}
    if value is not None:
        d["value"] = value
    return d


def partido_sintetico():
    """Partido mínimo: 4-2-3-1 (Opta id 8) vs 4-4-2, un gol con asistencia, una amarilla y un cambio."""
    eventos = [
        {"eventId": 1, "typeId": 34, "periodId": 16, "timeMin": 0, "timeSec": 0, "contestantId": "t1",
         "qualifier": [q(30, "gk1, st1, am1, lw1"), q(131, "1, 9, 10, 0"), q(130, "8"), q(194, "st1")]},
        {"eventId": 2, "typeId": 34, "periodId": 16, "timeMin": 0, "timeSec": 0, "contestantId": "t2",
         "qualifier": [q(30, "gk2, cb2"), q(131, "1, 5"), q(130, "2")]},
        {"eventId": 10, "typeId": 1, "periodId": 1, "timeMin": 10, "timeSec": 0, "contestantId": "t1", "playerId": "am1",
         "outcome": 1, "x": 60.0, "y": 50.0, "qualifier": [q(140, "88"), q(141, "50"), q(210, "16")]},
        {"eventId": 11, "typeId": 16, "periodId": 1, "timeMin": 10, "timeSec": 2, "contestantId": "t1", "playerId": "st1",
         "outcome": 1, "x": 90.0, "y": 50.0, "qualifier": [q(20)]},
        {"eventId": 12, "typeId": 1, "periodId": 1, "timeMin": 20, "timeSec": 0, "contestantId": "t1", "playerId": "am1",
         "outcome": 1, "x": 30.0, "y": 50.0, "qualifier": [q(140, "35"), q(141, "52")]},
        {"eventId": 13, "typeId": 17, "periodId": 2, "timeMin": 60, "timeSec": 0, "contestantId": "t2", "playerId": "cb2",
         "outcome": 1, "x": 0.0, "y": 0.0, "qualifier": [q(31)]},
        {"eventId": 14, "typeId": 7, "periodId": 2, "timeMin": 61, "timeSec": 0, "contestantId": "t2", "playerId": "cb2",
         "outcome": 1, "x": 20.0, "y": 40.0, "qualifier": []},
        {"eventId": 15, "typeId": 19, "periodId": 2, "timeMin": 70, "timeSec": 0, "contestantId": "t1", "playerId": "sub1",
         "outcome": 1, "x": 0.0, "y": 0.0, "qualifier": [q(145, "10")]},
        {"eventId": 16, "typeId": 1, "periodId": 2, "timeMin": 75, "timeSec": 0, "contestantId": "t1", "playerId": "sub1",
         "outcome": 0, "x": 70.0, "y": 30.0, "qualifier": [q(140, "80"), q(141, "30")]},
        {"eventId": 17, "typeId": 43, "periodId": 2, "timeMin": 80, "timeSec": 0, "contestantId": "t1", "playerId": "st1",
         "outcome": 1, "x": 90.0, "y": 50.0, "qualifier": []},
    ]

    def jugador(pid, slot, mins, pos, side, extra=None, sub=False):
        stats = [{"type": "minsPlayed", "value": str(mins)}] + (extra or [])
        if not sub:
            stats.append({"type": "gameStarted", "value": "1"})
        p = {"playerId": pid, "matchName": pid.upper(), "shirtNumber": 7, "stat": stats,
             "position": "Substitute" if sub else pos, "positionSide": side}
        if not sub:
            p["formationPlace"] = str(slot)
        return p

    stats = {
        "matchInfo": {"id": "m1", "date": "2026-10-18Z", "time": "16:00:00Z",
                      "contestant": [{"id": "t1", "name": "Uno", "position": "home"},
                                     {"id": "t2", "name": "Dos", "position": "away"}]},
        "liveData": {
            "matchDetails": {"scores": {"ft": {"home": 1, "away": 0}}},
            "lineUp": [
                {"contestantId": "t1", "formationUsed": "4231", "player": [
                    jugador("gk1", 1, 90, "Goalkeeper", "Centre"),
                    jugador("st1", 9, 90, "Striker", "Centre", [{"type": "goals", "value": "1"}, {"type": "totalScoringAtt", "value": "1"}]),
                    jugador("am1", 10, 70, "Attacking Midfielder", "Centre", [{"type": "goalAssist", "value": "1"}]),
                    jugador("lw1", 11, 90, "Attacking Midfielder", "Left"),
                    jugador("sub1", None, 20, None, None, sub=True),
                    jugador("unused", None, 0, None, None, sub=True),
                ]},
                {"contestantId": "t2", "formationUsed": "442", "player": [
                    jugador("gk2", 1, 90, "Goalkeeper", "Centre"),
                    jugador("cb2", 5, 90, "Defender", "Centre/Right", [{"type": "yellowCard", "value": "1"},
                                                                       {"type": "wonTackle", "value": "1"}]),
                ]},
            ],
        },
    }
    return {"matchInfo": {"id": "m1"}, "liveData": {"event": eventos}}, stats


class TestPositionsMapping(unittest.TestCase):
    def test_goalkeeper_slot(self):
        self.assertEqual(asignar_demarcacion('442', 1), 'Portero')
        self.assertEqual(asignar_demarcacion('433', 1), 'Portero')
        self.assertEqual(get_grupo_demarcacion('Portero'), 'Porteros')

    def test_fullbacks_slots(self):
        self.assertEqual(asignar_demarcacion(2, 2), 'Lateral Derecho')
        self.assertEqual(asignar_demarcacion(2, 3), 'Lateral Izquierdo')
        self.assertEqual(get_grupo_demarcacion('Lateral Derecho'), 'Laterales')

    def test_centerbacks(self):
        self.assertEqual(asignar_demarcacion(2, 5), 'Central Derecho')
        self.assertEqual(asignar_demarcacion(2, 6), 'Central Izquierdo')

    def test_strikers(self):
        self.assertEqual(asignar_demarcacion(2, 9), 'Delantero')
        self.assertEqual(asignar_demarcacion(2, 10), 'Delantero')

    def test_formation_id_y_string_equivalentes(self):
        self.assertEqual(asignar_demarcacion('4231', 7), asignar_demarcacion('8', 7))

    def test_hueco_tabla_devuelve_none(self):
        # 4-2-3-1 slots 10/11 no están en la tabla original: no se inventa demarcación
        self.assertIsNone(asignar_demarcacion(8, 10))

    def test_respaldo_posicion_opta(self):
        self.assertEqual(demarcacion_por_posicion_opta('Attacking Midfielder', 'Centre'), 'Mediapunta')
        self.assertEqual(demarcacion_por_posicion_opta('Attacking Midfielder', 'Left'), 'Extremo Izquierdo')
        self.assertEqual(demarcacion_por_posicion_opta('Defender', 'Left/Centre'), 'Central Izquierdo')
        self.assertEqual(demarcacion_por_posicion_opta('Defensive Midfielder', 'Centre/Right'), 'Mediocentro Defensivo')


class TestLineups(unittest.TestCase):
    def setUp(self):
        ev, st = partido_sintetico()
        self.lineups = build_lineups(st, events_to_dataframe(ev))

    def test_solo_jugadores_con_minutos(self):
        self.assertNotIn('unused', self.lineups)
        self.assertEqual(self.lineups['am1']['minutes'], 70)

    def test_demarcaciones_4231_con_respaldo(self):
        self.assertEqual(self.lineups['st1']['demarcacion'], 'Delantero')
        self.assertEqual(self.lineups['am1']['demarcacion'], 'Mediapunta')
        self.assertEqual(self.lineups['lw1']['demarcacion'], 'Extremo Izquierdo')

    def test_suplente_hereda_slot(self):
        sub = self.lineups['sub1']
        self.assertFalse(sub['is_starter'])
        self.assertEqual(sub['slot'], 10)
        self.assertEqual(sub['demarcacion'], 'Mediapunta')

    def test_capitan(self):
        self.assertTrue(self.lineups['st1']['is_captain'])
        self.assertFalse(self.lineups['gk1']['is_captain'])


class TestMetricsEngine(unittest.TestCase):
    def setUp(self):
        ev, st = partido_sintetico()
        self.rows = {r['player_id']: r for r in MetricsEngine(ev, st).process_match()}

    def test_goles_asistencias_y_tarjetas(self):
        self.assertEqual(self.rows['st1']['goals'], 1)
        self.assertEqual(self.rows['am1']['assists'], 1)
        self.assertEqual(self.rows['cb2']['yellow_cards'], 1)
        self.assertEqual(self.rows['cb2']['red_cards'], 0)

    def test_evento_borrado_no_cuenta(self):
        # 1 tiro en 90' (el evento borrado typeId 43 no suma; of_tiros no puntúa doble)
        self.assertEqual(self.rows['st1']['metrics']['of_tiros_p90'], 1.0)

    def test_matchstats_manda_sobre_eventos(self):
        # Opta omite las stats a 0: lo que no viene en matchstats cuenta como 0
        self.assertEqual(self.rows['st1']['metrics']['of_goles_p90'], 1.0)
        self.assertEqual(self.rows['gk1']['metrics']['of_tiros_p90'], 0.0)

    def test_solo_matchstats_sin_eventing(self):
        _, st = partido_sintetico()
        rows = {r['player_id']: r for r in MetricsEngine(None, st).process_match()}
        self.assertEqual(rows['st1']['demarcacion'], 'Delantero')
        self.assertEqual(rows['st1']['metrics']['of_tiros_p90'], 1.0)
        self.assertEqual(rows['st1']['xg'], 0.0)
        self.assertNotIn('of_xG_p90', rows['st1']['metrics'])

    def test_xg_y_xa(self):
        self.assertGreater(self.rows['st1']['xg'], 0)
        self.assertGreater(self.rows['am1']['xa'], 0)   # pase con qualifier 210 (pase clave)
        self.assertEqual(self.rows['gk1']['xa'], 0)
        self.assertEqual(self.rows['sub1']['xa'], 0)    # pase normal: sin xA

    def test_metricas_completas(self):
        m = self.rows['am1']['metrics']
        self.assertGreater(len(m), 100)
        self.assertTrue(all(np.isfinite(v) for v in m.values()))


class TestScoring(unittest.TestCase):
    def test_scale_bounds(self):
        s = scale_0_10(pd.Series([0, 1, 2, 3, 10, np.nan]))
        self.assertTrue(((s >= 0) & (s <= 10)).all())
        self.assertEqual(s.iloc[-1], 5.0)
        self.assertEqual(s.iloc[4], 10.0)
        self.assertEqual(s.iloc[0], 0.0)

    def test_scale_invert(self):
        s = scale_0_10(pd.Series([0, 5, 10]), invert=True)
        self.assertGreater(s.iloc[0], s.iloc[2])

    def test_temporada(self):
        rng = np.random.default_rng(0)
        filas = []
        for m in range(6):
            for p in range(8):
                filas.append({
                    'match_id': f'm{m}', 'player_id': f'p{p}', 'team_id': 't', 'player_name': f'P{p}',
                    'match_date': f'2026-10-{m + 10}T16:00:00Z', 'demarcacion': 'Delantero',
                    'grupo_demarcacion': 'Delanteros', 'minutes_played': 90, 'is_starter': True,
                    **{c: 0 for c in ['goals', 'assists', 'xg', 'xa', 'xca', 'passes_completed', 'passes_total',
                                      'progressive_passes', 'takeons_successful', 'takeons_total', 'tackles_won',
                                      'tackles_total', 'interceptions', 'recoveries', 'aerials_won', 'aerials_total']},
                    'of_goles_p90': rng.random() * (p + 1), 'def_entradas_p90': rng.random(),
                    'abp_lanzador_corner_p90': rng.random(), 'comp_minutos': 90.0,
                })
        df_sp, df_temp = calcular_temporada(pd.DataFrame(filas))
        self.assertEqual(len(df_sp), 48)
        self.assertEqual(len(df_temp), 8)
        for col in ['score_general', 'score_ofensivo', 'score_defensivo', 'score_comportamiento', 'score_abp']:
            self.assertTrue(df_temp[col].between(0, 10).all())
        self.assertTrue(df_temp['nota_global'].between(0, 100).all())
        self.assertAlmostEqual(df_temp.iloc[0]['score_general'], df_temp.iloc[0]['nota_global'] / 10, places=1)
        self.assertTrue(df_temp['percentile_general'].between(0, 99).all())
        met = df_temp.iloc[0]['radar_data']['metricas']
        self.assertIn('_cat_ataque', met)
        self.assertIn('_sub_finalizacion', met)
        # Sin métricas de construcción en los datos: categoría sin datos, no 0
        self.assertNotIn('_cat_construccion', met)

    def test_juega_mas_puntua_mas(self):
        """Mejor p90 en pocos minutos no supera a una jugadora buena con muchos minutos."""
        filas = []
        def partido(m, p, mins, recup):
            filas.append({'match_id': f'm{m}', 'player_id': p, 'team_id': 't', 'player_name': p,
                          'match_date': f'2026-10-{m + 10:02d}T16:00:00Z', 'demarcacion': 'Central Derecho',
                          'grupo_demarcacion': 'Centrales', 'minutes_played': mins, 'is_starter': mins > 45,
                          **{c: 0 for c in ['goals', 'assists', 'xg', 'xa', 'xca', 'passes_completed', 'passes_total',
                                            'progressive_passes', 'takeons_successful', 'takeons_total', 'tackles_won',
                                            'tackles_total', 'interceptions', 'recoveries', 'aerials_won',
                                            'aerials_total']},
                          'def_recuperaciones_p90': recup, 'comp_minutos': float(mins)})
        for m in range(20):
            partido(m, 'titular', 90, 4.0)              # 1800 min a 4 recuperaciones/90
            for k in range(4):
                partido(m, f'resto{k}', 90, 2.0)        # media del grupo
        for m in range(2):
            partido(m, 'suplente', 90, 6.0)             # 180 min a 6 recuperaciones/90
        _, t = calcular_temporada(pd.DataFrame(filas))
        t = t.set_index('player_id')
        self.assertGreater(t.at['titular', 'nota_defensa'], t.at['suplente', 'nota_defensa'])
        self.assertGreater(t.at['titular', 'nota_global'], t.at['suplente', 'nota_global'])

    def test_goalkeeper_matchstats_metrics(self):
        from pipeline.metrics_engine import metricas_matchstats
        gk_stats = {
            'minsPlayed': '90', 'saves': 4, 'goalsConceded': 1, 'savedIbox': 3,
            'cleanSheet': 1, 'punches': 2, 'accurateKeeperSweeper': 1
        }
        res_gk = metricas_matchstats(gk_stats, 90.0, 100.0, 0, 1, 1, dem='Portero')
        self.assertEqual(res_gk['def_paradas_p90'], 4.0)
        self.assertEqual(res_gk['def_goles_encajados_p90'], 1.0)
        self.assertEqual(res_gk['def_paradas_pct'], 80.0)
        self.assertEqual(res_gk['def_paradas_area_p90'], 3.0)
        self.assertEqual(res_gk['def_despejes_punos_p90'], 2.0)
        self.assertEqual(res_gk['def_salidas_libero_p90'], 1.0)
        self.assertEqual(res_gk['def_porteria_cero_pct'], 100.0)

        # Jugadora de campo sin stats de portera no tiene def_paradas_p90
        field_stats = {'minsPlayed': '90', 'totalPass': 30, 'accuratePass': 25}
        res_field = metricas_matchstats(field_stats, 90.0, 100.0, 0, 1, 1, dem='Delantero Centro')
        self.assertNotIn('def_paradas_p90', res_field)


class TestFotMobMatching(unittest.TestCase):
    def test_normalizar(self):
        self.assertEqual(normalizar('Đ. Gordić'), 'd gordic')
        self.assertEqual(normalizar('Ádám'), 'adam')

    def test_jugador_por_fecha_y_apodo(self):
        squad = [{'id': 1, 'name': 'Cadu', 'dateOfBirth': '1997-08-08', 'shirtNumber': 20},
                 {'id': 2, 'name': 'Boldizsar Rab', 'dateOfBirth': '2005-09-24', 'shirtNumber': 16}]
        cadu = {'name': 'Carlos Eduardo Lopes Cruz', 'birth_date': '1997-08-08', 'shirt_number': 20}
        self.assertEqual(emparejar_jugador(cadu, squad)['id'], 1)
        # Mismo apellido pero otra persona (hermano, otra fecha y sin dorsal) → no se empareja
        bence = {'name': 'Bence Rab', 'birth_date': '2008-01-04', 'shirt_number': None}
        self.assertIsNone(emparejar_jugador(bence, squad))

    def test_equipos(self):
        opta = [{'id': 'a', 'name': 'Debreceni VSC', 'short_name': 'Debrecen'},
                {'id': 'b', 'name': 'Puskás Akadémia FC', 'short_name': 'Puskás AFC'}]
        fm = [{'id': 1, 'name': 'Puskás FC Academy', 'shortName': 'Puskás'},
              {'id': 2, 'name': 'Debrecen', 'shortName': 'Debrecen'}]
        mapa = emparejar_equipos(opta, fm)
        self.assertEqual(mapa['a']['id'], 2)
        self.assertEqual(mapa['b']['id'], 1)


if __name__ == '__main__':
    unittest.main()


class TestFMFisico(unittest.TestCase):
    """Lectura de exportaciones de Football Manager (atributos físicos)."""

    def _fichero(self, nombre, contenido):
        import tempfile
        from pathlib import Path
        d = Path(tempfile.mkdtemp())
        p = d / nombre
        p.write_text(contenido, encoding='utf-8')
        return p

    def test_html_ingles_con_nat_ambiguo(self):
        from pipeline.fm_fisico import leer_exportacion
        html = """<html><body><table>
        <tr><th>Inf</th><th>Name</th><th>Nat</th><th>Club</th><th>DoB</th>
            <th>Acc</th><th>Agi</th><th>Bal</th><th>Jum</th><th>Nat</th><th>Pac</th><th>Sta</th><th>Str</th></tr>
        <tr><td></td><td>Aitana Bonmatí</td><td>ESP</td><td>Barcelona</td><td>18/1/1998 (28 years old)</td>
            <td>16</td><td>17</td><td>15</td><td>5</td><td>14</td><td>16</td><td>16</td><td>12-14</td></tr>
        <tr><td></td><td>Sin Datos</td><td>ESP</td><td>X</td><td></td>
            <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
        </table></body></html>"""
        filas = leer_exportacion(self._fichero('fm.html', html))
        self.assertEqual(len(filas), 1)
        f = filas[0]
        self.assertEqual(f['fm_name'], 'Aitana Bonmatí')
        self.assertEqual(f['fm_birth_date'], '1998-01-18')
        self.assertEqual(f['natural_fitness'], 14.0)
        self.assertEqual(f['jumping_reach'], 5.0)
        self.assertEqual(f['strength'], 13.0)

    def test_texto_espanol(self):
        from pipeline.fm_fisico import leer_exportacion
        txt = ("| Nombre        | Club     | Edad | Ace | Agi | Equ | Alc | For | Vel | Res | Fue |\n"
               "| ------------- | -------- | ---- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
               "| Salma Paralluelo | Barcelona | 22 | 19 | 15 | 14 | 12 | 15 | 19 | 15 | 13 |\n")
        filas = leer_exportacion(self._fichero('fm.txt', txt))
        self.assertEqual(len(filas), 1)
        self.assertEqual(filas[0]['fm_age'], 22)
        self.assertEqual(filas[0]['pace'], 19.0)
        self.assertEqual(filas[0]['natural_fitness'], 15.0)

    def test_emparejar_por_fecha(self):
        from pipeline.fm_fisico import emparejar
        j = {'id': 'p1', 'name': 'Aitana Bonmatí Conca', 'first_name': 'Aitana', 'last_name': 'Bonmatí Conca',
             'birth_date': '1998-01-18', 'fm_team_name': 'FC Barcelona'}
        otra = {'id': 'p2', 'name': 'Alexia Putellas', 'first_name': 'Alexia', 'last_name': 'Putellas',
                'birth_date': '1994-02-04', 'fm_team_name': 'FC Barcelona'}
        fila = {'fm_name': 'Aitana Bonmatí', 'fm_club': 'Barcelona', 'fm_birth_date': '1998-01-18', 'fm_age': None}
        jug, score, metodo = emparejar(fila, [j, otra], {'1998-01-18': [j], '1994-02-04': [otra]})
        self.assertEqual(jug['id'], 'p1')
        self.assertEqual(metodo, 'fecha+nombre')
        fila2 = {'fm_name': 'Laia Desconocida', 'fm_club': 'Barcelona', 'fm_birth_date': '2001-01-01', 'fm_age': None}
        self.assertIsNone(emparejar(fila2, [j, otra], {})[0])
