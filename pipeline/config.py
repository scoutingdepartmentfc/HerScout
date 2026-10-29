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
# Grupos de demarcación con menos jugadoras que esto se comparan con toda la liga
MIN_JUGADORAS_GRUPO = 5

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
