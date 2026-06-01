from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tournament', '0009_tournament_schedule_efficient'),
    ]

    operations = [
        # 1. Group model
        migrations.CreateModel(
            name='Group',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=50)),
                ('number', models.PositiveIntegerField()),
                ('tournament', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='groups', to='tournament.tournament')),
            ],
            options={
                'verbose_name': 'Poule',
                'verbose_name_plural': 'Poules',
                'ordering': ['number'],
                'unique_together': {('tournament', 'number')},
            },
        ),
        # 2. Tournament groups fields
        migrations.AddField(
            model_name='tournament',
            name='groups_count',
            field=models.PositiveIntegerField(default=2, verbose_name='Aantal poules'),
        ),
        migrations.AddField(
            model_name='tournament',
            name='groups_ko_per_group',
            field=models.PositiveIntegerField(default=2, verbose_name='Teams naar KO per poule'),
        ),
        migrations.AddField(
            model_name='tournament',
            name='groups_playoff_per_group',
            field=models.PositiveIntegerField(default=0, verbose_name='Teams naar play-offs per poule'),
        ),
        # 3. Team.group FK
        migrations.AddField(
            model_name='team',
            name='group',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='teams',
                to='tournament.group',
                verbose_name='Poule',
            ),
        ),
        # 4. Match.group FK
        migrations.AddField(
            model_name='match',
            name='group',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='matches',
                to='tournament.group',
                verbose_name='Poule',
            ),
        ),
        # 5. Standing.group FK
        migrations.AddField(
            model_name='standing',
            name='group',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='standings',
                to='tournament.group',
                verbose_name='Poule',
            ),
        ),
    ]
