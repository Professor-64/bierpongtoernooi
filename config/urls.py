from django.contrib import admin
from django.urls import path, include, re_path
from django.contrib.auth import views as auth_views
from django.conf import settings
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('login/', auth_views.LoginView.as_view(
        template_name='registration/login.html',
        extra_context={'allow_registration': settings.ALLOW_REGISTRATION},
    ), name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
    path('', include('tournament.urls')),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]
