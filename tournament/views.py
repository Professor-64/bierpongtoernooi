import json
from django.db.models import Q, F, ExpressionWrapper, IntegerField
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.http import require_POST, require_http_methods

from .models import Tournament, Team, Player, Table, Match, Standing, Drink, Group, DisplayGroup
from .forms import (
    TournamentCreateForm, TournamentGameForm, TournamentDisplayForm,
    TournamentSettingsForm, TournamentThemeForm,
    TournamentSoundForm, TournamentRulesForm, TeamForm, TableForm, DrinkForm,
)
from .schedule import (
    generate_round_robin_schedule, generate_knockout_bracket,
    generate_playoff_schedule, generate_final_ranking_schedule,
    pack_into_slots, recalculate_standings, recalculate_group_standings,
)


def _standings_annotate_order(qs):
    """Annotate with cup_diff and apply tiebreaker ordering:
    punten → bekerverschil → meest gescoord → minste tegen."""
    return qs.annotate(
        cup_diff=ExpressionWrapper(F('cups_scored') - F('cups_conceded'), output_field=IntegerField())
    ).order_by('-points', '-cup_diff', '-cups_scored', 'cups_conceded')


# ==================== Home ====================

def home(request):
    if request.user.is_authenticated:
        tournaments = Tournament.objects.filter(organizer=request.user).order_by('-created_at')
    else:
        tournaments = []
    return render(request, 'tournament/home.html', {'tournaments': tournaments})


# ==================== Drinks (platform-wide) ====================

@login_required
def drinks_manage(request):
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'add_drink':
            form = DrinkForm(request.POST, request.FILES)
            if form.is_valid():
                drink = form.save(commit=False)
                drink.created_by = request.user
                drink.save()
                messages.success(request, f'Drank "{drink.name}" toegevoegd!')
            else:
                messages.error(request, 'Controleer het formulier.')
            return redirect('drinks_manage')

        elif action == 'delete_drink':
            drink_id = request.POST.get('drink_id')
            drink = get_object_or_404(Drink, id=drink_id)
            name = drink.name
            drink.delete()
            messages.success(request, f'Drank "{name}" verwijderd.')
            return redirect('drinks_manage')

    drinks = Drink.objects.all()
    form = DrinkForm()
    return render(request, 'tournament/organizer/drinks.html', {
        'drinks': drinks,
        'form': form,
    })


# ==================== Organizer ====================

@login_required
def tournament_create(request):
    if request.method == 'POST':
        form = TournamentCreateForm(request.POST)
        if form.is_valid():
            tournament = form.save(commit=False)
            tournament.organizer = request.user
            base_slug = slugify(tournament.name)
            slug = base_slug
            counter = 1
            while Tournament.objects.filter(slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            tournament.slug = slug
            tournament.save()
            messages.success(request, f'Toernooi "{tournament.name}" aangemaakt!')
            return redirect('tournament_dashboard', slug=tournament.slug)
    else:
        form = TournamentCreateForm()
    return render(request, 'tournament/organizer/tournament_form.html', {
        'form': form,
        'title': 'Nieuw Toernooi',
    })


@login_required
def tournament_dashboard(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    teams_count = tournament.teams.count()
    tables_count = tournament.tables.count()
    matches_total = tournament.matches.count()
    matches_done = tournament.matches.filter(status=Match.STATUS_FINISHED).count()
    matches_live = tournament.matches.filter(status=Match.STATUS_IN_PROGRESS)

    standings = _standings_annotate_order(Standing.objects.filter(
        tournament=tournament, phase='round_robin'
    ).select_related('team'))[:5]

    # Progress percentage
    progress = int(matches_done / matches_total * 100) if matches_total > 0 else 0

    return render(request, 'tournament/organizer/dashboard.html', {
        'tournament': tournament,
        'teams_count': teams_count,
        'tables_count': tables_count,
        'matches_total': matches_total,
        'matches_done': matches_done,
        'matches_live': matches_live,
        'top_standings': standings,
        'progress': progress,
    })


@login_required
def tournament_settings(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)

    active_tab = 'game'

    if request.method == 'POST':
        form_type = request.POST.get('form_type', 'game')

        if form_type in ('game', 'settings'):
            old_format = tournament.format
            game_form = TournamentGameForm(request.POST, instance=tournament)
            display_form = TournamentDisplayForm(instance=tournament)
            theme_form = TournamentThemeForm(instance=tournament)
            sound_form = TournamentSoundForm(instance=tournament)
            if game_form.is_valid():
                saved = game_form.save()
                if saved.format != old_format:
                    tournament.matches.all().delete()
                    Standing.objects.filter(tournament=tournament).delete()
                    tournament.status = Tournament.STATUS_SETUP
                    tournament.save()
                    if request.POST.get('regenerate_rules') == '1':
                        tournament.custom_rules = _generate_auto_rules(tournament)
                        tournament.save(update_fields=['custom_rules'])
                    messages.warning(request, 'Formaat gewijzigd — het schema is verwijderd. Maak een nieuw schema aan.')
                else:
                    messages.success(request, 'Game-instellingen opgeslagen!')
                return redirect('tournament_settings', slug=tournament.slug)
            active_tab = 'game'

        elif form_type == 'display':
            game_form = TournamentGameForm(instance=tournament)
            display_form = TournamentDisplayForm(request.POST, instance=tournament)
            theme_form = TournamentThemeForm(instance=tournament)
            sound_form = TournamentSoundForm(instance=tournament)
            if display_form.is_valid():
                display_form.save()
                messages.success(request, 'Weergave-instellingen opgeslagen!')
                return redirect('tournament_settings', slug=tournament.slug)
            active_tab = 'display'

        elif form_type == 'sounds':
            game_form = TournamentGameForm(instance=tournament)
            display_form = TournamentDisplayForm(instance=tournament)
            theme_form = TournamentThemeForm(instance=tournament)
            sound_form = TournamentSoundForm(request.POST, request.FILES, instance=tournament)
            if sound_form.is_valid():
                sound_form.save()
                messages.success(request, 'Geluidsinstellingen opgeslagen!')
                return redirect('tournament_settings', slug=tournament.slug)
            active_tab = 'display'

        elif form_type == 'rules':
            game_form = TournamentGameForm(instance=tournament)
            display_form = TournamentDisplayForm(instance=tournament)
            theme_form = TournamentThemeForm(instance=tournament)
            sound_form = TournamentSoundForm(instance=tournament)
            rules_form = TournamentRulesForm(request.POST, instance=tournament)
            if rules_form.is_valid():
                rules_form.save()
                messages.success(request, 'Afspraken opgeslagen!')
                return redirect('tournament_settings', slug=tournament.slug)
            active_tab = 'rules'

        else:  # theme
            game_form = TournamentGameForm(instance=tournament)
            display_form = TournamentDisplayForm(instance=tournament)
            theme_form = TournamentThemeForm(request.POST, request.FILES, instance=tournament)
            sound_form = TournamentSoundForm(instance=tournament)
            rules_form = TournamentRulesForm(instance=tournament)
            if theme_form.is_valid():
                theme_form.save()
                messages.success(request, 'Thema opgeslagen!')
                return redirect('tournament_settings', slug=tournament.slug)
            active_tab = 'theme'
    else:
        game_form = TournamentGameForm(instance=tournament)
        display_form = TournamentDisplayForm(instance=tournament)
        theme_form = TournamentThemeForm(instance=tournament)
        sound_form = TournamentSoundForm(instance=tournament)
        initial_rules = tournament.custom_rules or _generate_auto_rules(tournament)
        rules_form = TournamentRulesForm(instance=tournament, initial={'custom_rules': initial_rules})

    return render(request, 'tournament/organizer/settings.html', {
        'tournament': tournament,
        'form': game_form,        # backward compat alias
        'game_form': game_form,
        'display_form': display_form,
        'theme_form': theme_form,
        'sound_form': sound_form,
        'rules_form': rules_form,
        'active_tab': active_tab,
    })


@login_required
def tournament_delete(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    if request.method == 'POST':
        name = tournament.name
        tournament.delete()
        messages.success(request, f'Toernooi "{name}" verwijderd.')
        return redirect('home')
    return render(request, 'tournament/organizer/tournament_delete.html', {'tournament': tournament})


# ==================== Teams ====================

@login_required
def teams_manage(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    teams = tournament.teams.prefetch_related('players').select_related('drink').all()

    if request.method == 'POST':
        action = request.POST.get('action')

        if action == 'add_team':
            form = TeamForm(request.POST)
            if form.is_valid():
                team = form.save(commit=False)
                team.tournament = tournament
                team.save()
                players_text = form.cleaned_data.get('players_text', '')
                for line in players_text.splitlines():
                    name = line.strip()
                    if name:
                        Player.objects.create(team=team, name=name)
                messages.success(request, f'Ploeg "{team.name}" toegevoegd!')
            else:
                messages.error(request, 'Controleer het formulier.')
            return redirect('teams_manage', slug=slug)

        elif action == 'delete_team':
            team_id = request.POST.get('team_id')
            team = get_object_or_404(Team, id=team_id, tournament=tournament)
            team.delete()
            messages.success(request, 'Ploeg verwijderd.')
            return redirect('teams_manage', slug=slug)

        elif action == 'add_player':
            team_id = request.POST.get('team_id')
            player_name = request.POST.get('player_name', '').strip()
            team = get_object_or_404(Team, id=team_id, tournament=tournament)
            if player_name:
                Player.objects.create(team=team, name=player_name)
                messages.success(request, f'Speler "{player_name}" toegevoegd!')
            return redirect('teams_manage', slug=slug)

        elif action == 'edit_team':
            team_id = request.POST.get('team_id')
            team = get_object_or_404(Team, id=team_id, tournament=tournament)
            name = request.POST.get('name', '').strip()
            drink_id = request.POST.get('drink_id', '').strip()
            if name:
                team.name = name
                if drink_id:
                    try:
                        team.drink = Drink.objects.get(id=int(drink_id))
                    except (Drink.DoesNotExist, ValueError):
                        team.drink = None
                else:
                    team.drink = None
                team.save()
                messages.success(request, 'Ploeg bijgewerkt.')
            return redirect('teams_manage', slug=slug)

        elif action == 'edit_player':
            player_id = request.POST.get('player_id')
            player = get_object_or_404(Player, id=player_id, team__tournament=tournament)
            name = request.POST.get('name', '').strip()
            if name:
                player.name = name
                player.save()
            return redirect('teams_manage', slug=slug)

        elif action == 'delete_player':
            player_id = request.POST.get('player_id')
            player = get_object_or_404(Player, id=player_id, team__tournament=tournament)
            player.delete()
            return redirect('teams_manage', slug=slug)

    initial = {}
    if tournament.default_drink_id:
        initial['drink'] = tournament.default_drink_id
    form = TeamForm(initial=initial)
    drinks = Drink.objects.all()
    return render(request, 'tournament/organizer/teams.html', {
        'tournament': tournament,
        'teams': teams,
        'form': form,
        'drinks': drinks,
    })


# ==================== Tables ====================

@login_required
def tables_manage(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    tables = tournament.tables.all()

    if request.method == 'POST':
        action = request.POST.get('action')

        if action == 'update_layout':
            try:
                cols = max(1, min(8, int(request.POST.get('table_display_cols', 4))))
                orientation = request.POST.get('table_orientation', 'horizontal')
                if orientation not in ('horizontal', 'vertical'):
                    orientation = 'horizontal'
                tournament.table_display_cols = cols
                tournament.table_orientation = orientation
                tournament.save()
                tournament.tables.all().update(orientation=orientation)
                messages.success(request, 'Lay-out opgeslagen.')
            except (ValueError, TypeError):
                messages.error(request, 'Ongeldige waarde.')
            return redirect('tables_manage', slug=slug)

        elif action == 'add_table':
            form = TableForm(request.POST)
            if form.is_valid():
                table = form.save(commit=False)
                table.tournament = tournament
                table.orientation = tournament.table_orientation
                if tournament.tables.filter(number=table.number).exists():
                    messages.error(request, f'Tafel {table.number} bestaat al!')
                else:
                    table.save()
                    messages.success(request, f'Tafel "{table.name}" toegevoegd!')
            return redirect('tables_manage', slug=slug)

        elif action == 'edit_table':
            table_id = request.POST.get('table_id')
            table = get_object_or_404(Table, id=table_id, tournament=tournament)
            name = request.POST.get('name', '').strip()
            number_raw = request.POST.get('number', '').strip()
            if name:
                table.name = name
            if number_raw:
                try:
                    num = int(number_raw)
                    if not tournament.tables.filter(number=num).exclude(id=table.id).exists():
                        table.number = num
                    else:
                        messages.error(request, f'Nummer {num} is al in gebruik.')
                except ValueError:
                    pass
            table.save()
            messages.success(request, 'Tafel bijgewerkt.')
            return redirect('tables_manage', slug=slug)

        elif action == 'delete_table':
            table_id = request.POST.get('table_id')
            table = get_object_or_404(Table, id=table_id, tournament=tournament)
            table.delete()
            messages.success(request, 'Tafel verwijderd.')
            return redirect('tables_manage', slug=slug)

        elif action == 'add_multiple':
            try:
                count = int(request.POST.get('count', 1))
                prefix = request.POST.get('prefix', 'Tafel').strip() or 'Tafel'
                existing_max = tournament.tables.order_by('-number').values_list('number', flat=True).first() or 0
                for i in range(count):
                    num = existing_max + i + 1
                    Table.objects.create(
                        tournament=tournament,
                        number=num,
                        name=f'{prefix} {num}',
                        orientation=tournament.table_orientation,
                    )
                messages.success(request, f'{count} tafels toegevoegd!')
            except (ValueError, TypeError):
                messages.error(request, 'Ongeldig aantal.')
            return redirect('tables_manage', slug=slug)

    form = TableForm()
    return render(request, 'tournament/organizer/tables.html', {
        'tournament': tournament,
        'tables': tables,
        'form': form,
    })


# ==================== Schedule ====================

@login_required
def schedule_view(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)

    if request.method == 'POST':
        action = request.POST.get('action')

        if action == 'generate':
            teams = list(tournament.teams.all())
            tables = list(tournament.tables.all())

            if len(teams) < 2:
                messages.error(request, 'Je hebt minstens 2 ploegen nodig!')
                return redirect('schedule_view', slug=slug)
            if not tables:
                messages.error(request, 'Je hebt minstens 1 tafel nodig!')
                return redirect('schedule_view', slug=slug)

            if tournament.format == Tournament.FORMAT_KNOCKOUT:
                tournament.matches.all().delete()
                Standing.objects.filter(tournament=tournament).delete()
                _generate_knockout(tournament)
                ko_count = tournament.matches.count()
                messages.success(request, f'Knock-out schema aangemaakt! {ko_count} wedstrijden.')

            elif tournament.format == Tournament.FORMAT_GROUPS:
                _generate_groups_phase(tournament)
                count = tournament.matches.filter(phase=Match.PHASE_GROUP).count()
                slots = tournament.matches.filter(phase=Match.PHASE_GROUP).values_list(
                    'round_number', flat=True).distinct().count()
                messages.success(request, f'Pouleronde aangemaakt! {count} wedstrijden in {slots} rondes.')

            else:
                # Round-robin or combined: generate round-robin phase
                tournament.matches.filter(phase=Match.PHASE_ROUND_ROBIN).delete()
                if tournament.format == Tournament.FORMAT_COMBINED:
                    tournament.matches.exclude(phase=Match.PHASE_ROUND_ROBIN).delete()
                    Standing.objects.filter(tournament=tournament).delete()
                    tournament.status = Tournament.STATUS_ROUND_ROBIN
                    tournament.save()
                else:
                    Standing.objects.filter(tournament=tournament, phase='round_robin').delete()

                max_unique = len(teams) - 1
                if tournament.games_per_team > max_unique:
                    messages.warning(
                        request,
                        f'Met {len(teams)} ploegen kan elke ploeg maximaal {max_unique} unieke '
                        f'tegenstanders spelen. Met {tournament.games_per_team} wedstrijden per ploeg '
                        f'spelen sommige ploegen meerdere keren tegen dezelfde tegenstander. '
                        f'Pas "Wedstrijden per ploeg" aan naar maximaal {max_unique} om dit te vermijden.'
                    )

                rounds = generate_round_robin_schedule(teams, tournament.games_per_team)
                tables_count = len(tables)

                if tournament.schedule_efficient:
                    all_matches = [pair for r in rounds for pair in r]
                    slots = pack_into_slots(all_matches, tables_count)
                else:
                    slots = []
                    for round_matches in rounds:
                        remaining = list(round_matches)
                        while remaining:
                            slots.append(remaining[:tables_count])
                            remaining = remaining[tables_count:]

                t_idx = 0
                to_create = []
                for slot_num, slot_matches in enumerate(slots, 1):
                    for team1, team2 in slot_matches:
                        to_create.append(Match(
                            tournament=tournament,
                            phase=Match.PHASE_ROUND_ROBIN,
                            round_number=slot_num,
                            table=tables[t_idx % tables_count],
                            team1=team1,
                            team2=team2,
                        ))
                        t_idx += 1
                Match.objects.bulk_create(to_create)

                tournament.status = Tournament.STATUS_ROUND_ROBIN
                tournament.save()
                messages.success(request, f'Competitiefase aangemaakt! {len(to_create)} wedstrijden in {len(slots)} rondes.')

            return redirect('schedule_view', slug=slug)

        elif action == 'advance_knockout':
            # Optional custom team ordering for tie-breaking
            custom_ranked = None
            team_order_raw = request.POST.get('team_order', '')
            if team_order_raw:
                try:
                    team_ids = json.loads(team_order_raw)
                    team_map = {t.id: t for t in tournament.teams.all()}
                    custom_ranked = [team_map[tid] for tid in team_ids if tid in team_map]
                except (json.JSONDecodeError, KeyError, TypeError):
                    custom_ranked = None

            if tournament.format == Tournament.FORMAT_GROUPS:
                group_unfinished = tournament.matches.filter(
                    phase=Match.PHASE_GROUP,
                    status__in=[Match.STATUS_SCHEDULED, Match.STATUS_IN_PROGRESS],
                )
                if group_unfinished.exists():
                    messages.warning(request, f'Let op: er zijn nog {group_unfinished.count()} niet-afgespeelde poulewedstrijden.')
                _advance_groups_to_knockout(tournament, custom_ranked_teams=custom_ranked)
            else:
                unfinished = tournament.matches.filter(
                    phase=Match.PHASE_ROUND_ROBIN,
                    status__in=[Match.STATUS_SCHEDULED, Match.STATUS_IN_PROGRESS],
                )
                if unfinished.exists():
                    messages.warning(request, f'Let op: er zijn nog {unfinished.count()} niet-afgespeelde competitiewedstrijden.')
                _generate_knockout(tournament, custom_ranked_teams=custom_ranked)
            ko_count = tournament.matches.exclude(
                phase__in=[Match.PHASE_ROUND_ROBIN, Match.PHASE_GROUP]
            ).count()
            messages.success(request, f'Post-competitiefase aangemaakt! {ko_count} wedstrijden.')
            return redirect('live_scoring', slug=slug)

        elif action == 'generate_final_ranking':
            # Only used for pure round_robin format (combined uses advance_knockout)
            ok = _generate_final_ranking(tournament)
            if ok:
                fr_count = tournament.matches.filter(phase=Match.PHASE_FINAL_RANKING).count()
                messages.success(request, f'Finale ranking aangemaakt! {fr_count} wedstrijden.')
            else:
                messages.error(request, 'Niet genoeg ploegen voor finale ranking (minimum 2).')
            return redirect('live_scoring', slug=slug)

        elif action == 'set_status':
            new_status = request.POST.get('status')
            if new_status in dict(Tournament.STATUS_CHOICES):
                tournament.status = new_status
                tournament.save()
            return redirect('tournament_dashboard', slug=slug)

    rr_matches = tournament.matches.filter(
        phase=Match.PHASE_ROUND_ROBIN
    ).select_related('team1', 'team2', 'table').order_by('round_number', 'id')

    ko_matches = tournament.matches.filter(
        phase__in=[
            Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL,
            Match.PHASE_THIRD_PLACE, Match.PHASE_FINAL,
        ]
    ).select_related('team1', 'team2', 'table').order_by('phase', 'bracket_slot')

    playoff_matches = tournament.matches.filter(
        phase=Match.PHASE_PLAYOFF
    ).select_related('team1', 'team2', 'table').order_by('bracket_slot')

    final_ranking_matches = tournament.matches.filter(
        phase=Match.PHASE_FINAL_RANKING
    ).select_related('team1', 'team2', 'table').order_by('bracket_slot')

    rounds = {}
    for match in rr_matches:
        rounds.setdefault(match.round_number, []).append(match)

    ko_by_phase = {}
    phase_order = [Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL, Match.PHASE_THIRD_PLACE, Match.PHASE_FINAL]
    for match in ko_matches:
        ko_by_phase.setdefault(match.phase, []).append(match)

    rr_total = rr_matches.count()
    rr_done = rr_matches.filter(status=Match.STATUS_FINISHED).count()

    # Groups schedule data
    groups_schedule = []
    if tournament.format == Tournament.FORMAT_GROUPS:
        for group in tournament.groups.all():
            gm = tournament.matches.filter(
                phase=Match.PHASE_GROUP, group=group
            ).select_related('team1', 'team2', 'table').order_by('round_number', 'id')
            grp_rounds = {}
            for m in gm:
                grp_rounds.setdefault(m.round_number, []).append(m)
            teams_in_group = list(group.teams.all().order_by('name'))
            groups_schedule.append({
                'group': group,
                'rounds': grp_rounds,
                'teams': teams_in_group,
            })

    group_total = tournament.matches.filter(phase=Match.PHASE_GROUP).count()

    # Can advance from group/RR phase to post-competition
    can_advance = (
        (tournament.format == Tournament.FORMAT_COMBINED and rr_total > 0) or
        (tournament.format == Tournament.FORMAT_GROUPS and group_total > 0)
    ) and not ko_matches.exists() and not playoff_matches.exists()

    # Dynamisch label: bestaande fasen, anders geconfigureerde fasen
    _sched_parts = []
    if ko_matches.exists():            _sched_parts.append('KO')
    if playoff_matches.exists():       _sched_parts.append('PO')
    if final_ranking_matches.exists(): _sched_parts.append('FR')
    if not _sched_parts:
        if tournament.format in [Tournament.FORMAT_COMBINED, Tournament.FORMAT_GROUPS]:
            _sched_parts.append('KO')
        if tournament.playoff_enabled:
            _sched_parts.append('PO')
        if tournament.final_ranking_enabled:
            _sched_parts.append('FR')
    post_competition_label = '/'.join(_sched_parts) if _sched_parts else 'Post-competitie'

    return render(request, 'tournament/organizer/schedule.html', {
        'tournament': tournament,
        'rounds': rounds,
        'ko_by_phase': ko_by_phase,
        'phase_order': phase_order,
        'playoff_matches': playoff_matches,
        'final_ranking_matches': final_ranking_matches,
        'rr_total': rr_total,
        'rr_done': rr_done,
        'groups_schedule': groups_schedule,
        'group_total': group_total,
        'can_advance': can_advance,
        'post_competition_label': post_competition_label,
    })


def _generate_groups_phase(tournament):
    """Generate groups (poules) phase: divide teams into groups, play full RR within each group."""
    import random as _random

    tables = list(tournament.tables.all())
    tables_count = len(tables) if tables else 1

    # Wipe everything: matches, groups, standings
    tournament.matches.all().delete()
    tournament.groups.all().delete()
    Standing.objects.filter(tournament=tournament).delete()

    teams = list(tournament.teams.all())
    _random.shuffle(teams)
    n_groups = max(2, tournament.groups_count)

    # Create group objects (Poule A, B, C, …)
    groups = []
    for i in range(n_groups):
        g = Group.objects.create(
            tournament=tournament,
            number=i + 1,
            name=f'Poule {chr(65 + i)}',
        )
        groups.append(g)

    # Distribute teams round-robin style for balance
    group_teams = [[] for _ in range(n_groups)]
    for i, team in enumerate(teams):
        group_teams[i % n_groups].append(team)

    # Assign group FK to teams
    team_updates = []
    for i, group in enumerate(groups):
        for team in group_teams[i]:
            team.group = group
            team_updates.append(team)
    Team.objects.bulk_update(team_updates, ['group'])

    # Generate full RR within each group; keep rounds separate for interleaving
    pair_to_group = {}
    group_rr = []  # per group: list of rounds, each round is list of (t1, t2)
    for i, group in enumerate(groups):
        gt = group_teams[i]
        n = len(gt)
        if n < 2:
            group_rr.append([])
            continue
        rr_rounds_needed = n if n % 2 == 1 else n - 1
        rr = generate_round_robin_schedule(gt, rr_rounds_needed)
        group_rr.append(rr)
        for round_pairs in rr:
            for t1, t2 in round_pairs:
                pair_to_group[(t1.id, t2.id)] = group
                pair_to_group[(t2.id, t1.id)] = group

    # Interleave rounds across groups: round 1 from all groups, then round 2, etc.
    # This ensures pack_into_slots mixes groups in every slot.
    max_rounds = max((len(rr) for rr in group_rr), default=0)
    all_pairs = []
    for round_idx in range(max_rounds):
        for grp_rr in group_rr:
            if round_idx < len(grp_rr):
                all_pairs.extend(grp_rr[round_idx])

    if not all_pairs:
        return

    # Pack into slots across all groups for maximum table utilisation
    slots = pack_into_slots(all_pairs, tables_count)

    t_idx = 0
    to_create = []
    for slot_num, slot_pairs in enumerate(slots, 1):
        for t1, t2 in slot_pairs:
            grp = pair_to_group.get((t1.id, t2.id))
            to_create.append(Match(
                tournament=tournament,
                phase=Match.PHASE_GROUP,
                round_number=slot_num,
                table=tables[t_idx % tables_count],
                team1=t1,
                team2=t2,
                group=grp,
            ))
            t_idx += 1

    Match.objects.bulk_create(to_create)
    tournament.status = Tournament.STATUS_ROUND_ROBIN
    tournament.save()


def _get_teams_from_groups(tournament):
    """
    Returns (ko_teams, po_teams, fr_teams) for the groups format.

    Selection process (same as UEFA-style best-runner-up):
      1. Take all rank-1 teams, then all rank-2, etc.
      2. When a rank produces more teams than the remaining slots, apply
         cross-group tiebreaker: points → cup_diff → cups_scored → cups_conceded.

    Uses tournament.knockout_advancement, playoff_count and final_ranking_enabled
    (the same fields as combined format — no more per-group settings).
    """
    n_ko = tournament.knockout_advancement
    n_po = tournament.playoff_count if tournament.playoff_enabled else 0

    # Build per-group standing lists (already ordered by rank within group)
    group_standings = {}
    for group in tournament.groups.all().order_by('number'):
        qs = _standings_annotate_order(Standing.objects.filter(
            tournament=tournament, phase='group', group=group,
        ).select_related('team'))
        sl = list(qs)
        if not sl:
            # Fallback: no standings yet → use team order
            sl = [type('S', (), {'team': t, 'points': 0, 'cup_diff': 0,
                                  'cups_scored': 0, 'cups_conceded': 0})()
                  for t in group.teams.all()]
        group_standings[group.id] = sl

    if not group_standings:
        return [], [], []

    max_rank = max(len(v) for v in group_standings.values())

    def pick_best(n_slots, exclude_ids):
        """Fill n_slots by rank; apply cross-group tiebreaker when a rank has too many teams."""
        result = []
        for rank in range(max_rank):
            if len(result) >= n_slots:
                break
            rank_standings = [
                sl[rank]
                for sl in group_standings.values()
                if rank < len(sl) and sl[rank].team.id not in exclude_ids
            ]
            still_need = n_slots - len(result)
            if len(rank_standings) <= still_need:
                result.extend(rank_standings)
            else:
                # Cross-group tiebreaker
                rank_standings.sort(key=lambda s: (
                    -s.points,
                    -(s.cups_scored - s.cups_conceded),
                    -s.cups_scored,
                    s.cups_conceded,
                ))
                result.extend(rank_standings[:still_need])
        return [s.team for s in result]

    ko_teams = pick_best(n_ko, set())
    ko_ids   = {t.id for t in ko_teams}
    po_teams = pick_best(n_po, ko_ids) if n_po else []

    fr_teams = []
    if tournament.final_ranking_enabled:
        excl  = ko_ids | {t.id for t in po_teams}
        total = sum(len(v) for v in group_standings.values())
        fr_teams = pick_best(total - len(ko_teams) - len(po_teams), excl)

    return ko_teams, po_teams, fr_teams


def _advance_groups_to_knockout(tournament, custom_ranked_teams=None):
    """Generate post-competition phases from group standings.
    Pass custom_ranked_teams (flat ordered list) to override per-group interleaving."""
    tables = list(tournament.tables.all())
    tables_count = len(tables) if tables else 1

    if custom_ranked_teams is not None:
        n_ko = tournament.knockout_advancement
        n_po = tournament.playoff_count if tournament.playoff_enabled else 0
        ko_teams = custom_ranked_teams[:n_ko]
        po_teams = custom_ranked_teams[n_ko:n_ko + n_po] if n_po else []
        fr_teams = custom_ranked_teams[n_ko + n_po:] if tournament.final_ranking_enabled else []
    else:
        ko_teams, po_teams, fr_teams = _get_teams_from_groups(tournament)

    # Delete existing post-competition matches (keep group phase)
    tournament.matches.exclude(
        phase__in=[Match.PHASE_ROUND_ROBIN, Match.PHASE_GROUP]
    ).delete()

    # KO bracket
    bracket = generate_knockout_bracket(ko_teams)
    for t1, t2, phase, slot in bracket:
        Match.objects.create(
            tournament=tournament, phase=phase,
            round_number=0, bracket_slot=slot,
            team1=t1, team2=t2, table=None, hidden=False,
        )

    # PO matches
    if po_teams:
        for i, (t1, t2) in enumerate(generate_playoff_schedule(po_teams), 1):
            Match.objects.create(
                tournament=tournament, phase=Match.PHASE_PLAYOFF,
                round_number=0, bracket_slot=i,
                team1=t1, team2=t2, table=None, hidden=False,
            )

    # FR matches
    if len(fr_teams) >= 2:
        for i, (t1, t2) in enumerate(
            generate_final_ranking_schedule(fr_teams, tables_count), 1
        ):
            Match.objects.create(
                tournament=tournament, phase=Match.PHASE_FINAL_RANKING,
                round_number=0, bracket_slot=i,
                team1=t1, team2=t2, table=None, hidden=False,
            )

    _assign_combined_slots(tournament)
    _auto_create_display_groups(tournament)
    tournament.status = Tournament.STATUS_KNOCKOUT
    tournament.save()


def _get_ranked_teams(tournament):
    """Return all teams ordered by round-robin standings (or team order as fallback)."""
    standings = _standings_annotate_order(Standing.objects.filter(
        tournament=tournament, phase='round_robin'
    ).select_related('team'))
    ranked = [s.team for s in standings]
    if not ranked:
        ranked = list(tournament.teams.all())
    return ranked


def _assign_tables_to_matches(matches_data, tables, start_round=2):
    """Legacy: pack match dicts into rounds of tables_count each."""
    if not matches_data:
        return
    tables_count = len(tables) if tables else 0
    pairs = [(d['team1'], d['team2']) for d in matches_data]
    slots = [pairs[i:i+tables_count] for i in range(0, len(pairs), tables_count)] if tables_count else [pairs]
    t_idx = 0
    for rn, slot in enumerate(slots, start_round):
        for i, (t1, t2) in enumerate(slot):
            Match.objects.create(
                tournament=matches_data[0]['tournament'],
                phase=matches_data[0]['phase'],
                round_number=rn,
                bracket_slot=matches_data[t_idx % len(matches_data)]['bracket_slot'] if matches_data else i + 1,
                team1=t1, team2=t2,
                table=tables[t_idx % tables_count] if tables_count else None,
            )
            t_idx += 1


def _assign_tables_to_matches_slotted(slots, tournament, phase, tables, start_round=2, hidden=False):
    """
    Create Match objects from pre-computed slots (list of list of (team1, team2)).
    bracket_slot is assigned sequentially across all slots.
    """
    if not slots:
        return
    tables_count = len(tables) if tables else 0
    t_idx = 0
    bracket_slot = 1
    for rn, slot in enumerate(slots, start_round):
        for t1, t2 in slot:
            Match.objects.create(
                tournament=tournament,
                phase=phase,
                round_number=rn,
                bracket_slot=bracket_slot,
                team1=t1, team2=t2,
                table=tables[t_idx % tables_count] if tables_count else None,
                hidden=hidden,
            )
            t_idx += 1
            bracket_slot += 1


def _assign_combined_slots(tournament):
    """
    Assign round_numbers and tables to all post-competition matches jointly.

    Priority order per slot: PO → FR → KO (with known teams).
    KO matches with TBD teams keep round_number=0 (filled later by bracket advancement).
    KO later-round matches (SF, Final, Third) also keep round_number=0 until their
    predecessors finish — only the first playable KO level is included.
    """
    tables = list(tournament.tables.all())
    tables_count = len(tables) if tables else 1

    # Collect all ready matches in priority order
    po = list(tournament.matches.filter(
        phase=Match.PHASE_PLAYOFF,
        team1__isnull=False, team2__isnull=False,
    ).order_by('bracket_slot'))

    fr = list(tournament.matches.filter(
        phase=Match.PHASE_FINAL_RANKING,
        team1__isnull=False, team2__isnull=False,
    ).order_by('bracket_slot'))

    # Only the first KO phase that has any playable matches
    ko_phase_order = [Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL,
                      Match.PHASE_FINAL, Match.PHASE_THIRD_PLACE]
    ko_ready = []
    for phase in ko_phase_order:
        phase_matches = list(tournament.matches.filter(
            phase=phase, team1__isnull=False, team2__isnull=False,
        ).order_by('bracket_slot'))
        if phase_matches:
            ko_ready = phase_matches
            break

    priority_matches = po + fr + ko_ready  # PO > FR > KO

    if not priority_matches:
        return

    # Build (team1, team2) pairs preserving priority order
    pairs = [(m.team1, m.team2) for m in priority_matches]

    if tournament.schedule_efficient:
        slots = pack_into_slots(pairs, tables_count)
    else:
        # Priority-grouped: PO sub-slots first, then FR, then KO
        def chunk(lst, n):
            return [lst[i:i+n] for i in range(0, len(lst), n)] if lst else []
        po_slots = chunk([(m.team1, m.team2) for m in po], tables_count)
        fr_slots = chunk([(m.team1, m.team2) for m in fr], tables_count)
        ko_slots = chunk([(m.team1, m.team2) for m in ko_ready], tables_count)
        slots = po_slots + fr_slots + ko_slots

    # Assign round_numbers and tables
    match_queue = list(priority_matches)
    t_idx = 0
    to_update = []
    for slot_num, slot_pairs in enumerate(slots, 1):
        for _ in slot_pairs:
            if not match_queue:
                break
            m = match_queue.pop(0)
            m.round_number = slot_num
            m.table = tables[t_idx % tables_count] if tables else None
            to_update.append(m)
            t_idx += 1

    Match.objects.bulk_update(to_update, ['round_number', 'table'])


def _auto_create_display_groups(tournament):
    """
    Auto-distribute all KO/PO/FR matches into DisplayGroups after schedule creation.
    Order: PO first, then FR (lowest places first = highest bracket_slot first),
    then KO (QF → SF → 3rd → Final).
    Each group gets table_count matches; first group is set active.
    """
    # Delete existing display groups (and their match assignments via SET_NULL)
    tournament.display_groups.all().delete()

    tables = list(tournament.tables.all())
    tables_count = len(tables) if tables else 1

    def _chunks(matches, label):
        """Split matches into groups of tables_count with a descriptive name."""
        if not matches:
            return []
        batches = [matches[i:i + tables_count] for i in range(0, len(matches), tables_count)]
        if len(batches) == 1:
            return [(label, batches[0])]
        return [(f'{label} {i + 1}', b) for i, b in enumerate(batches)]

    # PO: ascending bracket_slot
    po = list(tournament.matches.filter(
        phase=Match.PHASE_PLAYOFF
    ).order_by('bracket_slot', 'id'))

    # FR: descending bracket_slot (lowest positions first)
    fr = list(tournament.matches.filter(
        phase=Match.PHASE_FINAL_RANKING
    ).order_by('-bracket_slot', 'id'))

    # QF: split ready (known teams) vs TBD (waiting for PO winners)
    qf_all = list(tournament.matches.filter(
        phase=Match.PHASE_QUARTERFINAL
    ).order_by('bracket_slot', 'id'))
    qf_ready = [m for m in qf_all if m.team1 and m.team2]
    qf_tbd   = [m for m in qf_all if not (m.team1 and m.team2)]

    sf = list(tournament.matches.filter(
        phase=Match.PHASE_SEMIFINAL
    ).order_by('bracket_slot', 'id'))

    # 3rd place + Final together (played simultaneously)
    finale = (
        list(tournament.matches.filter(phase=Match.PHASE_THIRD_PLACE).order_by('bracket_slot', 'id')) +
        list(tournament.matches.filter(phase=Match.PHASE_FINAL).order_by('bracket_slot', 'id'))
    )

    # PO + FR are always mixed together.
    # When schedule_efficient is on, also mix ready KO (QF with known teams) into those groups.
    mix_parts = []
    if po:  mix_parts.append('PO')
    if fr:  mix_parts.append('FR')
    if tournament.schedule_efficient and qf_ready:
        mix_parts.append('KO')
    mix_label = ' / '.join(mix_parts) if mix_parts else 'Ronde'

    if tournament.schedule_efficient:
        # Efficient ON: PO + FR + ready QF mixed; TBD QF separate (after PO)
        mix_matches    = po + fr + qf_ready
        qf_main        = []
        qf_after_po    = qf_tbd
    else:
        # Efficient OFF: PO + FR mixed; all QFs (ready + TBD) together in one group
        mix_matches    = po + fr
        qf_main        = qf_ready + qf_tbd
        qf_after_po    = []

    named_chunks = (
        _chunks(mix_matches, mix_label) +
        _chunks(qf_main,     'Kwartfinale') +
        _chunks(qf_after_po, 'Kwartfinale (na play-offs)') +
        _chunks(sf,          'Halve finale') +
        _chunks(finale,      'Finale')
    )

    if not named_chunks:
        return

    to_update = []
    for idx, (name, chunk) in enumerate(named_chunks):
        group = DisplayGroup.objects.create(
            tournament=tournament,
            name=name,
            order=idx,
            is_active=(idx == 0),
        )
        for match_order, match in enumerate(chunk):
            match.display_group = group
            match.display_group_order = match_order
            if match_order < len(tables):
                match.table = tables[match_order]
            to_update.append(match)

    Match.objects.bulk_update(to_update, ['display_group', 'display_group_order', 'table'])


def _generate_knockout(tournament, custom_ranked_teams=None):
    """
    Generate KO bracket.
    For combined format also generates PO and FR, then assigns combined slots.
    Pass custom_ranked_teams to override standings-based ordering (for tie-breaking).
    """
    tables = list(tournament.tables.all())
    tables_count = len(tables) if tables else 1

    if tournament.format == Tournament.FORMAT_KNOCKOUT:
        top_teams = list(tournament.teams.all())
        playoff_teams, fr_teams = [], []
    else:
        all_ranked = custom_ranked_teams if custom_ranked_teams is not None else _get_ranked_teams(tournament)
        n = tournament.knockout_advancement
        top_teams = all_ranked[:n] or list(tournament.teams.all()[:n])
        remaining = all_ranked[n:]
        if tournament.playoff_enabled and tournament.playoff_count > 0:
            playoff_teams = remaining[:tournament.playoff_count]
            remaining = remaining[tournament.playoff_count:]
        else:
            playoff_teams = []
        fr_teams = remaining if tournament.final_ranking_enabled else []

    # Delete all existing post-competition matches
    tournament.matches.exclude(phase=Match.PHASE_ROUND_ROBIN).delete()

    # --- Create KO bracket (hidden=True by default, round_number=0 initially) ---
    bracket = generate_knockout_bracket(top_teams)
    for t1, t2, phase, slot in bracket:
        Match.objects.create(
            tournament=tournament, phase=phase,
            round_number=0, bracket_slot=slot,
            team1=t1, team2=t2, table=None, hidden=False,
        )

    # --- Create PO matches (hidden=True) ---
    if playoff_teams:
        for i, (t1, t2) in enumerate(generate_playoff_schedule(playoff_teams), 1):
            Match.objects.create(
                tournament=tournament, phase=Match.PHASE_PLAYOFF,
                round_number=0, bracket_slot=i,
                team1=t1, team2=t2, table=None, hidden=False,
            )

    # --- Create FR matches (hidden=True) ---
    if len(fr_teams) >= 2:
        for i, (t1, t2) in enumerate(
            generate_final_ranking_schedule(fr_teams, tables_count), 1
        ):
            Match.objects.create(
                tournament=tournament, phase=Match.PHASE_FINAL_RANKING,
                round_number=0, bracket_slot=i,
                team1=t1, team2=t2, table=None, hidden=False,
            )

    # --- Assign combined slots (PO + FR + first playable KO level) ---
    _assign_combined_slots(tournament)
    _auto_create_display_groups(tournament)

    tournament.status = Tournament.STATUS_KNOCKOUT
    tournament.save()


def _generate_final_ranking(tournament):
    """
    Generate finale ranking matches for teams not in KO or playoff.
    - combined: teams after (knockout_advancement + playoff_count) in standings
    - round_robin: all teams by standings
    Returns True on success, False if not enough teams.
    """
    tables = list(tournament.tables.all())

    if tournament.format == Tournament.FORMAT_ROUND_ROBIN:
        fr_teams = _get_ranked_teams(tournament)
    else:
        all_ranked = _get_ranked_teams(tournament)
        skip = tournament.knockout_advancement
        if tournament.playoff_enabled:
            skip += tournament.playoff_count
        fr_teams = all_ranked[skip:]

    if len(fr_teams) < 2:
        return False

    # Start after the highest existing round
    max_round = (
        tournament.matches.order_by('-round_number')
        .values_list('round_number', flat=True).first() or 1
    )

    # Delete existing finale ranking matches before regenerating
    tournament.matches.filter(phase=Match.PHASE_FINAL_RANKING).delete()

    fr_pairs = generate_final_ranking_schedule(fr_teams, len(tables))
    tables_count = len(tables) if tables else 1

    if tournament.schedule_efficient:
        fr_slots = pack_into_slots(fr_pairs, tables_count)
    else:
        fr_slots = [fr_pairs[i:i+tables_count]
                    for i in range(0, len(fr_pairs), tables_count)]

    _assign_tables_to_matches_slotted(
        fr_slots, tournament, Match.PHASE_FINAL_RANKING, tables, start_round=max_round + 1
    )
    _auto_create_display_groups(tournament)
    return True


def _advance_playoff_to_knockout(tournament, finished_playoff_match):
    """
    Called when a playoff match finishes.
    If ALL playoff matches are done, fill TBD slots in first-round KO matches with playoff winners.
    """
    all_playoff = list(
        tournament.matches.filter(phase=Match.PHASE_PLAYOFF).order_by('bracket_slot')
    )
    if not all_playoff:
        return

    all_done = all(m.status == Match.STATUS_FINISHED for m in all_playoff)
    if not all_done:
        return

    # Collect winners in bracket_slot order
    winners = []
    for m in all_playoff:
        w = m.get_winner()
        if w:
            winners.append(w)

    if not winners:
        return

    # Find TBD slots in KO first round (quarterfinals or semifinals)
    # We look for matches where team1 or team2 is null in the first KO round
    first_ko_phase_order = [
        Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL, Match.PHASE_FINAL
    ]
    tbd_matches = []
    for phase in first_ko_phase_order:
        tbd = list(
            tournament.matches.filter(
                phase=phase
            ).filter(
                Q(team1__isnull=True) | Q(team2__isnull=True)
            ).order_by('bracket_slot')
        )
        if tbd:
            tbd_matches = tbd
            break

    if tbd_matches:
        winner_idx = 0
        to_save = []
        for match in tbd_matches:
            if winner_idx >= len(winners):
                break
            if match.team1 is None:
                match.team1 = winners[winner_idx]; winner_idx += 1
            if match.team2 is None and winner_idx < len(winners):
                match.team2 = winners[winner_idx]; winner_idx += 1
            to_save.append(match)

        Match.objects.bulk_update(to_save, ['team1', 'team2'])

        # Re-run combined slot assignment now that more KO matches have teams
        _assign_combined_slots(tournament)

    # Create consolation matches for PO losers when final_ranking is also enabled
    if tournament.final_ranking_enabled:
        _create_consolation_matches(tournament, all_playoff)


def _create_consolation_matches(tournament, playoff_matches):
    """
    Create consolation FR matches for playoff losers (placed before existing FR matches).
    Only runs once: guards against duplicate creation by checking if any loser is already in FR.
    """
    losers = [m.get_loser() for m in playoff_matches if m.get_loser()]
    if len(losers) < 2:
        return

    # Guard: don't create if consolation already exists
    loser_ids = {l.id for l in losers}
    already_exists = tournament.matches.filter(
        phase=Match.PHASE_FINAL_RANKING
    ).filter(
        Q(team1_id__in=loser_ids) | Q(team2_id__in=loser_ids)
    ).exists()
    if already_exists:
        return

    # Generate consolation pairs (adjacent: loser1 vs loser2, loser3 vs loser4, …)
    pairs = generate_final_ranking_schedule(losers, 1)
    num_consolation = len(pairs)
    if num_consolation == 0:
        return

    # Shift existing FR bracket_slots up to make room for consolation at the top
    existing_fr = list(tournament.matches.filter(
        phase=Match.PHASE_FINAL_RANKING
    ).order_by('bracket_slot'))
    for m in existing_fr:
        m.bracket_slot += num_consolation
    if existing_fr:
        Match.objects.bulk_update(existing_fr, ['bracket_slot'])

    # Create consolation matches at slots 1…num_consolation
    for i, (t1, t2) in enumerate(pairs, 1):
        Match.objects.create(
            tournament=tournament,
            phase=Match.PHASE_FINAL_RANKING,
            round_number=0,
            bracket_slot=i,
            team1=t1, team2=t2,
        )

    _assign_combined_slots(tournament)
    _auto_create_display_groups(tournament)


# ==================== Live Scoring ====================

@login_required
def live_scoring(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)

    fase_param = request.GET.get('fase')    # 'knockout', 'playoff', 'final_ranking'
    requested_round = request.GET.get('ronde')

    has_ko = tournament.matches.filter(
        phase__in=[Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL,
                   Match.PHASE_THIRD_PLACE, Match.PHASE_FINAL]
    ).exists()
    has_playoff = tournament.matches.filter(phase=Match.PHASE_PLAYOFF).exists()
    has_final_ranking = tournament.matches.filter(phase=Match.PHASE_FINAL_RANKING).exists()

    is_groups = tournament.format == Tournament.FORMAT_GROUPS
    group_phase = Match.PHASE_GROUP if is_groups else Match.PHASE_ROUND_ROBIN

    rr_rounds = list(
        tournament.matches.filter(phase=group_phase)
        .values_list('round_number', flat=True).distinct().order_by('round_number')
    )

    show_knockout = False
    show_playoff = False
    show_final_ranking = False
    current_round = None

    if fase_param == 'knockout':
        show_knockout = True
    elif fase_param == 'playoff':
        show_playoff = True
    elif fase_param == 'final_ranking':
        show_final_ranking = True
    elif requested_round:
        try:
            current_round = int(requested_round)
        except ValueError:
            current_round = rr_rounds[0] if rr_rounds else 1
    else:
        # Auto-pick: first unfinished
        unfinished = tournament.matches.filter(
            status__in=[Match.STATUS_SCHEDULED, Match.STATUS_IN_PROGRESS]
        ).order_by('round_number').first()
        if unfinished:
            if unfinished.phase in (Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL,
                                     Match.PHASE_THIRD_PLACE, Match.PHASE_FINAL):
                show_knockout = True
            elif unfinished.phase == Match.PHASE_PLAYOFF:
                show_playoff = True
            elif unfinished.phase == Match.PHASE_FINAL_RANKING:
                show_final_ranking = True
            else:
                current_round = unfinished.round_number
        else:
            last = tournament.matches.filter(phase=group_phase).order_by('-round_number').first()
            current_round = last.round_number if last else (rr_rounds[0] if rr_rounds else 1)

    if show_knockout:
        if tournament.format in [Tournament.FORMAT_COMBINED, Tournament.FORMAT_GROUPS]:
            from django.db.models import Case, When, IntegerField as _IF
            matches = tournament.matches.exclude(
                phase__in=[Match.PHASE_ROUND_ROBIN, Match.PHASE_GROUP]
            ).annotate(
                _pp=Case(
                    When(phase=Match.PHASE_PLAYOFF,        then=0),
                    When(phase=Match.PHASE_FINAL_RANKING,  then=1),
                    default=2, output_field=_IF(),
                )
            ).select_related('team1', 'team2', 'table').order_by('_pp', 'bracket_slot', 'id')
        else:
            matches = tournament.matches.filter(
                phase__in=[Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL,
                           Match.PHASE_THIRD_PLACE, Match.PHASE_FINAL]
            ).select_related('team1', 'team2', 'table').order_by('phase', 'bracket_slot', 'id')
    elif show_playoff:
        matches = tournament.matches.filter(
            phase=Match.PHASE_PLAYOFF
        ).select_related('team1', 'team2', 'table').order_by('bracket_slot', 'id')
    elif show_final_ranking:
        matches = tournament.matches.filter(
            phase=Match.PHASE_FINAL_RANKING
        ).select_related('team1', 'team2', 'table').order_by('bracket_slot', 'id')
    else:
        matches = tournament.matches.filter(
            phase=group_phase,
            round_number=current_round,
        ).select_related('team1', 'team2', 'table', 'group').order_by('table__number', 'id')

    all_tables = list(tournament.tables.all())

    rr_total = tournament.matches.filter(phase=group_phase).count()
    rr_done = tournament.matches.filter(phase=group_phase, status=Match.STATUS_FINISHED).count()
    rr_unfinished = rr_total - rr_done

    # "Naar KO/PO/FR": combi of groups, fase-matches bestaan, geen post-comp nog
    can_advance_ko = (
        tournament.format in [Tournament.FORMAT_COMBINED, Tournament.FORMAT_GROUPS] and
        rr_total > 0 and
        not has_ko and
        not has_playoff and
        not has_final_ranking
    )

    # "Naar finale ranking": alleen voor pure competitie (combined maakt FR via advance_knockout)
    can_advance_fr = (
        tournament.final_ranking_enabled and
        not has_final_ranking and
        tournament.format == Tournament.FORMAT_ROUND_ROBIN and
        rr_total > 0
    )

    # Dynamisch label voor gecombineerde post-competitie tab
    _post_parts = []
    if has_ko:           _post_parts.append('KO')
    if has_playoff:      _post_parts.append('PO')
    if has_final_ranking: _post_parts.append('FR')
    # Als nog niets bestaat, gebruik geconfigureerde fasen als hint
    if not _post_parts:
        if tournament.format in [Tournament.FORMAT_COMBINED, Tournament.FORMAT_GROUPS]:
            _post_parts.append('KO')
        if tournament.playoff_enabled:
            _post_parts.append('PO')
        if tournament.final_ranking_enabled:
            _post_parts.append('FR')
    post_competition_label = '/'.join(_post_parts) if _post_parts else 'Post-competitie'

    # Display groups for KO/PO/FR tab
    show_post = show_knockout or show_playoff or show_final_ranking
    display_groups = []
    unassigned_post_matches = []
    if show_post:
        display_groups = list(
            tournament.display_groups.prefetch_related(
                'matches__team1', 'matches__team2', 'matches__table'
            ).order_by('order', 'id')
        )
        # Sort matches within each group and add human-readable phase label
        for dg in display_groups:
            dg.sorted_matches = sorted(dg.matches.all(), key=lambda m: (m.display_group_order, m.id))
            for m in dg.sorted_matches:
                m.phase_label_text = _match_phase_label(m, tournament)

        unassigned_post_matches = list(
            tournament.matches.filter(
                display_group__isnull=True
            ).exclude(
                phase__in=[Match.PHASE_ROUND_ROBIN, Match.PHASE_GROUP]
            ).select_related('team1', 'team2', 'table').order_by('bracket_slot', 'id')
        )
        for m in unassigned_post_matches:
            m.phase_label_text = _match_phase_label(m, tournament)

        # Also label the main matches list (score-editing section)
        for m in matches:
            m.phase_label_text = _match_phase_label(m, tournament)
    else:
        # Normal rounds: label every match so the group name shows in the card header
        for m in matches:
            m.phase_label_text = _match_phase_label(m, tournament)

    return render(request, 'tournament/organizer/live.html', {
        'tournament': tournament,
        'matches': matches,
        'current_round': current_round,
        'rr_rounds': rr_rounds,
        'has_ko': has_ko,
        'has_playoff': has_playoff,
        'has_final_ranking': has_final_ranking,
        'show_knockout': show_knockout,
        'show_playoff': show_playoff,
        'show_final_ranking': show_final_ranking,
        'remaining_seconds': tournament.get_round_remaining_seconds(),
        'all_tables': all_tables,
        'can_advance_ko': can_advance_ko,
        'can_advance_fr': can_advance_fr,
        'rr_unfinished': rr_unfinished,
        'active_table_filter': tournament.active_table_filter,
        'post_competition_label': post_competition_label,
        'display_groups': display_groups,
        'unassigned_post_matches': unassigned_post_matches,
        'show_post': show_post,
    })


@login_required
@require_http_methods(['POST'])
def match_update(request, slug, match_id):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    match = get_object_or_404(Match, id=match_id, tournament=tournament)

    if request.content_type == 'application/json':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
    else:
        data = request.POST

    action = data.get('action', 'update_score')

    if action == 'start':
        match.status = Match.STATUS_IN_PROGRESS
        if not match.started_at:
            match.started_at = timezone.now()
        match.save()

    elif action == 'finish':
        match.score1 = int(data.get('score1', match.score1))
        match.score2 = int(data.get('score2', match.score2))
        bonus1 = data.get('bonus_team1')
        bonus2 = data.get('bonus_team2')
        match.bonus_team1 = bonus1 in [True, 'true', 'on', '1', 1]
        match.bonus_team2 = bonus2 in [True, 'true', 'on', '1', 1]
        match.status = Match.STATUS_FINISHED
        match.finished_at = timezone.now()
        match.save()

        if match.phase == Match.PHASE_GROUP:
            recalculate_group_standings(tournament)
        else:
            recalculate_standings(tournament, match.phase)

        if match.phase == Match.PHASE_PLAYOFF:
            _advance_playoff_to_knockout(tournament, match)
        elif match.phase not in (Match.PHASE_ROUND_ROBIN, Match.PHASE_GROUP, Match.PHASE_FINAL_RANKING):
            _advance_knockout_bracket(tournament, match)

    elif action == 'update_score':
        match.score1 = max(0, int(data.get('score1', match.score1)))
        match.score2 = max(0, int(data.get('score2', match.score2)))
        if match.status == Match.STATUS_SCHEDULED:
            match.status = Match.STATUS_IN_PROGRESS
            if not match.started_at:
                match.started_at = timezone.now()
        match.save()

    elif action == 'set_bonus':
        team = str(data.get('team', ''))
        checked = data.get('checked', False) in [True, 'true', '1', 1]
        if team == '1':
            match.bonus_team1 = checked
        elif team == '2':
            match.bonus_team2 = checked
        match.save()

    elif action == 'reopen':
        _undo_knockout_bracket(tournament, match)
        match.status = Match.STATUS_IN_PROGRESS
        match.finished_at = None
        match.save()

    elif action == 'reset':
        match.score1 = 0
        match.score2 = 0
        match.bonus_team1 = False
        match.bonus_team2 = False
        match.status = Match.STATUS_SCHEDULED
        match.started_at = None
        match.finished_at = None
        match.save()

    elif action == 'set_table':
        table_id = data.get('table_id')
        if table_id:
            match.table = get_object_or_404(Table, id=table_id, tournament=tournament)
        else:
            match.table = None
        match.save()

    elif action == 'toggle_hidden':
        match.hidden = not match.hidden
        match.save()

    if request.content_type == 'application/json':
        return JsonResponse({
            'success': True,
            'status': match.status,
            'score1': match.score1,
            'score2': match.score2,
            'hidden': match.hidden,
            'table_id': match.table_id,
            'table_name': match.table.name if match.table else None,
        })

    return redirect(request.META.get('HTTP_REFERER', 'live_scoring'), slug=slug)


# ==================== Display Group management ====================

@login_required
@require_POST
def display_group_create(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    max_order = tournament.display_groups.order_by('-order').values_list('order', flat=True).first()
    new_order = (max_order or 0) + 1
    group = DisplayGroup.objects.create(
        tournament=tournament,
        name=f'Ronde {new_order}',
        order=new_order,
        is_active=False,
    )
    return JsonResponse({'success': True, 'id': group.id, 'name': group.name, 'order': group.order})


@login_required
@require_POST
def display_group_delete(request, slug, group_id):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    group = get_object_or_404(DisplayGroup, id=group_id, tournament=tournament)
    if group.matches.exists():
        return JsonResponse({'success': False, 'error': 'Groep is niet leeg'}, status=400)
    group.delete()
    return JsonResponse({'success': True})


@login_required
@require_POST
def display_group_set_active(request, slug, group_id):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    group = get_object_or_404(DisplayGroup, id=group_id, tournament=tournament)
    # Deactivate all, then activate this one
    tournament.display_groups.update(is_active=False)
    group.is_active = True
    group.save()
    return JsonResponse({'success': True, 'active_id': group.id})


@login_required
@require_POST
def display_group_move_match(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    match_id = data.get('match_id')
    match = get_object_or_404(Match, id=match_id, tournament=tournament)

    fields = []

    # Only update group if 'group_id' key is explicitly present in the payload
    if 'group_id' in data:
        group_id = data['group_id']
        if group_id:
            group = get_object_or_404(DisplayGroup, id=group_id, tournament=tournament)
            # Enforce max capacity = number of tables
            table_count = tournament.tables.count()
            current_in_group = group.matches.exclude(id=match.id).count()
            if current_in_group >= table_count:
                return JsonResponse({'error': 'Groep is vol (max = aantal tafels)'}, status=400)
            match.display_group = group
        else:
            match.display_group = None
        match.display_group_order = data.get('order', 0) or 0
        fields += ['display_group', 'display_group_order']

    # Only update table if 'table_id' key is explicitly present
    if 'table_id' in data:
        table_id = data['table_id']
        if table_id:
            match.table = get_object_or_404(Table, id=table_id, tournament=tournament)
        else:
            match.table = None
        fields.append('table')

    if fields:
        match.save(update_fields=fields)
    return JsonResponse({'success': True})


@login_required
@require_POST
def display_group_reorder(request, slug):
    """Receive ordered list of group IDs and update their `order` field."""
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    group_ids = data.get('group_ids', [])
    groups = {g.id: g for g in tournament.display_groups.all()}
    to_update = []
    for idx, gid in enumerate(group_ids):
        g = groups.get(int(gid))
        if g:
            g.order = idx
            to_update.append(g)
    DisplayGroup.objects.bulk_update(to_update, ['order'])
    return JsonResponse({'success': True})


def _undo_knockout_bracket(tournament, match):
    """Clear downstream bracket slots that were filled when this match was finished."""
    old_winner = match.get_winner()
    old_loser = match.get_loser()

    phase_order = [Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL, Match.PHASE_FINAL]
    if match.phase not in phase_order:
        return

    current_idx = phase_order.index(match.phase)
    if current_idx < len(phase_order) - 1:
        next_phase = phase_order[current_idx + 1]
        next_slot = (match.bracket_slot + 1) // 2
        next_match = tournament.matches.filter(phase=next_phase, bracket_slot=next_slot).first()
        if next_match and old_winner:
            if match.bracket_slot % 2 == 1 and next_match.team1 == old_winner:
                next_match.team1 = None
            elif match.bracket_slot % 2 == 0 and next_match.team2 == old_winner:
                next_match.team2 = None
            next_match.save()

    if old_loser and match.phase == Match.PHASE_SEMIFINAL:
        third = tournament.matches.filter(phase=Match.PHASE_THIRD_PLACE, bracket_slot=1).first()
        if third:
            if third.team1 == old_loser:
                third.team1 = None
            elif third.team2 == old_loser:
                third.team2 = None
            third.save()


def _advance_knockout_bracket(tournament, finished_match):
    winner = finished_match.get_winner()
    if not winner:
        return

    phase_order = [Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL, Match.PHASE_FINAL]
    if finished_match.phase not in phase_order:
        return

    current_idx = phase_order.index(finished_match.phase)
    if current_idx >= len(phase_order) - 1:
        if finished_match.phase == Match.PHASE_FINAL:
            tournament.status = Tournament.STATUS_FINISHED
            tournament.save()
        return

    next_phase = phase_order[current_idx + 1]
    next_slot = (finished_match.bracket_slot + 1) // 2

    next_match = tournament.matches.filter(phase=next_phase, bracket_slot=next_slot).first()
    if next_match:
        if finished_match.bracket_slot % 2 == 1:
            next_match.team1 = winner
        else:
            next_match.team2 = winner
        if next_match.team1 and next_match.team2:
            tables = list(tournament.tables.all())
            if tables and not next_match.table:
                next_match.table = tables[0]
        next_match.save()

    # Also fill 3rd place match with losers of semi-finals
    loser = finished_match.get_loser()
    if loser and finished_match.phase == Match.PHASE_SEMIFINAL:
        third_match = tournament.matches.filter(phase=Match.PHASE_THIRD_PLACE, bracket_slot=1).first()
        if third_match:
            if not third_match.team1:
                third_match.team1 = loser
            elif not third_match.team2:
                third_match.team2 = loser
            # Assign a table when both teams are known
            if third_match.team1 and third_match.team2 and not third_match.table:
                tables = list(tournament.tables.all())
                if tables:
                    # Use last table to avoid collision with final if possible
                    third_match.table = tables[-1] if len(tables) > 1 else tables[0]
            third_match.save()


@login_required
@require_POST
def start_round(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    round_number = int(request.POST.get('round_number', 1))
    now = timezone.now()

    matches_to_start = list(tournament.matches.filter(
        round_number=round_number,
        status=Match.STATUS_SCHEDULED,
        team1__isnull=False,
        team2__isnull=False,
    ))
    for m in matches_to_start:
        m.status = Match.STATUS_IN_PROGRESS
        m.started_at = now
    if matches_to_start:
        Match.objects.bulk_update(matches_to_start, ['status', 'started_at'])

    tournament.round_is_active = True
    tournament.round_elapsed_seconds = 0
    tournament.round_started_at = now
    tournament.save()

    return JsonResponse({
        'success': True,
        'remaining_seconds': tournament.get_round_remaining_seconds(),
        'started_count': len(matches_to_start),
    })


@login_required
@require_POST
def set_table_phase(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    tournament.active_table_filter = request.POST.get('phase_filter', '')
    tournament.save()
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'success': True, 'filter': tournament.active_table_filter})
    return redirect('live_scoring', slug=slug)


@login_required
@require_POST
def timer_control(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)
    action = request.POST.get('action')

    from datetime import timedelta
    if action == 'resume':
        # Resume from paused state — adjust start time so remaining is preserved
        tournament.round_is_active = True
        tournament.round_started_at = timezone.now() - timedelta(seconds=tournament.round_elapsed_seconds)
    elif action == 'stop':
        # Pause: store elapsed time
        if tournament.round_is_active and tournament.round_started_at:
            elapsed = (timezone.now() - tournament.round_started_at).total_seconds()
            tournament.round_elapsed_seconds = min(int(elapsed), tournament.round_duration_minutes * 60)
        tournament.round_is_active = False
    elif action == 'reset':
        tournament.round_is_active = False
        tournament.round_started_at = None
        tournament.round_elapsed_seconds = 0

    tournament.save()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'is_active': tournament.round_is_active,
            'remaining_seconds': tournament.get_round_remaining_seconds(),
        })
    return redirect('live_scoring', slug=slug)


# ==================== Public ====================

def _check_public_auth(request, tournament):
    """Return a redirect if the tournament is password-protected and session is not authenticated."""
    if not tournament.public_password:
        return None
    session_key = f'public_auth_{tournament.slug}'
    if request.session.get(session_key) == tournament.public_password:
        return None
    next_path = request.get_full_path()
    return redirect(f'/p/{tournament.slug}/toegang/?next={next_path}')


def public_access(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)
    if not tournament.public_password:
        return redirect('public_home', slug=slug)
    error = None
    if request.method == 'POST':
        password = request.POST.get('password', '')
        if password == tournament.public_password:
            request.session[f'public_auth_{tournament.slug}'] = tournament.public_password
            next_url = request.GET.get('next') or f'/p/{slug}/'
            return redirect(next_url)
        error = 'Ongeldig wachtwoord — probeer opnieuw.'
    return render(request, 'tournament/public/access.html', {
        'tournament': tournament,
        'error': error,
    })


def public_home(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)
    auth = _check_public_auth(request, tournament)
    if auth:
        return auth
    return render(request, 'tournament/public/home.html', {'tournament': tournament})


def public_scoreboard(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)
    auth = _check_public_auth(request, tournament)
    if auth:
        return auth
    return render(request, 'tournament/public/scoreboard.html', {'tournament': tournament})


def public_standings(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)
    auth = _check_public_auth(request, tournament)
    if auth:
        return auth
    standings = _standings_annotate_order(Standing.objects.filter(
        tournament=tournament, phase='round_robin'
    ).select_related('team'))
    return render(request, 'tournament/public/standings.html', {
        'tournament': tournament,
        'standings': standings,
    })


def public_tables(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)
    auth = _check_public_auth(request, tournament)
    if auth:
        return auth
    return render(request, 'tournament/public/tables.html', {'tournament': tournament})


def _generate_auto_rules(tournament):
    """Generate rules as HTML based on tournament settings (used as WYSIWYG pre-fill)."""
    t = tournament
    fmt_labels = {
        Tournament.FORMAT_ROUND_ROBIN: 'Competitiefase (iedereen speelt)',
        Tournament.FORMAT_KNOCKOUT: 'Knock-out',
        Tournament.FORMAT_COMBINED: 'Competitiefase → Knock-out',
        Tournament.FORMAT_GROUPS: 'Pouleronde → Knock-out',
    }
    p = []

    p.append('<h2>Toernooiregels</h2>')

    p.append('<h3>Algemeen</h3><ul>')
    p.append(f'<li><strong>Formaat:</strong> {fmt_labels.get(t.format, t.get_format_display())}</li>')
    p.append(f'<li><strong>Bekers per ploeg:</strong> {t.cup_count}</li>')
    if t.format in [Tournament.FORMAT_ROUND_ROBIN, Tournament.FORMAT_COMBINED]:
        p.append(f'<li><strong>Wedstrijden per ploeg:</strong> {t.games_per_team}</li>')
    if t.format == Tournament.FORMAT_GROUPS:
        p.append(f'<li><strong>Aantal poules:</strong> {t.groups_count}</li>')
        p.append(f'<li><strong>Teams naar knock-out (totaal):</strong> {t.knockout_advancement}</li>')
        if t.playoff_enabled and t.playoff_count:
            p.append(f'<li><strong>Teams naar play-offs (totaal):</strong> {t.playoff_count}</li>')
        p.append('<li>Doorstoot via rangschikking over alle poules (beste eersten, dan beste tweedes, ...)</li>')
    if t.format == Tournament.FORMAT_COMBINED:
        p.append(f'<li><strong>Doorstoot naar knock-out:</strong> top {t.knockout_advancement}</li>')
        if t.playoff_enabled:
            po_end = t.knockout_advancement + t.playoff_count
            p.append(f'<li><strong>Play-offs:</strong> plaatsen {t.knockout_advancement + 1}–{po_end}</li>')
        if t.final_ranking_enabled:
            p.append('<li>Finale ranking voor de overige ploegen</li>')
    p.append('</ul>')

    p.append('<h3>Puntentelling</h3><ul>')
    p.append(f'<li><strong>Winst:</strong> {t.points_win} punt{"en" if t.points_win != 1 else ""}</li>')
    p.append(f'<li><strong>Gelijk:</strong> {t.points_draw} punt{"en" if t.points_draw != 1 else ""}</li>')
    p.append(f'<li><strong>Verlies:</strong> {t.points_loss} punten</li>')
    if t.points_bonus_all_cups:
        p.append(f'<li><strong>Bonus</strong> (alle {t.cup_count} bekers omgegooid): +{t.points_bonus_all_cups} punt</li>')
    p.append('</ul>')

    p.append('<h3>Gelijkstand</h3><ol>')
    p.append('<li>Punten</li>')
    p.append('<li>Bekerverschil (bekers gescoord − bekers tegen)</li>')
    p.append('<li>Meeste bekers gescoord</li>')
    p.append('<li>Minste bekers tegen</li>')
    p.append('</ol>')

    return ''.join(p)


def public_rules(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)
    auth = _check_public_auth(request, tournament)
    if auth:
        return auth
    content = tournament.custom_rules or _generate_auto_rules(tournament)
    return render(request, 'tournament/public/rules.html', {
        'tournament': tournament,
        'content': content,
    })


def public_timer(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)
    auth = _check_public_auth(request, tournament)
    if auth:
        return auth
    return render(request, 'tournament/public/timer.html', {'tournament': tournament})


# ==================== API ====================

@login_required
def ranking_preview(request, slug):
    """Return current ranking with KO/PO/FR slot assignments for the confirmation modal."""
    tournament = get_object_or_404(Tournament, slug=slug, organizer=request.user)

    if tournament.format == Tournament.FORMAT_GROUPS:
        ko_teams, po_teams, fr_teams = _get_teams_from_groups(tournament)
    else:
        all_ranked = _get_ranked_teams(tournament)
        n = tournament.knockout_advancement
        ko_teams = all_ranked[:n]
        remaining = all_ranked[n:]
        if tournament.playoff_enabled and tournament.playoff_count > 0:
            po_teams = remaining[:tournament.playoff_count]
            fr_teams = remaining[tournament.playoff_count:] if tournament.final_ranking_enabled else []
        else:
            po_teams = []
            fr_teams = remaining if tournament.final_ranking_enabled else []

    ko_set = {t.id for t in ko_teams}
    po_set = {t.id for t in po_teams}

    # Build standings lookup
    if tournament.format == Tournament.FORMAT_GROUPS:
        phase = 'group'
    else:
        phase = 'round_robin'
    standings_qs = _standings_annotate_order(Standing.objects.filter(
        tournament=tournament, phase=phase,
    ).select_related('team'))
    standings_map = {s.team_id: s for s in standings_qs}

    all_teams = ko_teams + po_teams + fr_teams
    result = []
    for i, team in enumerate(all_teams):
        s = standings_map.get(team.id)
        if team.id in ko_set:
            slot = 'KO'
        elif team.id in po_set:
            slot = 'PO'
        else:
            slot = 'FR'
        result.append({
            'rank': i + 1,
            'id': team.id,
            'name': team.name,
            'wins': s.wins if s else 0,
            'draws': s.draws if s else 0,
            'losses': s.losses if s else 0,
            'points': s.points if s else 0,
            'cups_scored': s.cups_scored if s else 0,
            'cups_conceded': s.cups_conceded if s else 0,
            'cup_diff': (s.cups_scored - s.cups_conceded) if s else 0,
            'slot': slot,
        })

    # Unfinished warning count
    if tournament.format == Tournament.FORMAT_GROUPS:
        rr_unfinished = tournament.matches.filter(
            phase=Match.PHASE_GROUP,
            status__in=[Match.STATUS_SCHEDULED, Match.STATUS_IN_PROGRESS],
        ).count()
    else:
        rr_unfinished = tournament.matches.filter(
            phase=Match.PHASE_ROUND_ROBIN,
            status__in=[Match.STATUS_SCHEDULED, Match.STATUS_IN_PROGRESS],
        ).count()

    return JsonResponse({
        'teams': result,
        'ko_count': len(ko_teams),
        'po_count': len(po_teams),
        'fr_count': len(fr_teams),
        'rr_unfinished': rr_unfinished,
    })


def api_scores(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)

    matches = tournament.matches.filter(
        status__in=[Match.STATUS_IN_PROGRESS, Match.STATUS_FINISHED],
        hidden=False,
    ).select_related('team1', 'team2', 'table', 'group').order_by('-round_number', 'id')[:30]

    upcoming = tournament.matches.filter(
        status=Match.STATUS_SCHEDULED,
        hidden=False,
    ).select_related('team1', 'team2', 'table', 'group').order_by('round_number', 'id')[:10]

    def match_dict(m):
        return {
            'id': m.id,
            'team1': m.team1.name if m.team1 else 'TBD',
            'team2': m.team2.name if m.team2 else 'TBD',
            'score1': m.score1,
            'score2': m.score2,
            'status': m.status,
            'phase': _match_phase_label(m, tournament),
            'table': m.table.name if m.table else '',
            'round': m.round_number,
            'bonus_team1': m.bonus_team1,
            'bonus_team2': m.bonus_team2,
        }

    return JsonResponse({
        'matches': [match_dict(m) for m in matches],
        'upcoming': [match_dict(m) for m in upcoming],
    })


def api_standings(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)

    # Groups format: return per-group standings with exact advancement per team
    groups_data = []
    if tournament.format == Tournament.FORMAT_GROUPS:
        # Compute the real KO/PO/FR sets using cross-group tiebreaker logic
        ko_teams, po_teams, fr_teams = _get_teams_from_groups(tournament)
        ko_ids = {t.id for t in ko_teams}
        po_ids = {t.id for t in po_teams}
        fr_ids = {t.id for t in fr_teams}

        for group in tournament.groups.all().order_by('number'):
            grp_standings = _standings_annotate_order(Standing.objects.filter(
                tournament=tournament, phase='group', group=group,
            ).select_related('team'))
            groups_data.append({
                'name': group.name,
                'number': group.number,
                'ko_count': 0,       # no longer used for coloring; kept for compat
                'playoff_count': 0,
                'standings': [{
                    'rank': i + 1,
                    'team': s.team.name,
                    'played': s.played,
                    'wins': s.wins,
                    'draws': s.draws,
                    'losses': s.losses,
                    'points': s.points,
                    'cups_scored': s.cups_scored,
                    'cups_conceded': s.cups_conceded,
                    'cup_diff': s.cups_scored - s.cups_conceded,
                    'advancement': ('ko' if s.team.id in ko_ids
                                    else 'po' if s.team.id in po_ids
                                    else 'fr' if s.team.id in fr_ids
                                    else None),
                } for i, s in enumerate(grp_standings)],
            })

    standings = _standings_annotate_order(Standing.objects.filter(
        tournament=tournament, phase='round_robin'
    ).select_related('team'))

    n_ko = tournament.knockout_advancement if tournament.format == Tournament.FORMAT_COMBINED else 0
    n_po = (tournament.playoff_count if tournament.playoff_enabled else 0) if tournament.format == Tournament.FORMAT_COMBINED else 0
    standings_data = [{
        'rank': i + 1,
        'team': s.team.name,
        'played': s.played,
        'wins': s.wins,
        'draws': s.draws,
        'losses': s.losses,
        'points': s.points,
        'cups_scored': s.cups_scored,
        'cups_conceded': s.cups_conceded,
        'cup_diff': s.cups_scored - s.cups_conceded,
        'advancement': ('ko' if n_ko and (i + 1) <= n_ko
                        else 'po' if n_po and (i + 1) <= n_ko + n_po
                        else None),
    } for i, s in enumerate(standings)]

    # Knockout bracket data (excludes playoff and final_ranking)
    ko_matches = tournament.matches.filter(
        phase__in=[
            Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL,
            Match.PHASE_THIRD_PLACE, Match.PHASE_FINAL,
        ]
    ).select_related('team1', 'team2', 'table').order_by('bracket_slot')

    bracket = {}
    for m in ko_matches:
        bracket.setdefault(m.phase, []).append({
            'slot': m.bracket_slot,
            'team1': m.team1.name if m.team1 else None,
            'team2': m.team2.name if m.team2 else None,
            'score1': m.score1,
            'score2': m.score2,
            'status': m.status,
            'table': m.table.name if m.table else None,
        })

    # Playoff matches
    po_matches = tournament.matches.filter(
        phase=Match.PHASE_PLAYOFF
    ).select_related('team1', 'team2', 'table').order_by('bracket_slot')
    playoff_data = [{
        'slot': m.bracket_slot,
        'team1': m.team1.name if m.team1 else None,
        'team2': m.team2.name if m.team2 else None,
        'score1': m.score1,
        'score2': m.score2,
        'status': m.status,
        'table': m.table.name if m.table else None,
    } for m in po_matches]

    # Final ranking matches
    fr_matches = tournament.matches.filter(
        phase=Match.PHASE_FINAL_RANKING
    ).select_related('team1', 'team2').order_by('bracket_slot')
    final_ranking_data = [{
        'slot': m.bracket_slot,
        'team1': m.team1.name if m.team1 else None,
        'team2': m.team2.name if m.team2 else None,
        'score1': m.score1,
        'score2': m.score2,
        'status': m.status,
    } for m in fr_matches]

    # Starting rank for FR (teams ranked above FR are in KO/PO)
    if tournament.format == Tournament.FORMAT_ROUND_ROBIN:
        base_ko = 0
    elif tournament.format == Tournament.FORMAT_GROUPS:
        base_ko = tournament.knockout_advancement
    else:  # combined, knockout
        base_ko = tournament.knockout_advancement

    if tournament.playoff_enabled:
        # Check if consolation matches (PO losers) have been added to FR section
        po_finished = list(tournament.matches.filter(
            phase=Match.PHASE_PLAYOFF, status=Match.STATUS_FINISHED
        ).select_related('team1', 'team2'))
        po_loser_ids = {m.get_loser().id for m in po_finished if m.get_loser()}

        if po_loser_ids and tournament.final_ranking_enabled and tournament.matches.filter(
            phase=Match.PHASE_FINAL_RANKING
        ).filter(
            Q(team1_id__in=po_loser_ids) | Q(team2_id__in=po_loser_ids)
        ).exists():
            # Consolation matches exist: fr_start_rank = base_ko + num PO winners
            fr_start_rank = base_ko + len(po_loser_ids)
        else:
            fr_start_rank = base_ko + tournament.playoff_count
    else:
        fr_start_rank = base_ko

    return JsonResponse({
        'standings': standings_data,
        'groups': groups_data,
        'has_groups': bool(groups_data),
        'bracket': bracket,
        'has_bracket': bool(bracket),
        'playoff': playoff_data,
        'has_playoff': bool(playoff_data),
        'final_ranking': final_ranking_data,
        'has_final_ranking': bool(final_ranking_data),
        'fr_start_rank': fr_start_rank,
    })


def api_timer(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)

    def file_url(field):
        if field and hasattr(field, 'url'):
            try:
                return field.url
            except ValueError:
                return None
        return None

    return JsonResponse({
        'is_active': tournament.round_is_active,
        'remaining_seconds': tournament.get_round_remaining_seconds(),
        'duration_minutes': tournament.round_duration_minutes,
        'duration_seconds': tournament.round_duration_minutes * 60,
        'sound_enabled': tournament.sound_enabled,
        'sound_start_url': file_url(tournament.sound_start),
        'sound_end_url': file_url(tournament.sound_end),
        'sound_warning_url': file_url(tournament.sound_warning),
    })


def _table_match_queryset(table, tournament):
    """Return queryset for matches on this table filtered by active_table_filter.
    All statuses are included; ordering puts in_progress first, then scheduled, then finished."""
    from django.db.models import Case, When, IntegerField as DjIntField

    pf = tournament.active_table_filter
    base = table.matches.filter(
        tournament=tournament,
        hidden=False,
    ).select_related('team1', 'team2', 'team1__drink', 'team2__drink').annotate(
        _sp=Case(
            When(status=Match.STATUS_IN_PROGRESS, then=0),
            When(status=Match.STATUS_SCHEDULED,   then=1),
            default=2,  # finished last
            output_field=DjIntField(),
        )
    )

    if not pf:
        # Auto: exclude finished unless nothing else, pick nearest round
        active = base.filter(
            status__in=[Match.STATUS_IN_PROGRESS, Match.STATUS_SCHEDULED]
        ).order_by('_sp', 'round_number').first()
        if active:
            return base.filter(id=active.id)
        # Fallback: most recently finished
        return base.filter(status=Match.STATUS_FINISHED).order_by('-id')

    if pf.startswith('rr_'):
        try:
            rn = int(pf[3:])
        except ValueError:
            rn = 1
        return base.filter(
            phase__in=[Match.PHASE_ROUND_ROBIN, Match.PHASE_GROUP],
            round_number=rn,
        ).order_by('_sp', 'id')

    if pf == 'knockout':
        return base.filter(phase__in=[
            Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL,
            Match.PHASE_THIRD_PLACE, Match.PHASE_FINAL,
        ]).order_by('_sp', 'bracket_slot')

    if pf == 'playoff':
        return base.filter(phase=Match.PHASE_PLAYOFF).order_by('_sp', 'bracket_slot')

    if pf == 'final_ranking':
        return base.filter(phase=Match.PHASE_FINAL_RANKING).order_by('_sp', 'bracket_slot')

    if pf == 'all_post':
        return base.filter(phase__in=[
            Match.PHASE_PLAYOFF, Match.PHASE_FINAL_RANKING,
            Match.PHASE_QUARTERFINAL, Match.PHASE_SEMIFINAL,
            Match.PHASE_THIRD_PLACE, Match.PHASE_FINAL,
        ]).order_by('_sp', 'round_number', 'bracket_slot')

    return base.order_by('_sp', 'round_number')


def _match_phase_label(match, tournament):
    """Human-readable phase label for a match, shown on the public tables page."""
    p = match.phase
    if p == Match.PHASE_GROUP:
        return match.group.name if match.group else 'Poule'
    if p == Match.PHASE_ROUND_ROBIN:
        return f'Ronde {match.round_number}'
    if p == Match.PHASE_QUARTERFINAL:
        return 'Kwartfinale'
    if p == Match.PHASE_SEMIFINAL:
        return 'Halve finale'
    if p == Match.PHASE_FINAL:
        return 'Finale'
    if p == Match.PHASE_THIRD_PLACE:
        return '3e/4e plaats'
    if p == Match.PHASE_PLAYOFF:
        return 'Play-off'
    if p == Match.PHASE_FINAL_RANKING:
        # Determine starting rank for FR teams
        if tournament.format == Tournament.FORMAT_COMBINED:
            start = tournament.knockout_advancement
            if tournament.playoff_enabled:
                start += tournament.playoff_count
        else:
            start = 0
        slot = (match.bracket_slot or 1) - 1  # 0-indexed
        r1 = start + slot * 2 + 1
        r2 = r1 + 1
        # Ordinal suffix in Dutch
        def ord_nl(n):
            return f'{n}de' if n != 1 else '1ste'
        return f'{ord_nl(r1)}/{ord_nl(r2)} plek'
    return match.get_phase_display()


def api_tables(request, slug):
    tournament = get_object_or_404(Tournament, slug=slug)
    tables = list(tournament.tables.all())

    # Display group is only used when the table filter is set to a KO/PO/FR value.
    # Round-robin filters and Auto override it.
    _ko_filters = {'all_post', 'knockout', 'playoff', 'final_ranking'}
    pf = tournament.active_table_filter
    active_group = None
    if pf in _ko_filters:
        active_group = tournament.display_groups.filter(is_active=True).first()

    def drink_info(team):
        if not team:
            return {'name': None, 'photo': None}
        d = team.drink
        if not d:
            return {'name': None, 'photo': None}
        photo = None
        if d.photo:
            try:
                photo = d.photo.url
            except ValueError:
                pass
        return {'name': d.name, 'photo': photo}

    if active_group:
        # Build a table_id → match lookup for the active group
        group_matches = list(
            active_group.matches.filter(table__isnull=False)
            .select_related('team1', 'team2', 'table', 'team1__drink', 'team2__drink', 'group')
        )
        table_to_match = {m.table_id: m for m in group_matches}

        data = []
        for table in tables:
            current = table_to_match.get(table.id)
            data.append({
                'id': table.id,
                'number': table.number,
                'name': table.name,
                'orientation': table.orientation,
                'match': {
                    'id': current.id,
                    'team1': current.team1.name if current.team1 else 'TBD',
                    'team2': current.team2.name if current.team2 else 'TBD',
                    'team1_drink': drink_info(current.team1),
                    'team2_drink': drink_info(current.team2),
                    'score1': current.score1,
                    'score2': current.score2,
                    'status': current.status,
                    'phase': current.get_phase_display(),
                    'phase_label': _match_phase_label(current, tournament),
                } if current else None,
            })
    else:
        data = []
        for table in tables:
            current = _table_match_queryset(table, tournament).first()
            data.append({
                'id': table.id,
                'number': table.number,
                'name': table.name,
                'orientation': table.orientation,
                'match': {
                    'id': current.id,
                    'team1': current.team1.name if current.team1 else 'TBD',
                    'team2': current.team2.name if current.team2 else 'TBD',
                    'team1_drink': drink_info(current.team1),
                    'team2_drink': drink_info(current.team2),
                    'score1': current.score1,
                    'score2': current.score2,
                    'status': current.status,
                    'phase': current.get_phase_display(),
                    'phase_label': _match_phase_label(current, tournament),
                } if current else None,
            })

    return JsonResponse({
        'tables': data,
        'orientation': tournament.table_orientation,
        'cols': tournament.table_display_cols,
        'active_filter': tournament.active_table_filter,
        'show_drinks': tournament.show_drinks_on_tables,
    })
