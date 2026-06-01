#!/bin/bash
set -e

mkdir -p /app/data

echo "==> Migrations uitvoeren..."
python manage.py migrate --noinput

echo "==> Statische bestanden verzamelen..."
python manage.py collectstatic --noinput --clear

echo "==> Superuser aanmaken indien nodig..."
python manage.py shell -c "
import os
from django.contrib.auth import get_user_model
User = get_user_model()
u = os.environ.get('DJANGO_SUPERUSER_USERNAME', 'admin')
p = os.environ.get('DJANGO_SUPERUSER_PASSWORD', 'admin123')
e = os.environ.get('DJANGO_SUPERUSER_EMAIL', '')
if not User.objects.filter(username=u).exists():
    User.objects.create_superuser(u, e, p)
    print(f'Superuser aangemaakt: {u}')
else:
    print(f'Superuser bestaat al: {u}')
"

echo "==> Gunicorn starten op 0.0.0.0:8000..."
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 2 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
