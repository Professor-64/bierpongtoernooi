from django.conf import settings


def app_settings(request):
    return {'app_version': settings.APP_VERSION}
