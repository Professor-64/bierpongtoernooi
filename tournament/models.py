from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Drink(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name='Naam')
    photo = models.ImageField(upload_to='drinks/', null=True, blank=True, verbose_name='Foto')
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='drinks', verbose_name='Aangemaakt door'
    )

    class Meta:
        ordering = ['name']
        verbose_name = 'Drank'
        verbose_name_plural = 'Dranken'

    def __str__(self):
        return self.name


class Tournament(models.Model):
    FORMAT_ROUND_ROBIN = 'round_robin'
    FORMAT_KNOCKOUT = 'knockout'
    FORMAT_COMBINED = 'combined'
    FORMAT_GROUPS = 'groups'
    FORMAT_CHOICES = [
        (FORMAT_ROUND_ROBIN, 'Competitiefase (iedereen speelt X keer)'),
        (FORMAT_KNOCKOUT, 'Knock-out (kwart/semi/finale)'),
        (FORMAT_COMBINED, 'Combinatie (competitiefase → knock-out)'),
        (FORMAT_GROUPS, 'Poules (poulecompetitie → knock-out)'),
    ]

    STATUS_SETUP = 'setup'
    STATUS_ROUND_ROBIN = 'round_robin'
    STATUS_KNOCKOUT = 'knockout'
    STATUS_FINISHED = 'finished'
    STATUS_CHOICES = [
        (STATUS_SETUP, 'Opzet'),
        (STATUS_ROUND_ROBIN, 'Competitiefase'),
        (STATUS_KNOCKOUT, 'Knock-out'),
        (STATUS_FINISHED, 'Afgelopen'),
    ]

    organizer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tournaments')
    name = models.CharField(max_length=200, verbose_name='Naam')
    slug = models.SlugField(unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_SETUP)
    format = models.CharField(max_length=20, choices=FORMAT_CHOICES, default=FORMAT_ROUND_ROBIN, verbose_name='Formaat')

    cup_count = models.PositiveIntegerField(default=10, verbose_name='Aantal bekers')
    games_per_team = models.PositiveIntegerField(default=3, verbose_name='Wedstrijden per ploeg')
    knockout_advancement = models.PositiveIntegerField(default=8, verbose_name='Ploegen naar knock-out')

    points_win = models.PositiveIntegerField(default=3, verbose_name='Punten voor winst')
    points_draw = models.PositiveIntegerField(default=1, verbose_name='Punten voor gelijk')
    points_loss = models.PositiveIntegerField(default=0, verbose_name='Punten voor verlies')
    points_bonus_all_cups = models.PositiveIntegerField(default=1, verbose_name='Bonuspunten (alle bekers omgegooid)')

    round_duration_minutes = models.PositiveIntegerField(default=15, verbose_name='Rondetijd (minuten)')
    round_started_at = models.DateTimeField(null=True, blank=True)
    round_is_active = models.BooleanField(default=False)
    round_elapsed_seconds = models.IntegerField(default=0)
    show_timer_in_live = models.BooleanField(default=True, verbose_name='Timer tonen in live scherm')

    table_display_cols = models.PositiveIntegerField(default=4, verbose_name='Kolommen (tafels weergave)')
    show_drinks_on_tables = models.BooleanField(default=True, verbose_name='Dranken tonen in tafelsweergave')
    table_orientation = models.CharField(
        max_length=20,
        choices=[('horizontal', 'Horizontaal (ploegen links/rechts)'), ('vertical', 'Verticaal (ploegen boven/onder)')],
        default='horizontal',
        verbose_name='Tafels orientatie',
    )

    schedule_efficient = models.BooleanField(
        default=False,
        verbose_name='Efficiënt speelschema',
        help_text='Vult lege tafels op met wedstrijden van de volgende ronde zodat alle tafels maximaal bezet zijn.'
    )

    active_table_filter = models.CharField(
        max_length=30, blank=True, default='',
        verbose_name='Actieve fase voor tafelpagina'
    )

    default_drink = models.ForeignKey(
        'Drink', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='default_for_tournaments', verbose_name='Standaarddrank'
    )

    primary_color = models.CharField(max_length=7, default='#206bc4', verbose_name='Primaire kleur')
    secondary_color = models.CharField(max_length=7, default='#4dabf7', verbose_name='Secundaire kleur')
    logo = models.ImageField(upload_to='logos/', null=True, blank=True, verbose_name='Logo')

    # Feature 2: Sounds
    sound_enabled = models.BooleanField(default=False, verbose_name='Geluiden inschakelen')
    sound_start = models.FileField(upload_to='sounds/', null=True, blank=True, verbose_name='Geluid ronde start')
    sound_end = models.FileField(upload_to='sounds/', null=True, blank=True, verbose_name='Geluid ronde einde')
    sound_warning = models.FileField(upload_to='sounds/', null=True, blank=True, verbose_name='Geluid 30s waarschuwing')

    # Feature 3: Play-offs
    playoff_enabled = models.BooleanField(default=False, verbose_name='Play-offs inschakelen')
    playoff_count = models.PositiveIntegerField(default=4, verbose_name='Ploegen in play-offs')
    final_ranking_enabled = models.BooleanField(default=False, verbose_name='Finale ranking inschakelen')

    # Groups format settings
    groups_count = models.PositiveIntegerField(default=2, verbose_name='Aantal poules')

    custom_rules = models.TextField(blank=True, default='', verbose_name='Aanvullende afspraken (aanpasbaar)')

    public_refresh_seconds = models.PositiveIntegerField(
        default=5, verbose_name='Verversingstijd publieke pagina\'s (seconden)'
    )
    public_password = models.CharField(
        max_length=100, blank=True, default='',
        verbose_name='Wachtwoord publieke pagina\'s'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Toernooi'
        verbose_name_plural = 'Toernooien'
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    def get_round_remaining_seconds(self):
        total = self.round_duration_minutes * 60
        if self.round_is_active and self.round_started_at:
            elapsed = (timezone.now() - self.round_started_at).total_seconds()
        else:
            elapsed = self.round_elapsed_seconds
        return max(0, int(total - elapsed))

    def get_public_url(self):
        return f'/p/{self.slug}/'


class Group(models.Model):
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='groups')
    name = models.CharField(max_length=50)
    number = models.PositiveIntegerField()

    class Meta:
        ordering = ['number']
        unique_together = [['tournament', 'number']]
        verbose_name = 'Poule'
        verbose_name_plural = 'Poules'

    def __str__(self):
        return self.name


class Team(models.Model):
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='teams')
    name = models.CharField(max_length=100, verbose_name='Ploegnaam')
    group = models.ForeignKey(
        'Group', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='teams', verbose_name='Poule'
    )
    drink = models.ForeignKey(
        Drink, on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Drank'
    )

    class Meta:
        ordering = ['name']
        verbose_name = 'Ploeg'
        verbose_name_plural = 'Ploegen'

    def __str__(self):
        return self.name


class Player(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='players')
    name = models.CharField(max_length=100, verbose_name='Naam')

    class Meta:
        ordering = ['name']
        verbose_name = 'Speler'
        verbose_name_plural = 'Spelers'

    def __str__(self):
        return self.name


class Table(models.Model):
    ORIENTATION_HORIZONTAL = 'horizontal'
    ORIENTATION_VERTICAL = 'vertical'
    ORIENTATION_CHOICES = [
        (ORIENTATION_HORIZONTAL, 'Horizontaal'),
        (ORIENTATION_VERTICAL, 'Verticaal'),
    ]

    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='tables')
    name = models.CharField(max_length=50, verbose_name='Naam')
    number = models.PositiveIntegerField(verbose_name='Nummer')
    orientation = models.CharField(max_length=20, choices=ORIENTATION_CHOICES, default=ORIENTATION_HORIZONTAL)

    class Meta:
        ordering = ['number']
        unique_together = ['tournament', 'number']
        verbose_name = 'Tafel'
        verbose_name_plural = 'Tafels'

    def __str__(self):
        return f"Tafel {self.number}: {self.name}"


class DisplayGroup(models.Model):
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='display_groups')
    name = models.CharField(max_length=50, default='Groep')
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=False)

    class Meta:
        ordering = ['order', 'id']
        verbose_name = 'Weergavegroep'
        verbose_name_plural = 'Weergavegroepen'

    def __str__(self):
        return f"{self.tournament.name} — {self.name}"


class Match(models.Model):
    STATUS_SCHEDULED = 'scheduled'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_FINISHED = 'finished'
    STATUS_CHOICES = [
        (STATUS_SCHEDULED, 'Gepland'),
        (STATUS_IN_PROGRESS, 'Bezig'),
        (STATUS_FINISHED, 'Afgelopen'),
    ]

    PHASE_ROUND_ROBIN = 'round_robin'
    PHASE_GROUP = 'group'
    PHASE_QUARTERFINAL = 'quarterfinal'
    PHASE_SEMIFINAL = 'semifinal'
    PHASE_THIRD_PLACE = 'third_place'
    PHASE_FINAL = 'final'
    PHASE_PLAYOFF = 'playoff'
    PHASE_FINAL_RANKING = 'final_ranking'
    PHASE_CHOICES = [
        (PHASE_ROUND_ROBIN, 'Competitiefase'),
        (PHASE_GROUP, 'Pouleronde'),
        (PHASE_QUARTERFINAL, 'Kwartfinale'),
        (PHASE_SEMIFINAL, 'Halve finale'),
        (PHASE_THIRD_PLACE, '3e/4e plaats'),
        (PHASE_FINAL, 'Finale'),
        (PHASE_PLAYOFF, 'Play-off'),
        (PHASE_FINAL_RANKING, 'Finale ranking'),
    ]

    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='matches')
    phase = models.CharField(max_length=20, choices=PHASE_CHOICES, default=PHASE_ROUND_ROBIN)
    round_number = models.PositiveIntegerField(default=1)
    table = models.ForeignKey(Table, on_delete=models.SET_NULL, null=True, blank=True, related_name='matches')
    group = models.ForeignKey(
        'Group', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='matches', verbose_name='Poule'
    )

    team1 = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='matches_as_team1', null=True, blank=True)
    team2 = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='matches_as_team2', null=True, blank=True)

    score1 = models.PositiveIntegerField(default=0)
    score2 = models.PositiveIntegerField(default=0)
    bonus_team1 = models.BooleanField(default=False)
    bonus_team2 = models.BooleanField(default=False)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_SCHEDULED)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    bracket_slot = models.PositiveIntegerField(null=True, blank=True)
    hidden = models.BooleanField(default=False, verbose_name='Verborgen in publiek scorebord')
    display_group = models.ForeignKey(
        'DisplayGroup', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='matches', verbose_name='Weergavegroep',
    )
    display_group_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['round_number', 'bracket_slot', 'id']
        verbose_name = 'Wedstrijd'
        verbose_name_plural = 'Wedstrijden'

    def __str__(self):
        t1 = self.team1.name if self.team1 else 'TBD'
        t2 = self.team2.name if self.team2 else 'TBD'
        return f"{t1} vs {t2} (Ronde {self.round_number})"

    def get_winner(self):
        if self.status != self.STATUS_FINISHED:
            return None
        if self.score1 > self.score2:
            return self.team1
        elif self.score2 > self.score1:
            return self.team2
        return None

    def get_loser(self):
        if self.status != self.STATUS_FINISHED:
            return None
        if self.score1 < self.score2:
            return self.team1
        elif self.score2 < self.score1:
            return self.team2
        return None

    def is_draw(self):
        return self.status == self.STATUS_FINISHED and self.score1 == self.score2


class Standing(models.Model):
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='standings')
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='standings')
    phase = models.CharField(max_length=20, default='round_robin')
    group = models.ForeignKey(
        'Group', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='standings', verbose_name='Poule'
    )

    played = models.PositiveIntegerField(default=0)
    wins = models.PositiveIntegerField(default=0)
    draws = models.PositiveIntegerField(default=0)
    losses = models.PositiveIntegerField(default=0)
    points = models.IntegerField(default=0)
    cups_scored = models.PositiveIntegerField(default=0)
    cups_conceded = models.PositiveIntegerField(default=0)
    bonus_points = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-points', '-cups_scored']
        unique_together = ['tournament', 'team', 'phase']
        verbose_name = 'Stand'
        verbose_name_plural = 'Standen'

    def __str__(self):
        return f"{self.team.name}: {self.points} pts"

    @property
    def cup_difference(self):
        return self.cups_scored - self.cups_conceded
