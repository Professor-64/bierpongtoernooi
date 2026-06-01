from django import forms
from .models import Tournament, Team, Table, Drink


class TournamentCreateForm(forms.ModelForm):
    class Meta:
        model = Tournament
        fields = [
            'name', 'format', 'cup_count', 'games_per_team', 'knockout_advancement',
            'points_win', 'points_draw', 'points_loss', 'points_bonus_all_cups',
            'round_duration_minutes',
        ]
        widgets = {
            'format': forms.Select(attrs={'class': 'form-select'}),
        }


class TournamentGameForm(forms.ModelForm):
    """Game-tab: naam, formaat, schema-instellingen, play-offs."""
    class Meta:
        model = Tournament
        fields = [
            'name', 'format', 'default_drink', 'cup_count',
            'games_per_team', 'knockout_advancement', 'schedule_efficient',
            'points_win', 'points_draw', 'points_loss', 'points_bonus_all_cups',
            'playoff_enabled', 'playoff_count', 'final_ranking_enabled',
            'groups_count', 'groups_ko_per_group', 'groups_playoff_per_group',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['default_drink'].queryset = Drink.objects.all()
        self.fields['default_drink'].required = False
        self.fields['default_drink'].empty_label = '— Geen standaarddrank —'
        self.fields['default_drink'].widget.attrs['class'] = 'form-select'

    def clean(self):
        cleaned = super().clean()
        fmt = cleaned.get('format')
        playoff_enabled = cleaned.get('playoff_enabled', False)
        playoff_count = cleaned.get('playoff_count', 4)
        knockout_advancement = cleaned.get('knockout_advancement', 8)

        if fmt == Tournament.FORMAT_GROUPS:
            groups_count = cleaned.get('groups_count', 2) or 2
            ko_per = cleaned.get('groups_ko_per_group', 2) or 2
            po_per = cleaned.get('groups_playoff_per_group', 0) or 0
            total_direct_ko = groups_count * ko_per
            if playoff_enabled and po_per > 0:
                po_total = groups_count * po_per
                if po_total % 2 != 0:
                    self.add_error('groups_playoff_per_group',
                        'Totaal playoff-ploegen (poules × per poule) moet even zijn.')
                total_ko = total_direct_ko + po_total // 2
            else:
                total_ko = total_direct_ko
            if total_ko not in {2, 4, 8, 16}:
                self.add_error('groups_ko_per_group',
                    f'Totaal KO-ploegen ({total_ko}) moet 2, 4, 8 of 16 zijn.')

        elif fmt == Tournament.FORMAT_COMBINED and playoff_enabled:
            if playoff_count and playoff_count % 2 != 0:
                self.add_error('playoff_count', 'Het aantal ploegen in de play-offs moet even zijn.')
            if playoff_count and knockout_advancement:
                total = knockout_advancement + playoff_count // 2
                if total > 0 and (total & (total - 1)) != 0:
                    self.add_error(
                        'playoff_count',
                        f'Totaal KO ({knockout_advancement}) + helft play-offs ({playoff_count // 2}) '
                        f'= {total} — geen macht van 2 (2, 4, 8, 16, ...).'
                    )
        return cleaned


# Backward-compat alias
TournamentSettingsForm = TournamentGameForm


class TournamentDisplayForm(forms.ModelForm):
    """Publieke weergave-tab: tafels en timer."""
    class Meta:
        model = Tournament
        fields = [
            'table_display_cols', 'show_drinks_on_tables', 'table_orientation',
            'round_duration_minutes', 'show_timer_in_live',
        ]


class TournamentThemeForm(forms.ModelForm):
    class Meta:
        model = Tournament
        fields = ['primary_color', 'secondary_color', 'logo']
        widgets = {
            'primary_color': forms.TextInput(attrs={'type': 'color', 'class': 'form-control form-control-color'}),
            'secondary_color': forms.TextInput(attrs={'type': 'color', 'class': 'form-control form-control-color'}),
        }


class TournamentSoundForm(forms.ModelForm):
    class Meta:
        model = Tournament
        fields = ['sound_enabled', 'sound_start', 'sound_end', 'sound_warning']


class TournamentRulesForm(forms.ModelForm):
    class Meta:
        model = Tournament
        fields = ['custom_rules']
        widgets = {
            'custom_rules': forms.Textarea(attrs={
                'rows': 8,
                'class': 'form-control',
                'placeholder': 'Voeg hier aanvullende afspraken toe die zichtbaar zijn op de publieke pagina…',
            }),
        }


class TeamForm(forms.ModelForm):
    players_text = forms.CharField(
        widget=forms.Textarea(attrs={'rows': 3, 'placeholder': 'Speler 1\nSpeler 2\n...'}),
        required=False,
        label='Spelers (één per lijn)',
    )

    class Meta:
        model = Team
        fields = ['name', 'drink']
        widgets = {
            'drink': forms.Select(attrs={'class': 'form-select'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['drink'].queryset = Drink.objects.all()
        self.fields['drink'].required = False
        self.fields['drink'].empty_label = '— Geen drank —'


class TableForm(forms.ModelForm):
    class Meta:
        model = Table
        fields = ['number', 'name', 'orientation']
        widgets = {
            'orientation': forms.Select(attrs={'class': 'form-select'}),
        }


class DrinkForm(forms.ModelForm):
    class Meta:
        model = Drink
        fields = ['name', 'photo']
