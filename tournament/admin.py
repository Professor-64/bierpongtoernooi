from django.contrib import admin
from django.contrib.auth.models import User
from .models import Tournament, Team, Player, Table, Match, Standing, Drink, Group


class SuperuserAdminSite(admin.AdminSite):
    def has_permission(self, request):
        return request.user.is_active and request.user.is_superuser


admin.site.__class__ = SuperuserAdminSite


class PlayerInline(admin.TabularInline):
    model = Player
    extra = 0


class TeamInline(admin.TabularInline):
    model = Team
    extra = 0


class TableInline(admin.TabularInline):
    model = Table
    extra = 0


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ['name', 'tournament', 'number']
    list_filter = ['tournament']


@admin.register(Drink)
class DrinkAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_by']
    search_fields = ['name']


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    list_display = ['name', 'organizer', 'status', 'format', 'created_at']
    list_filter = ['status', 'format']
    search_fields = ['name']
    prepopulated_fields = {'slug': ('name',)}
    inlines = [TeamInline, TableInline]


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ['name', 'tournament', 'drink']
    list_filter = ['tournament']
    inlines = [PlayerInline]


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'tournament', 'phase', 'status', 'score1', 'score2']
    list_filter = ['tournament', 'phase', 'status']


@admin.register(Standing)
class StandingAdmin(admin.ModelAdmin):
    list_display = ['team', 'tournament', 'phase', 'played', 'wins', 'draws', 'losses', 'points']
    list_filter = ['tournament', 'phase']
