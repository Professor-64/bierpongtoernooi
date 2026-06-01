from django import template

register = template.Library()


@register.filter
def hex_to_rgb(hex_color):
    """Convert #RRGGBB to 'R,G,B' string for CSS rgb()."""
    h = hex_color.lstrip('#')
    if len(h) != 6:
        return '32,107,196'
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return f"{r},{g},{b}"


@register.filter
def get_item(dictionary, key):
    return dictionary.get(key)


@register.simple_tag
def match_result_class(match, team_num):
    """Return Bootstrap color class for match result."""
    if match.status != 'finished':
        return ''
    if team_num == 1:
        if match.score1 > match.score2:
            return 'text-success fw-bold'
        elif match.score1 < match.score2:
            return 'text-danger'
        return 'text-warning'
    else:
        if match.score2 > match.score1:
            return 'text-success fw-bold'
        elif match.score2 < match.score1:
            return 'text-danger'
        return 'text-warning'
