from django.urls import path
from . import views

urlpatterns = [
    # Home
    path('', views.home, name='home'),
    path('nieuw/', views.tournament_create, name='tournament_create'),

    # Platform-wide drinks management
    path('dranken/', views.drinks_manage, name='drinks_manage'),

    # Organizer
    path('t/<slug:slug>/', views.tournament_dashboard, name='tournament_dashboard'),
    path('t/<slug:slug>/instellingen/', views.tournament_settings, name='tournament_settings'),
    path('t/<slug:slug>/verwijder/', views.tournament_delete, name='tournament_delete'),
    path('t/<slug:slug>/ploegen/', views.teams_manage, name='teams_manage'),
    path('t/<slug:slug>/tafels/', views.tables_manage, name='tables_manage'),
    path('t/<slug:slug>/schema/', views.schedule_view, name='schedule_view'),
    path('t/<slug:slug>/live/', views.live_scoring, name='live_scoring'),
    path('t/<slug:slug>/match/<int:match_id>/update/', views.match_update, name='match_update'),
    path('t/<slug:slug>/start-ronde/', views.start_round, name='start_round'),
    path('t/<slug:slug>/timer/', views.timer_control, name='timer_control'),
    path('t/<slug:slug>/tafel-fase/', views.set_table_phase, name='set_table_phase'),
    path('t/<slug:slug>/display-groep/nieuw/', views.display_group_create, name='display_group_create'),
    path('t/<slug:slug>/display-groep/<int:group_id>/verwijder/', views.display_group_delete, name='display_group_delete'),
    path('t/<slug:slug>/display-groep/<int:group_id>/actief/', views.display_group_set_active, name='display_group_set_active'),
    path('t/<slug:slug>/display-groep/verplaats/', views.display_group_move_match, name='display_group_move_match'),
    path('t/<slug:slug>/display-groep/volgorde/', views.display_group_reorder, name='display_group_reorder'),
    path('t/<slug:slug>/schema/ranking-modal/', views.ranking_preview, name='ranking_preview'),

    # Public display pages
    path('p/<slug:slug>/', views.public_home, name='public_home'),
    path('p/<slug:slug>/scorebord/', views.public_scoreboard, name='public_scoreboard'),
    path('p/<slug:slug>/stand/', views.public_standings, name='public_standings'),
    path('p/<slug:slug>/tafels/', views.public_tables, name='public_tables'),
    path('p/<slug:slug>/timer/', views.public_timer, name='public_timer'),
    path('p/<slug:slug>/afspraken/', views.public_rules, name='public_rules'),

    # API
    path('api/<slug:slug>/scores/', views.api_scores, name='api_scores'),
    path('api/<slug:slug>/standings/', views.api_standings, name='api_standings'),
    path('api/<slug:slug>/timer/', views.api_timer, name='api_timer'),
    path('api/<slug:slug>/tables/', views.api_tables, name='api_tables'),
]
