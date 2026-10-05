"""
PDF framework for the AMS JavaScript guide.

Provides page templates, a stylesheet, and the flowable helpers used by
the content modules (chapter, prose, code, callouts, tables).
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, NextPageTemplate, PageBreak,
    PageTemplate, Paragraph, Preformatted, Spacer, Table, TableStyle,
)

PAGE_W, PAGE_H = LETTER
MARGIN_L = 0.95 * inch
MARGIN_R = 0.95 * inch
MARGIN_T = 0.95 * inch
MARGIN_B = 0.9 * inch
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

INK = colors.HexColor('#1a1a1a')
MUTED = colors.HexColor('#5a6472')
RULE = colors.HexColor('#d4d9e0')
ACCENT = colors.HexColor('#0b4f6c')
ACCENT_LIGHT = colors.HexColor('#e8f1f5')
CODE_BG = colors.HexColor('#f6f8fa')
CODE_BORDER = colors.HexColor('#d8dee4')
WARN_BG = colors.HexColor('#fdf3e3')
WARN_EDGE = colors.HexColor('#d9a441')
BUG_BG = colors.HexColor('#fdeeec')
BUG_EDGE = colors.HexColor('#c0392b')
OK_BG = colors.HexColor('#eaf5ee')
OK_EDGE = colors.HexColor('#3d8a5a')

STYLES = getSampleStyleSheet()

S = {
    'title': ParagraphStyle(
        'title', parent=STYLES['Title'], fontName='Helvetica-Bold',
        fontSize=27, leading=32, textColor=ACCENT, spaceAfter=14,
        alignment=TA_LEFT),
    'subtitle': ParagraphStyle(
        'subtitle', parent=STYLES['Normal'], fontName='Helvetica',
        fontSize=13.5, leading=19, textColor=MUTED, spaceAfter=8),
    'h1': ParagraphStyle(
        'h1', parent=STYLES['Heading1'], fontName='Helvetica-Bold',
        fontSize=20, leading=25, textColor=ACCENT,
        spaceBefore=2, spaceAfter=11),
    'h2': ParagraphStyle(
        'h2', parent=STYLES['Heading2'], fontName='Helvetica-Bold',
        fontSize=14, leading=19, textColor=colors.HexColor('#134b63'),
        spaceBefore=15, spaceAfter=6),
    'h3': ParagraphStyle(
        'h3', parent=STYLES['Heading3'], fontName='Helvetica-Bold',
        fontSize=11.5, leading=15, textColor=colors.HexColor('#333'),
        spaceBefore=11, spaceAfter=4),
    'body': ParagraphStyle(
        'body', parent=STYLES['Normal'], fontName='Helvetica', fontSize=9.8,
        leading=14.6, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=7.5),
    'lead': ParagraphStyle(
        'lead', parent=STYLES['Normal'], fontName='Helvetica', fontSize=10.6,
        leading=16, textColor=colors.HexColor('#2c3a47'),
        alignment=TA_JUSTIFY, spaceAfter=9),
    'bullet': ParagraphStyle(
        'bullet', parent=STYLES['Normal'], fontName='Helvetica', fontSize=9.6,
        leading=14, textColor=INK, leftIndent=15, bulletIndent=4,
        spaceAfter=4.5, alignment=TA_LEFT),
    'code': ParagraphStyle(
        'code', parent=STYLES['Normal'], fontName='Courier', fontSize=7.9,
        leading=10.2, textColor=colors.HexColor('#1b2733'), spaceAfter=0),
    'codecap': ParagraphStyle(
        'codecap', parent=STYLES['Normal'], fontName='Helvetica-Oblique',
        fontSize=8.2, leading=11, textColor=MUTED, spaceBefore=3, spaceAfter=8),
    'callout': ParagraphStyle(
        'callout', parent=STYLES['Normal'], fontName='Helvetica', fontSize=9.4,
        leading=13.6, textColor=colors.HexColor('#23313d'),
        alignment=TA_LEFT),
    'callouthead': ParagraphStyle(
        'callouthead', parent=STYLES['Normal'], fontName='Helvetica-Bold',
        fontSize=9.2, leading=12.5, textColor=colors.HexColor('#23313d'),
        spaceAfter=3.5),
    'tcell': ParagraphStyle(
        'tcell', parent=STYLES['Normal'], fontName='Helvetica', fontSize=8.7,
        leading=11.6, textColor=INK, alignment=TA_LEFT),
    'thead': ParagraphStyle(
        'thead', parent=STYLES['Normal'], fontName='Helvetica-Bold',
        fontSize=8.7, leading=11.6, textColor=colors.white, alignment=TA_LEFT),
    'tmono': ParagraphStyle(
        'tmono', parent=STYLES['Normal'], fontName='Courier', fontSize=8.1,
        leading=11, textColor=colors.HexColor('#1b2733'), alignment=TA_LEFT),
}


def _esc(text):
    return (text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def _rich(text):
    """Convert **bold**, *italic* and `mono` spans into reportlab markup."""
    import re
    text = _esc(text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'(?<!\*)\*([^*]+?)\*(?!\*)', r'<i>\1</i>', text)
    text = re.sub(r'`(.+?)`', r'<font name="Courier" size="9">\1</font>', text)
    return text


def H1(text, page_break=True):
    out = []
    if page_break:
        out.append(PageBreak())
    out.append(Paragraph(_rich(text), S['h1']))
    return out


def H2(text):
    return [Paragraph(_rich(text), S['h2'])]


def H3(text):
    return [Paragraph(_rich(text), S['h3'])]


def P(text):
    return [Paragraph(_rich(text), S['body'])]


def LEAD(text):
    return [Paragraph(_rich(text), S['lead'])]


def _bullet_style(indent):
    from reportlab.lib.styles import ParagraphStyle
    return ParagraphStyle(
        f'bullet{indent}', parent=S['bullet'],
        leftIndent=indent, bulletIndent=indent - 11)


def BUL(items, indent=15):
    st = _bullet_style(indent)
    out = [Paragraph(_rich(it), st, bulletText='•') for it in items]
    out.append(Spacer(1, 4))
    return out


def NUMLIST(items, indent=17):
    st = _bullet_style(indent)
    out = []
    for i, it in enumerate(items, 1):
        out.append(Paragraph(_rich(it), st, bulletText=f'{i}.'))
    out.append(Spacer(1, 4))
    return out


def CODE(text, caption=None):
    """A syntax-shaded code block with a light background."""
    lines = text.rstrip('\n').split('\n')
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    n = len(lines)
    pre = Preformatted('\n'.join(lines), S['code'])
    tbl = Table([[pre]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CODE_BG),
        ('BOX', (0, 0), (-1, -1), 0.6, CODE_BORDER),
        ('LINEBEFORE', (0, 0), (0, -1), 2.4, ACCENT),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    out = [Spacer(1, 3), tbl, Spacer(1, 4)]
    if caption:
        out.append(Paragraph(_rich(caption), S['codecap']))
    else:
        out.append(Spacer(1, 5))
    return out


def CALLOUT(kind, head, body):
    """kind: 'note' | 'warn' | 'bug' | 'good'"""
    bg, edge = {
        'note': (ACCENT_LIGHT, ACCENT),
        'warn': (WARN_BG, WARN_EDGE),
        'bug': (BUG_BG, BUG_EDGE),
        'good': (OK_BG, OK_EDGE),
    }[kind]
    inner = [Paragraph(_rich(head), S['callouthead'])]
    for para in body.split('\n\n'):
        inner.append(Paragraph(_rich(para), S['callout']))
    tbl = Table([[inner]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('LINEBEFORE', (0, 0), (0, -1), 2.6, edge),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return [Spacer(1, 3), tbl, Spacer(1, 8)]


def TABLE(headers, rows, widths=None, mono_cols=()):
    """headers: list[str]; rows: list[list[str]]"""
    data = [[Paragraph(_esc(h), S['thead']) for h in headers]]
    for r in rows:
        data.append([
            Paragraph(_rich(c), S['tmono'] if i in mono_cols else S['tcell'])
            for i, c in enumerate(r)
        ])
    if widths is None:
        widths = [CONTENT_W / len(headers)] * len(headers)
    total = sum(widths)
    widths = [w * CONTENT_W / total for w in widths]
    tbl = Table(data, colWidths=widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), ACCENT),
        ('GRID', (0, 0), (-1, -1), 0.4, RULE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1),
         [colors.white, colors.HexColor('#f4f7f9')]),
    ]))
    return [Spacer(1, 3), tbl, Spacer(1, 9)]


def RULEHR():
    t = Table([['']], colWidths=[CONTENT_W], rowHeights=[0.8])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), RULE)]))
    return [Spacer(1, 3), t, Spacer(1, 9)]


def SPACER(h=8):
    return [Spacer(1, h)]


class Guide(BaseDocTemplate):
    def __init__(self, filename, **kw):
        super().__init__(filename, pagesize=LETTER,
                         leftMargin=MARGIN_L, rightMargin=MARGIN_R,
                         topMargin=MARGIN_T, bottomMargin=MARGIN_B,
                         title='AMS — JavaScript: The Language Behind the Platform',
                         author='AMS Engineering',
                         subject='JavaScript taught through the AMS codebase',
                         **kw)
        frame = Frame(MARGIN_L, MARGIN_B, CONTENT_W,
                      PAGE_H - MARGIN_T - MARGIN_B, id='main')
        self.addPageTemplates([
            PageTemplate(id='cover', frames=[frame]),
            PageTemplate(id='body', frames=[frame], onPage=self._decorate),
        ])

    def _decorate(self, canv, doc):
        canv.saveState()
        canv.setFont('Helvetica', 7.4)
        canv.setFillColor(MUTED)
        canv.drawString(MARGIN_L, PAGE_H - MARGIN_T + 20,
                        'AMS — JavaScript: The Language Behind the Platform')
        canv.drawRightString(PAGE_W - MARGIN_R, PAGE_H - MARGIN_T + 20,
                             'For managers and new engineers')
        canv.setStrokeColor(RULE)
        canv.setLineWidth(0.5)
        canv.line(MARGIN_L, PAGE_H - MARGIN_T + 15,
                  PAGE_W - MARGIN_R, PAGE_H - MARGIN_T + 15)
        canv.line(MARGIN_L, MARGIN_B - 16, PAGE_W - MARGIN_R, MARGIN_B - 16)
        canv.setFont('Helvetica', 7.8)
        canv.drawString(MARGIN_L, MARGIN_B - 27, 'Internal training document')
        canv.drawRightString(PAGE_W - MARGIN_R, MARGIN_B - 27, f'Page {doc.page}')
        canv.restoreState()