from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tournament', '0017_tournament_tiebreaker_order_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='tournament',
            name='show_public_qr',
            field=models.BooleanField(default=False, verbose_name='QR-code pagina tonen'),
        ),
    ]
