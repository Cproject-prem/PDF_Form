import re
with open('backend/pdf_routes.py', 'r', encoding='utf-8') as f: content = f.read()

content = re.sub(
    r'_draw_text\(c, (.*?), x, top_y, w, h,\s*f\.font_family,\s*f\.font_size,\s*f\.font_color,\s*f\.alignment\)',
    r'_draw_text(c, \1, x, top_y, w, h, f.font_family, f.font_size, f.font_color, f.alignment, getattr(f, \'is_bold\', False), getattr(f, \'is_italic\', False))',
    content, flags=re.DOTALL
)

content = re.sub(
    r'_draw_text\(c, (.*?), (.*?), (.*?), (.*?), (.*?),\s*f\.font_family,\s*f\.font_size,\s*f\.font_color,\s*"left"\)',
    r'_draw_text(c, \1, \2, \3, \4, \5, f.font_family, f.font_size, f.font_color, "left", getattr(f, \'is_bold\', False), getattr(f, \'is_italic\', False))',
    content, flags=re.DOTALL
)

content = re.sub(
    r'_draw_multiline\(c, (.*?), x, top_y, w, h,\s*(.*?), (\s*.*?),\s*f\.font_color\)',
    r'_draw_multiline(c, \1, x, top_y, w, h, \2, \3, f.font_color, getattr(f, \'is_bold\', False), getattr(f, \'is_italic\', False))',
    content, flags=re.DOTALL
)

with open('backend/pdf_routes.py', 'w', encoding='utf-8') as f: f.write(content)
