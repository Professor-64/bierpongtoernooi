import random
from .models import Standing, Match, Group


def generate_round_robin_schedule(teams, games_per_team):
    """
    Generate a round-robin schedule using the polygon/rotation method.

    Each round is a time slot in which every team plays exactly once.
    If games_per_team > (n-1), additional cycles are generated with a
    reshuffled team order so teams do not always repeat the same opponents.
    """
    teams = list(teams)
    n_real = len(teams)
    if n_real < 2:
        return []

    real_teams = [t for t in teams if t is not None]

    def _one_rr(team_order):
        """Return all rounds of one complete round-robin for team_order."""
        t = list(team_order)
        if len(t) % 2 == 1:
            t.append(None)
        m = len(t)
        rotation = t[1:]
        rounds = []
        for _ in range(m - 1):
            pairs = [(t[0], rotation[0])]
            for i in range(1, m // 2):
                pairs.append((rotation[i], rotation[m - 1 - i]))
            real = [(a, b) for a, b in pairs if a is not None and b is not None]
            if real:
                rounds.append(real)
            rotation = [rotation[-1]] + rotation[:-1]
        return rounds

    rounds_needed = max(1, games_per_team)
    result = []
    cycle = 0

    while len(result) < rounds_needed:
        if cycle == 0:
            order = teams[:]
        else:
            # Shuffle real teams for variety; rebuild with None if needed
            shuffled = real_teams[:]
            random.shuffle(shuffled)
            if n_real % 2 == 1:
                shuffled.append(None)
            order = shuffled

        rr = _one_rr(order)
        if not rr:
            break
        result.extend(rr[:rounds_needed - len(result)])
        cycle += 1

    return result


def generate_knockout_bracket(teams):
    """
    Generate a knockout bracket seeded by ranking.
    Returns list of (team1, team2, phase, bracket_slot) tuples.
    Includes TBD slots (None) for later rounds.
    """
    teams = list(teams)
    n = len(teams)
    matches = []

    if n <= 2:
        t1 = teams[0] if len(teams) > 0 else None
        t2 = teams[1] if len(teams) > 1 else None
        matches.append((t1, t2, Match.PHASE_FINAL, 1))
        return matches

    if n <= 4:
        t1 = teams[0] if len(teams) > 0 else None
        t4 = teams[3] if len(teams) > 3 else None
        t2 = teams[1] if len(teams) > 1 else None
        t3 = teams[2] if len(teams) > 2 else None
        matches.append((t1, t4, Match.PHASE_SEMIFINAL, 1))
        matches.append((t2, t3, Match.PHASE_SEMIFINAL, 2))
        matches.append((None, None, Match.PHASE_FINAL, 1))
        matches.append((None, None, Match.PHASE_THIRD_PLACE, 1))
        return matches

    # Quarter-finals: seeding 1v8, 4v5, 2v7, 3v6
    seed_pairs = [(0, 7), (3, 4), (1, 6), (2, 5)]
    for slot, (a, b) in enumerate(seed_pairs, 1):
        t1 = teams[a] if a < len(teams) else None
        t2 = teams[b] if b < len(teams) else None
        matches.append((t1, t2, Match.PHASE_QUARTERFINAL, slot))

    matches.append((None, None, Match.PHASE_SEMIFINAL, 1))
    matches.append((None, None, Match.PHASE_SEMIFINAL, 2))
    matches.append((None, None, Match.PHASE_FINAL, 1))
    matches.append((None, None, Match.PHASE_THIRD_PLACE, 1))

    return matches


def pack_into_slots(matches, tables_count):
    """
    Greedy: pack (team1, team2) tuples into slots of at most tables_count,
    ensuring no team plays twice in the same slot.
    Returns list of slots, each a list of (team1, team2).
    """
    if not tables_count:
        return [matches]
    remaining = list(matches)
    slots = []
    while remaining:
        slot, used, leftover = [], set(), []
        for t1, t2 in remaining:
            if len(slot) < tables_count and t1 not in used and t2 not in used:
                slot.append((t1, t2))
                used.add(t1)
                used.add(t2)
            else:
                leftover.append((t1, t2))
        slots.append(slot)
        remaining = leftover
    return slots


def generate_playoff_schedule(playoff_teams):
    """
    Generates playoff matches. playoff_teams is a ranked list, e.g. [rank9, rank10, rank11, rank12].
    Seeding: best vs worst: [0] vs [-1], [1] vs [-2], etc.
    Returns list of (team1, team2) tuples.
    """
    teams = list(playoff_teams)
    n = len(teams)
    pairs = []
    for i in range(n // 2):
        pairs.append((teams[i], teams[n - 1 - i]))
    return pairs


def generate_final_ranking_schedule(remaining_teams, tables_count):
    """
    Generates final ranking matches for teams not in playoff/knockout.
    Pairs adjacent teams: (0,1), (2,3), etc.
    Returns list of (team1, team2) tuples.
    """
    teams = list(remaining_teams)
    pairs = []
    for i in range(0, len(teams) - 1, 2):
        pairs.append((teams[i], teams[i + 1]))
    return pairs


def recalculate_group_standings(tournament):
    """Recalculate standings per group for the groups format."""
    Standing.objects.filter(tournament=tournament, phase='group').delete()

    standings = {}
    for team in tournament.teams.select_related('group').all():
        standings[team.id] = Standing(
            tournament=tournament,
            team=team,
            phase='group',
            group=team.group,
        )

    matches = Match.objects.filter(
        tournament=tournament,
        phase=Match.PHASE_GROUP,
        status=Match.STATUS_FINISHED,
    ).select_related('team1', 'team2')

    for match in matches:
        if not match.team1 or not match.team2:
            continue
        s1 = standings.get(match.team1.id)
        s2 = standings.get(match.team2.id)
        if not s1 or not s2:
            continue

        s1.played += 1
        s2.played += 1
        s1.cups_scored += match.score1
        s1.cups_conceded += match.score2
        s2.cups_scored += match.score2
        s2.cups_conceded += match.score1

        if match.bonus_team1:
            s1.bonus_points += tournament.points_bonus_all_cups
            s1.points += tournament.points_bonus_all_cups
        if match.bonus_team2:
            s2.bonus_points += tournament.points_bonus_all_cups
            s2.points += tournament.points_bonus_all_cups

        if match.score1 > match.score2:
            s1.wins += 1; s2.losses += 1
            s1.points += tournament.points_win
            s2.points += tournament.points_loss
        elif match.score2 > match.score1:
            s2.wins += 1; s1.losses += 1
            s2.points += tournament.points_win
            s1.points += tournament.points_loss
        else:
            s1.draws += 1; s2.draws += 1
            s1.points += tournament.points_draw
            s2.points += tournament.points_draw

    Standing.objects.bulk_create(standings.values())


def recalculate_standings(tournament, phase='round_robin'):
    """Recalculate standings for a tournament phase from scratch."""
    Standing.objects.filter(tournament=tournament, phase=phase).delete()

    standings = {}
    for team in tournament.teams.all():
        standings[team.id] = Standing(
            tournament=tournament,
            team=team,
            phase=phase,
        )

    matches = Match.objects.filter(
        tournament=tournament,
        phase=phase,
        status=Match.STATUS_FINISHED,
    ).select_related('team1', 'team2')

    for match in matches:
        if not match.team1 or not match.team2:
            continue

        s1 = standings.get(match.team1.id)
        s2 = standings.get(match.team2.id)
        if not s1 or not s2:
            continue

        s1.played += 1
        s2.played += 1
        s1.cups_scored += match.score1
        s1.cups_conceded += match.score2
        s2.cups_scored += match.score2
        s2.cups_conceded += match.score1

        if match.bonus_team1:
            s1.bonus_points += tournament.points_bonus_all_cups
            s1.points += tournament.points_bonus_all_cups
        if match.bonus_team2:
            s2.bonus_points += tournament.points_bonus_all_cups
            s2.points += tournament.points_bonus_all_cups

        if match.score1 > match.score2:
            s1.wins += 1
            s2.losses += 1
            s1.points += tournament.points_win
            s2.points += tournament.points_loss
        elif match.score2 > match.score1:
            s2.wins += 1
            s1.losses += 1
            s2.points += tournament.points_win
            s1.points += tournament.points_loss
        else:
            s1.draws += 1
            s2.draws += 1
            s1.points += tournament.points_draw
            s2.points += tournament.points_draw

    Standing.objects.bulk_create(standings.values())
