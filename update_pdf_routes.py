import re

with open('backend/pdf_routes.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add font_auto_fit to PDFField
content = content.replace(
    '    font_size: int = 12',
    '    font_size: int = 12\n    font_auto_fit: bool = True'
)

# 2. Update _draw_text signature and logic
old_draw_text = '''def _draw_text(c: rl_canvas.Canvas, text: str, x: float, y: float, w: float, h: float,
               font: str, size: int, color_hex: str, alignment: str = "left",
               is_bold: bool = False, is_italic: bool = False) -> None:
    if not text:
        return
    resolved_font = _resolve_font(font, is_bold, is_italic)
    try:
        c.setFont(resolved_font, size)
    except Exception:
        c.setFont("Helvetica", size)
    r, g, b = _hex_to_rgb(color_hex)
    c.setFillColorRGB(r, g, b)
    text = str(text)
    text_w = c.stringWidth(text, c._fontname, size)
    if alignment == "center":
        tx = x + (w - text_w) / 2
    elif alignment == "right":
        tx = x + w - text_w - 2
    else:
        tx = x + 2
    # vertically center (PDF y origin = bottom-left)
    baseline = y - h + (h - size) / 2 + size * 0.2
    c.drawString(tx, baseline, text)'''

new_draw_text = '''def _draw_text(c: rl_canvas.Canvas, text: str, x: float, y: float, w: float, h: float,
               font: str, size: int, color_hex: str, alignment: str = "left",
               is_bold: bool = False, is_italic: bool = False, auto_fit: bool = True) -> None:
    if not text:
        return
    resolved_font = _resolve_font(font, is_bold, is_italic)
    try:
        c.setFont(resolved_font, size)
    except Exception:
        c.setFont("Helvetica", size)
    r, g, b = _hex_to_rgb(color_hex)
    c.setFillColorRGB(r, g, b)
    text = str(text)
    
    if auto_fit:
        while c.stringWidth(text, c._fontname, size) > (w - 4) and size > 4:
            size -= 1
            c.setFont(c._fontname, size)

    text_w = c.stringWidth(text, c._fontname, size)
    if alignment == "center":
        tx = x + (w - text_w) / 2
    elif alignment == "right":
        tx = x + w - text_w - 2
    else:
        tx = x + 2
    # vertically center (PDF y origin = bottom-left)
    baseline = y - h + (h - size) / 2 + size * 0.2
    c.drawString(tx, baseline, text)'''

content = content.replace(old_draw_text, new_draw_text)

# 3. Update _draw_multiline signature and logic
old_draw_multiline = '''def _draw_multiline(c: rl_canvas.Canvas, text: str, x: float, y: float, w: float, h: float,
                    font: str, size: int, color_hex: str,
                    is_bold: bool = False, is_italic: bool = False) -> None:
    if not text:
        return
    resolved_font = _resolve_font(font, is_bold, is_italic)
    try:
        c.setFont(resolved_font, size)
    except Exception:
        c.setFont("Helvetica", size)
    r, g, b = _hex_to_rgb(color_hex)
    c.setFillColorRGB(r, g, b)
    line_h = size * 1.2
    # naive wrap
    lines: List[str] = []
    for paragraph in str(text).split("\\n"):
        words = paragraph.split(" ")
        cur = ""
        for word in words:
            test = (cur + " " + word).strip()
            if c.stringWidth(test, c._fontname, size) <= w - 4:
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
    top = y - 2
    for i, line in enumerate(lines):
        ly = top - (i + 1) * line_h
        if ly < y - h:
            break
        c.drawString(x + 2, ly, line)'''

new_draw_multiline = '''def _draw_multiline(c: rl_canvas.Canvas, text: str, x: float, y: float, w: float, h: float,
                    font: str, size: int, color_hex: str,
                    is_bold: bool = False, is_italic: bool = False, auto_fit: bool = True) -> None:
    if not text:
        return
    resolved_font = _resolve_font(font, is_bold, is_italic)
    try:
        c.setFont(resolved_font, size)
    except Exception:
        c.setFont("Helvetica", size)
    r, g, b = _hex_to_rgb(color_hex)
    c.setFillColorRGB(r, g, b)
    
    lines: List[str] = []
    while size > 4:
        line_h = size * 1.2
        lines = []
        fits = True
        for paragraph in str(text).split("\\n"):
            words = paragraph.split(" ")
            cur = ""
            for word in words:
                test = (cur + " " + word).strip()
                if c.stringWidth(test, c._fontname, size) <= w - 4:
                    cur = test
                else:
                    if cur:
                        lines.append(cur)
                    cur = word
                    # if a single word is wider than the box, we definitely need to shrink
                    if c.stringWidth(word, c._fontname, size) > w - 4:
                        fits = False
            if cur:
                lines.append(cur)
        
        # Check if the total height of lines fits in the box
        if not auto_fit or (fits and len(lines) * line_h <= h - 4):
            break
        
        size -= 1
        c.setFont(c._fontname, size)

    top = y - 2
    line_h = size * 1.2
    for i, line in enumerate(lines):
        ly = top - (i + 1) * line_h
        if ly < y - h:
            break
        c.drawString(x + 2, ly, line)'''

content = content.replace(old_draw_multiline, new_draw_multiline)

# 4. Update the calls in generate_completed_pdf
old_call_text = '''                _draw_text(c, val, x, y, w, h,
                           f.font_family, f.font_size, f.font_color, f.alignment, f.is_bold, f.is_italic)'''
new_call_text = '''                _draw_text(c, val, x, y, w, h,
                           f.font_family, f.font_size, f.font_color, f.alignment, f.is_bold, f.is_italic, getattr(f, "font_auto_fit", True))'''
content = content.replace(old_call_text, new_call_text)

old_call_multi = '''                _draw_multiline(c, val, x, y, w, h,
                                f.font_family, f.font_size, f.font_color, f.is_bold, f.is_italic)'''
new_call_multi = '''                _draw_multiline(c, val, x, y, w, h,
                                f.font_family, f.font_size, f.font_color, f.is_bold, f.is_italic, getattr(f, "font_auto_fit", True))'''
content = content.replace(old_call_multi, new_call_multi)

with open('backend/pdf_routes.py', 'w', encoding='utf-8') as f:
    f.write(content)
