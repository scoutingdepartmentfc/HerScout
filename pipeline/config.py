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

# Corrección por minutos de las notas 0-100: cada métrica p90 se acerca a la media de su grupo de demarcación
# como si la jugadora tuviera K minutos más jugados a ritmo medio. Más K = más castigo a quien juega poco.
K_MINUTOS_CONFIANZA = int(os.environ.get("SCOUTING_K_MINUTOS", "900"))
# Escala de las notas 0-100 (métrica, subcategoría, categoría y global), comparable entre ligas:
# nota = nivel de la liga + NOTA_DESVIACION * desviaciones típicas frente a su grupo de demarcación en la liga.
# Por encima de NOTA_TECHO_INICIO la escala se comprime hacia NOTA_TECHO: un 90+ es excepcional.
NOTA_MEDIA_LIGA = 62.0
NOTA_DESVIACION = 11.0
NOTA_TECHO_INICIO = 80.0
NOTA_TECHO = 99.0
# Nivel de cada liga = nota de su jugadora media. La fuerza no sale de las métricas brutas (en ligas flojas
# también son más altas): se calibra con la nota de las mismas jugadoras al cambiar de liga y el valor de mercado.
NIVEL_LIGA = {
    '6vq8j5p3av14nr3iuyi4okhjt': 66.0,  # Women's Super League
    '5k620c7y6dlbmcm88dt3eb7t': 62.0,   # Liga F
    '2z7257m7hj58zuxcjrsg4erzc': 61.0,  # Frauen Bundesliga
    '2aso72utuctat2ecs6nahjss6': 60.0,  # Première Ligue
    '81txfenlgw75nq3u2nfdkj92o': 57.0,  # Serie A Women
    '1dvti26ywxhu6eafhupc3f2pe': 57.0,  # Coppa Italia Women
    '7ut48s80k421xixh6ev5i6h62': 54.0,  # Liga MX Femenil
    '9q5tcfz0w9ku2xq49c0df48b8': 52.0,  # Northern Super League
    '9p3nnxhdjahfn8qswpzy8oyc3': 52.0,  # A-League Women
    'cydr5rltozch9qnzjurt1r7d9': 52.0,  # SWPL 1
    '2fhhxvyhwkxd6gpgg9nbb2p2i': 42.0,  # Segunda Federación Femenina
}
NIVEL_LIGA_DEFECTO = 52.0  # Ligas nuevas de /admin hasta darles nivel aquí
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
