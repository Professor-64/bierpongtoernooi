from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tournament', '0010_groups_format'),
    ]

    operations = [
        migrations.AddField(
            model_name='tournament',
            name='show_drinks_on_tables',
            field=models.BooleanField(default=True, verbose_name='Dranken tonen in tafelsweergave'),
        ),
    ]
