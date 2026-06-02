# Bierpongtoernooi

Een webapplicatie om een bierpongtoernooi te organiseren en live te volgen — van ploegenbeheer en schema-generatie tot een publiek scorebord met realtime updates.

> **Gemaakt met [Claude](https://claude.ai) (Anthropic AI)**

---

## Functies

**Organizer (login vereist)**
- Toernooi aanmaken met eigen naam, logo en thema (primaire kleur)
- Ploegen en spelers beheren + dranksoort per ploeg instellen
- Tafels configureren (naam, oriëntatie, aantal kolommen)
- Schema automatisch genereren in drie formaten:
  - **Knock-out** — kwartfinale → halve finale → finale + kleine finale (kan uitgebreid of ingekort worden)
  - **Competitie** — één grote competitie tussen alle ploegen, iedereen speelt X wedstrijden
  - **Poule** — rondes in poules, iedereen speelt X wedstrijden, daarna knockouts
  - **Combinatie** — eerst competitie, dan knock-out (top-N gaat door)

- Live scores invoeren tijdens het toernooi
- Ronde-timer starten, pauzeren en resetten
- Volledige flexibiliteit:
  - verschuif tafels, rondes, wedstrijden naar eigen wensen
  - pas de ranking handmatig aan
  - speel met combinaties van de formaten en verschillende opties

***Extra opties***
- Voeg play-offs of finale ranking toe aan één van de formaten
- Speel geluiden af met gebruik van de timer
- Stel het aantal bekers in
- Genereer automatish toernooiregels of pas deze aan
- Pas de punten voor de competities aan en/of voeg bonuspunten toe
- ...


**Publiek (geen login)**
- Live scorebord met automatische verversing
- Tussenstand / rangschikking
- Tafelsoverzicht: wie speelt waar
- Ronde-timer (serverdata + client-side tick)
- Kan beveiligd worden met eventueel wachtwoord

---

## Tech stack

| Onderdeel | Technologie |
|-----------|-------------|
| Backend | Python 3.11 · Django 4.2 |
| Database | SQLite (standaard) of PostgreSQL |
| Frontend | [Tabler](https://tabler.io/) (Bootstrap 5) · Vanilla JS |
| Realtime | Polling (5–10 s) via JSON API |
| Deploy | Docker · Gunicorn · WhiteNoise |

---

## Installatie

### Lokaal (Conda / pip)

```bash
git clone https://github.com/jouw-gebruikersnaam/bierpongtoernooi.git
cd bierpongtoernooi

# omgeving
conda create -n django-env python=3.11
conda activate django-env
pip install -r requirements.txt

# configuratie
cp .env.example .env        # pas aan indien nodig

# database + superuser
python manage.py migrate
python manage.py runserver
```

Ga naar [http://127.0.0.1:8000](http://127.0.0.1:8000). Standaard inloggen met **admin / admin123**.

### Docker

```bash
cp .env.example .env        # pas SECRET_KEY_DJANGO aan
docker compose up --build
```

App bereikbaar op [http://localhost:8000](http://localhost:8000).

---

## Configuratie (.env)

| Variable | Omschrijving | Standaard |
|----------|-------------|-----------|
| `SECRET_KEY_DJANGO` | Django secret key | insecure dev key |
| `DEBUG` | Debug-modus | `True` |
| `ALLOWED_HOSTS` | Kommagescheiden hosts | `127.0.0.1,localhost` |
| `DB_ENGINE` | `sqlite` of `postgresql` | `sqlite` |
| `TIME_ZONE` | Tijdzone | `Europe/Brussels` |
| `DJANGO_SUPERUSER_USERNAME` | Admin gebruikersnaam | `admin` |
| `DJANGO_SUPERUSER_PASSWORD` | Admin wachtwoord | `admin123` |

Zie [`.env.example`](.env.example) voor alle opties.

---

## URL-overzicht

| URL | Beschrijving |
|-----|-------------|
| `/` | Dashboard (toernooilijst) |
| `/nieuw/` | Toernooi aanmaken |
| `/t/<slug>/` | Organizer dashboard |
| `/t/<slug>/ploegen/` | Ploegen beheren |
| `/t/<slug>/tafels/` | Tafels beheren |
| `/t/<slug>/schema/` | Schema aanmaken / bekijken |
| `/t/<slug>/live/` | Live scores invoeren |
| `/t/<slug>/instellingen/` | Thema en instellingen |
| `/p/<slug>/` | Publieke startpagina |
| `/p/<slug>/scorebord/` | Live scorebord |
| `/p/<slug>/stand/` | Tussenstand |
| `/p/<slug>/tafels/` | Tafelsoverzicht |
| `/p/<slug>/timer/` | Ronde-timer |
| `/api/<slug>/scores/` | JSON scores |
| `/api/<slug>/standings/` | JSON stand |
| `/api/<slug>/timer/` | JSON timer |
| `/api/<slug>/tables/` | JSON tafels |

---

## Datamodel

```
Tournament  ──< Team ──< Player
     │
     └──< Table
     └──< Match (Team A vs B, tafel, score, status, fase)
     └──< Standing (herberekend na elke match)
```

---

## Live demo

under construction

---

## Licentie

MIT — vrij te gebruiken, aanpassen en verspreiden.

---

## Credits

- Gebouwd met **[Claude](https://claude.ai)** van [Anthropic](https://www.anthropic.com) — de volledige code is gegenereerd in samenwerking met Claude Code (claude-sonnet-4-6).
- UI gebaseerd op [Tabler](https://tabler.io/) (MIT-licentie).
- [SortebleJS](https://sortablejs.github.io/Sortable/) (MIT-licentie).
- [QuillJS](https://quilljs.com/) (BSD-3-Clause license ).
