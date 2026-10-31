"""
pipeline/traducciones.py
Soccerdonna en /en/ deja algunos textos en alemán (selecciones inferiores, lesiones, traspasos):
todo lo que se guarda se pasa a inglés.
"""

import re
from typing import Optional

PAISES = {
    "Deutschland": "Germany", "Spanien": "Spain", "Schweiz": "Switzerland", "Österreich": "Austria",
    "Frankreich": "France", "Italien": "Italy", "Niederlande": "Netherlands", "Belgien": "Belgium",
    "Schottland": "Scotland", "Nordirland": "Northern Ireland", "Irland": "Republic of Ireland",
    "Norwegen": "Norway", "Schweden": "Sweden", "Dänemark": "Denmark", "Finnland": "Finland", "Island": "Iceland",
    "Polen": "Poland", "Tschechien": "Czech Republic", "Slowakei": "Slovakia", "Slowenien": "Slovenia",
    "Ungarn": "Hungary", "Kroatien": "Croatia", "Serbien": "Serbia", "Bosnien-Herzegowina": "Bosnia-Herzegovina",
    "Montenegro": "Montenegro", "Albanien": "Albania", "Nordmazedonien": "North Macedonia", "Kosovo": "Kosovo",
    "Rumänien": "Romania", "Bulgarien": "Bulgaria", "Griechenland": "Greece", "Türkei": "Turkey",
    "Zypern": "Cyprus", "Russland": "Russia", "Ukraine": "Ukraine", "Weißrussland": "Belarus", "Litauen": "Lithuania",
    "Lettland": "Latvia", "Estland": "Estonia", "Luxemburg": "Luxembourg", "Israel": "Israel",
    "Brasilien": "Brazil", "Argentinien": "Argentina", "Kolumbien": "Colombia", "Mexiko": "Mexico",
    "Kanada": "Canada", "Vereinigte Staaten": "United States", "Jamaika": "Jamaica", "Trinidad und Tobago": "Trinidad and Tobago",
    "Peru": "Peru", "Chile": "Chile", "Uruguay": "Uruguay", "Paraguay": "Paraguay", "Venezuela": "Venezuela",
    "Ecuador": "Ecuador", "Bolivien": "Bolivia", "Costa Rica": "Costa Rica", "Panama": "Panama",
    "Dominikanische Republik": "Dominican Republic", "Puerto Rico": "Puerto Rico", "Haiti": "Haiti",
    "Japan": "Japan", "Südkorea": "South Korea", "Nordkorea": "North Korea", "Australien": "Australia",
    "Neuseeland": "New Zealand", "Philippinen": "Philippines", "Vietnam": "Vietnam", "Thailand": "Thailand",
    "Indien": "India", "Iran": "Iran", "Usbekistan": "Uzbekistan", "Kasachstan": "Kazakhstan",
    "Nigeria": "Nigeria", "Südafrika": "South Africa", "Marokko": "Morocco", "Kamerun": "Cameroon",
    "Ghana": "Ghana", "Elfenbeinküste": "Ivory Coast", "Sambia": "Zambia", "Senegal": "Senegal",
    "Tunesien": "Tunisia", "Algerien": "Algeria", "Ägypten": "Egypt", "Äquatorialguinea": "Equatorial Guinea",
    "Malawi": "Malawi", "Kenia": "Kenya", "Tansania": "Tanzania", "Mali": "Mali",
}

LESIONES = {
    "kreuzbandriss": "Cruciate ligament rupture", "teilriss des kreuzbandes": "Partial cruciate ligament tear",
    "innenbandriss": "Medial collateral ligament tear", "außenbandriss": "Lateral ligament tear",
    "bänderriss": "Torn ligament", "meniskusschaden": "Meniscus damage", "meniskusriss": "Meniscus tear",
    "mensical damage": "Meniscus damage", "muskelfaserriss": "Torn muscle fibre", "muskelverletzung": "Muscle injury",
    "muskuläre probleme": "Muscular problems", "zerrung": "Strain", "oberschenkelverletzung": "Thigh injury",
    "oberschenkelzerrung": "Thigh strain", "wadenverletzung": "Calf injury", "knieverletzung": "Knee injury",
    "knieprobleme": "Knee problems", "sprunggelenksverletzung": "Ankle injury", "knöchelverletzung": "Ankle injury",
    "fußverletzung": "Foot injury", "hüftprobleme": "Hip problems", "rückenprobleme": "Back problems",
    "leistenprobleme": "Groin problems", "adduktorenprobleme": "Adductor problems",
    "schambeinentzündung": "Pubalgia", "schulterverletzung": "Shoulder injury", "handbruch": "Broken hand",
    "mittelfußbruch": "Metatarsal fracture", "wadenbeinbruch": "Fibula fracture", "schienbeinbruch": "Tibia fracture",
    "nasenbeinbruch": "Broken nose", "achillessehnenriss": "Achilles tendon rupture",
    "achillessehnenprobleme": "Achilles tendon problems", "gehirnerschütterung": "Concussion",
    "krankheit": "Illness", "grippe": "Flu", "corona-virus": "Coronavirus", "operation": "Surgery",
    "arthroskopie": "Arthroscopy", "arthroscopie": "Arthroscopy", "schwangerschaft": "Pregnancy",
    "babypause": "Maternity leave", "unbekannte verletzung": "Unknown injury", "unknown injury": "Unknown injury",
}

TRASPASOS = {
    "ablösefrei": "Free transfer", "free transfer": "Free transfer", "leihe": "Loan", "loan": "Loan",
    "leih-ende": "End of loan", "end of loan": "End of loan", "?": "Unknown", "unbekannt": "Unknown",
    "-": None, "": None,
}

CLUBES = {"vereinslos": "Without club", "karriereende": "Retired", "unbekannt": "Unknown",
          "karrierepause": "Career break"}

_EDAD = re.compile(r"\s*U-?\s?(\d{2})$")


def seleccion(nombre: Optional[str]) -> Optional[str]:
    """'Spanien U23' → 'Spain U-23', 'Österreich' → 'Austria'."""
    if not nombre:
        return nombre
    nombre = nombre.strip()
    edad = _EDAD.search(nombre)
    pais = nombre[:edad.start()] if edad else nombre
    pais = PAISES.get(pais.strip(), pais.strip())
    return f"{pais} U-{edad.group(1)}" if edad else pais


def lesion(texto: Optional[str]) -> Optional[str]:
    if not texto:
        return texto
    t = texto.strip()
    traducido = LESIONES.get(t.lower(), t)
    return traducido[:1].upper() + traducido[1:]


def traspaso(texto: Optional[str]) -> Optional[str]:
    """Importe o tipo de traspaso: los importes ('150.000 €') se dejan tal cual."""
    if texto is None:
        return None
    t = texto.strip()
    return TRASPASOS.get(t.lower(), t)


def club(nombre: Optional[str]) -> Optional[str]:
    if not nombre:
        return nombre
    return CLUBES.get(nombre.strip().lower(), nombre.strip())
