"""
pipeline/config.py
Configuración de las competiciones con Opta/Performfeeds SDAPI.
`fotmob_id` es el ID de la liga en FotMob (fuente de fotos de jugadores y escudos).
"""

import os

SDAPI_BASE_URL = "https://api.performfeeds.com/soccerdata"
DEFAULT_OUTLET_KEY = "ft1tiv1inq7v1sk3y9tv12yh5"

FOTMOB_BASE_URL = "https://www.fotmob.com/api/data"
FOTMOB_PLAYER_IMG = "https://images.fotmob.com/image_resources/playerimages/{id}.png"
FOTMOB_TEAM_IMG = "https://images.fotmob.com/image_resources/logo/teamlogo/{id}.png"
FOTMOB_LEAGUE_IMG = "https://images.fotmob.com/image_resources/logo/leaguelogo/{id}.png"
# Foto oficial Opta: `description` es el ID Opta del equipo; si no hay foto redirige (302) a un placeholder
# Escudo oficial Opta por ID de equipo; si no hay escudo redirige (302) a un placeholder
OPTA_TEAM_IMG = ("https://omo.akamai.opta.net/image.php?secure=true&h=omo.akamai.opta.net&sport=football"
                 "&entity=team&description=badges&dimensions=300&id={team_id}")
OPTA_PLAYER_IMG = ("https://omo.akamai.opta.net/image.php?secure=true&h=omo.akamai.opta.net&sport=football"
                   "&entity=player&description={team_id}&dimensions=103x155&id={player_id}")

# Supabase Storage
BUCKET_PLAYER_PHOTOS = "player-photos"   # público
BUCKET_TEAM_BADGES = "team-badges"       # público
BUCKET_PIPELINE_CACHE = "pipeline-cache"  # privado: métricas brutas partido a partido (parquet)

# Caché local (dry-run o sin Supabase)
LOCAL_CACHE_DIR = os.environ.get("SCOUTING_CACHE_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache"))

# Mínimo de minutos por (jugador, demarcación) para entrar en la tabla de temporada
MIN_MINUTOS_TEMPORADA = 90

# Notas 0-100 de temporada: solo rendimiento p90, sin premiar ni castigar los minutos.
# Cada métrica se compara (desviaciones típicas) con la media de su grupo de demarcación en la liga, calculada
# con las jugadoras de >= MIN_MINUTOS_REFERENCIA (si hay al menos MIN_REFERENCIA_GRUPO; si no, con todas).
MIN_MINUTOS_REFERENCIA = 450
MIN_REFERENCIA_GRUPO = 8
# Recorte de cada métrica a ±Z_RECORTE desviaciones: un gol en 30' no dispara la nota.
Z_RECORTE = 3.0
# Nota global = PESO_CLAVE * métricas clave de su posición (categorias.PLANTILLAS_POSICION) + resto categorías.
PESO_CLAVE = 0.80
# Cada métrica se compara con dos medias de su demarcación (scoring._z_combinada): la de su liga-temporada
# y la general de todas las ligas descargadas (pipeline-cache referencias/global.json). Sin comparación
# intra-equipo ('equipo': 0.0) para no penalizar a jugadoras top que comparten plantilla con otras estrellas.
PESOS_REFERENCIA = {'liga': 0.70, 'equipo': 0.0, 'general': 0.30}
MIN_REFERENCIA_GLOBAL = 20  # filas mínimas de una demarcación entre todas las ligas para usar la media general
# Suavizado bayesiano de la nota global cuando una jugadora lleva menos de 600':
# evita que cameos de 90'-200' lideren la liga; a partir de 600' el factor es 1.0 (sin castigo).
K_MINUTOS_TEMPORADA_SHRINK = 480.0
MIN_MINUTOS_SHRINK_FULL = 600.0
# Nota por partido: mezcla del modelo calibrado con FotMob y la escala propia (métricas clave de la posición +
# categorías). 1.0 = solo el modelo; 0.0 = solo la escala propia.
PESO_MODELO_PARTIDO = 0.5
# Muestra baja: con menos minutos o partidos la nota se muestra con aviso y no entra en rankings ni top 10.
MIN_MINUTOS_NOTA = 270
MIN_PARTIDOS_NOTA = 3
# Escala de las notas 0-100 (métrica, subcategoría, categoría y global), puramente intra-liga (Opción 1):
# todas las competiciones usan NOTA_MEDIA_LIGA como media para que la nota cuadre con el radar y no dependa
# de desplazamientos manuales por liga. Por encima de NOTA_TECHO_INICIO se comprime suavemente hacia NOTA_TECHO.
NOTA_MEDIA_LIGA = 64.0
NOTA_DESVIACION = 13.0
NOTA_TECHO_INICIO = 84.0
NOTA_TECHO = 99.0
# Opción 1: sin desplazamiento manual por liga (todas las competiciones se puntúan respecto a su propio grupo
# con base NOTA_MEDIA_LIGA). Se mantiene el símbolo vacío por compatibilidad de importación.
NIVEL_LIGA = {}
# Competiciones internacionales de CLUBES (Opta): se descargan desde /admin → "Competiciones internacionales".
# Sus partidos suman a la jugadora, pero NO cambian la liga del club ni el equipo actual de la jugadora.
COMPETICIONES_INTERNACIONALES = {
    '55hcphd1ccc6eai1ms77460on': "UEFA Women's Champions League",
    '1nwgd1b2d903fvnwgnsdadkb8': "UEFA Women's Europa Cup",
    '65oi3upjiu4lcukayuq66fhuc': "FIFA Women's Champions Cup",
    '3tybapqetnmdiam9exg1q4yl0': "Concacaf W Champions Cup",
    '135j6qi3ap8i3vc9hwdo4fjtg': "NWSL x Liga MX Femenil Summer Cup",
    'avrpx5lanaaxagr4h4duxj3vc': "CONMEBOL Libertadores Femenina",
    'ep4po13e04rjg268pgete0fvu': "AFC Women's Champions League",
    'xu2nd3dkwdun0j71tnqabfo4': "CAF Women's Champions League",
    '8dxigebf8ankjp0ncupwte0b8': "OFC Women's Champions League",
    '1tn3f9q6oy40vivvsq3ik5awa': "Baltic Women's League",
    '2irmeeywhndovbhbgkz37v9qs': "All-Island Cup",
}
# Competiciones de SELECCIONES (Opta): también internacionales, pero el equipo del partido es la selección, así
# que nunca pasa a ser el equipo actual y el nivel de la nota sale de la liga del club actual de la jugadora.
COMPETICIONES_SELECCIONES = {
    '43029a6fvhou87zehkd5u8fyt': "UEFA Women's Championship",
    '9mr92dlx7ryaxhi07sgt90ish': "UEFA U19 Championship Women",
    '4x9xyyv419q82evpbl37j77gt': "FIFA U17 Women's World Cup",
    'dcgbs1vkp9y3y31li7s95i51f': "FIFA U20 Women's World Cup",
    '14bdhdgyjd4pqapxjhfq267ge': "CAF Women's Africa Cup of Nations",
}
COMPETICIONES_INTERNACIONALES.update(COMPETICIONES_SELECCIONES)
# Regiones de opta_catalog.country que no son un país (competición internacional)
REGIONES_INTERNACIONALES = {'Europe', 'World', 'Asia', 'Africa', 'N/C America', 'South America', 'Oceania'}


def es_selecciones(comp) -> bool:
    return comp.get('id') in COMPETICIONES_SELECCIONES


def es_internacional(comp) -> bool:
    """Competición entre clubes/selecciones de varios países (por ID conocido o por región del catálogo Opta)."""
    return comp.get('id') in COMPETICIONES_INTERNACIONALES or comp.get('country') in REGIONES_INTERNACIONALES


NIVEL_LIGA_DEFECTO = NOTA_MEDIA_LIGA  # Opción 1: todas las ligas comparten NOTA_MEDIA_LIGA
# Grupos de demarcación con menos jugadoras que esto se comparan con toda la liga
MIN_JUGADORAS_GRUPO = 5

# Rating por partido (0-10, estilo FotMob): cada actuación frente a las de su grupo de demarcación en la liga.
# La actuación media saca NOTA_PARTIDO_MEDIA y cada desviación típica suma/resta NOTA_PARTIDO_DESVIACION.
# Con 6.5/0.85: ~16% >= 7.4, ~2.5% >= 8.2. Recorte a [NOTA_PARTIDO_MIN, 10].
NOTA_PARTIDO_MEDIA = 6.5
NOTA_PARTIDO_DESVIACION = 0.85
NOTA_PARTIDO_MIN = 3.0
# Corrección por minutos del partido: la distancia a la media se multiplica por (min/(min+K)) / (90/(90+K)).
# Con K=20: 90' → 1, 60' → 0.92, 30' → 0.73, 12' → 0.46, 2' → 0.12 (casi la media: no hubo tiempo de juzgar)
K_MINUTOS_PARTIDO = 20
# Grupos con menos actuaciones que esto en la temporada se comparan con toda la liga
MIN_ACTUACIONES_GRUPO = 20

# Descargas concurrentes a la API (por partido se piden 2 feeds)
MAX_WORKERS_DESCARGA = int(os.environ.get("SCOUTING_MAX_WORKERS", "4"))

# Una entrada por (competición, temporada). La activa se procesa la última y queda como active_season_id.
COMPETITIONS_CONFIG = [
    {
        "id": "5k620c7y6dlbmcm88dt3eb7t",
        "name": "Liga F (Primera División Femenina)",
        "country": "Spain",
        "season_id": "djelzk9437o7odzfkuo137das",  # 2025/2026
        "fotmob_id": 9907,
        "active": False
    },
    {
        "id": "5k620c7y6dlbmcm88dt3eb7t",
        "name": "Liga F (Primera División Femenina)",
        "country": "Spain",
        "season_id": "c2wqs5xvkpwffbp3gynepo2z8",  # 2026/2027
        "fotmob_id": 9907,
        "active": True
    }
]
