"""
Shared framework for the AMS Hard Engineering guide.

Rebuilt from the first guide's framework with additions needed here:
fixed-height code blocks with internal rules, comparison tables, and
explicit "verified vs assumed" markers.
"""

import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Preformatted,
    Spacer, Table, TableStyle,
)

PAGE_W, PAGE_H = LETTER
MARGIN_L = 0.9 * inch
MARGIN_R = 0.9 * inch
MARGIN_T = 0.85 * inch
MARGIN_B = 0.85 * inch
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

INK = colors.HexColor('#14181d')
MUTED = colors.HexColor('#55606e')
RULE = colors.HexColor('#d2d8e0')
ACCENT = colors.HexColor('#0a4257')
CODE_BG = colors.HexColor('#f7f9fa')
CODE_BORDER = colors.HexColor('#d6dde3')
PROV_BG = colors.HexColor('#eef6f0')
PROV_EDGE = colors.HexColor('#2f7a4d')
ASSUM_BG = colors.HexColor('#fdf4e8')
ASSUM_EDGE = colors.HexColor('#c98a2b')
BUG_BG = colors.HexColor('#fdeeec')
BUG_EDGE = colors.HexColor('#b03a2e')
LOCK_BG = colors.HexColor('#eef2f7')
LOCK_EDGE = colors.HexColor('#0a4257')

_base = getSampleStyleSheet()

S = {
    'title': ParagraphStyle(
        't', parent=_base['Title'], fontName='Helvetica-Bold', fontSize=26,
        leading=31, textColor=ACCENT, spaceAfter=12, alignment=TA_LEFT),
    'h1': ParagraphStyle(
        'h1', parent=_base['Heading1'], fontName='Helvetica-Bold', fontSize=19,
        leading=24, textColor=ACCENT, spaceAfter=10),
    'h2': ParagraphStyle(
        'h2', parent=_base['Heading2'], fontName='Helvetica-Bold', fontSize=13.5,
        leading=18, textColor=colors.HexColor('#0f3f52'),
        spaceBefore=14, spaceAfter=5),
    'h3': ParagraphStyle(
        'h3', parent=_base['Heading3'], fontName='Helvetica-Bold', fontSize=11,
        leading=14.5, textColor=colors.HexColor('#2a3540'),
        spaceBefore=10, spaceAfter=3),
    'body': ParagraphStyle(
        'b', parent=_base['Normal'], fontName='Helvetica', fontSize=9.6,
        leading=14.2, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=7),
    'lead': ParagraphStyle(
        'ld', parent=_base['Normal'], fontName='Helvetica', fontSize=10.4,
        leading=15.4, textColor=colors.HexColor('#25303a'),
        alignment=TA_JUSTIFY, spaceAfter=9),
    'bullet': ParagraphStyle(
        'bu', parent=_base['Normal'], fontName='Helvetica', fontSize=9.4,
        leading=13.6, textColor=INK, leftIndent=15, bulletIndent=4,
        spaceAfter=4, alignment=TA_LEFT),
    'code': ParagraphStyle(
        'c', parent=_base['Normal'], fontName='Courier', fontSize=7.5,
        leading=9.6, textColor=colors.HexColor('#16202b'), spaceAfter=0),
    'codecap': ParagraphStyle(
        'cc', parent=_base['Normal'], fontName='Helvetica-Oblique',
        fontSize=8, leading=10.6, textColor=MUTED, spaceBefore=3, spaceAfter=8),
    'callout': ParagraphStyle(
        'co', parent=_base['Normal'], fontName='Helvetica', fontSize=9.2,
        leading=13.2, textColor=colors.HexColor('#1f2933'), alignment=TA_LEFT),
    'callouthead': ParagraphStyle(
        'ch', parent=_base['Normal'], fontName='Helvetica-Bold', fontSize=9,
        leading=12.2, textColor=colors.HexColor('#1f2933'), spaceAfter=3),
    'tcell': ParagraphStyle(
        'tc', parent=_base['Normal'], fontName='Helvetica', fontSize=8.5,
        leading=11.2, textColor=INK, alignment=TA_LEFT),
    'thead': ParagraphStyle(
        'th', parent=_base['Normal'], fontName='Helvetica-Bold', fontSize=8.5,
        leading=11.2, textColor=colors.white, alignment=TA_LEFT),
    'tmono': ParagraphStyle(
        'tm', parent=_base['Normal'], fontName='Courier', fontSize=7.9,
        leading=10.8, textColor=colors.HexColor('#16202b'), alignment=TA_LEFT),
}


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def rich(t):
    t = esc(t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'(?<!\*)\*([^*]+?)\*(?!\*)', r'<i>\1</i>', t)
    t = re.sub(r'`(.+?)`', r'<font name="Courier" size="8.6">\1</font>', t)
    return t


def H1(text, page_break=True):
    out = [PageBreak()] if page_break else []
    out.append(Paragraph(rich(text), S['h1']))
    return out


def H2(text):
    return [Paragraph(rich(text), S['h2'])]


def H3(text):
    return [Paragraph(rich(text), S['h3'])]


def P(text):
    return [Paragraph(rich(text), S['body'])]


def LEAD(text):
    return [Paragraph(rich(text), S['lead'])]


def SPACER(h=8):
    return [Spacer(1, h)]


def _bstyle(indent):
    return ParagraphStyle(f'b{indent}', parent=S['bullet'],
                          leftIndent=indent, bulletIndent=indent - 11)


def BUL(items, indent=15):
    st = _bstyle(indent)
    return [Paragraph(rich(i), st, bulletText='•') for i in items] + [Spacer(1, 4)]


def NUMLIST(items, indent=17):
    st = _bstyle(indent)
    out = [Paragraph(rich(t), st, bulletText=f'{i}.') for i, t in enumerate(items, 1)]
    return out + [Spacer(1, 4)]


def CODE(text, caption=None):
    lines = text.rstrip('\n').split('\n')
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    pre = Preformatted('\n'.join(lines), S['code'])
    tbl = Table([[pre]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CODE_BG),
        ('BOX', (0, 0), (-1, -1), 0.6, CODE_BORDER),
        ('LINEBEFORE', (0, 0), (0, -1), 2.6, ACCENT),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5.5),
    ]))
    out = [Spacer(1, 3), tbl, Spacer(1, 4)]
    out.append(Paragraph(rich(caption), S['codecap']) if caption else Spacer(1, 5))
    return out


def BOX(kind, head, body):
    bg, edge = {
        'proven': (PROV_BG, PROV_EDGE),
        'assume': (ASSUM_BG, ASSUM_EDGE),
        'bug': (BUG_BG, BUG_EDGE),
        'lock': (LOCK_BG, LOCK_EDGE),
    }[kind]
    inner = [Paragraph(rich(head), S['callouthead'])]
    for para in body.split('\n\n'):
        inner.append(Paragraph(rich(para), S['callout']))
    tbl = Table([[inner]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('LINEBEFORE', (0, 0), (0, -1), 2.8, edge),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return [Spacer(1, 3), tbl, Spacer(1, 8)]


def VERIFIED(head, body):
    return BOX('proven', head, body)


def ASSUMED(head, body):
    return BOX('assume', head, body)


def BUG(head, body):
    return BOX('bug', head, body)


def LOCK(head, body):
    return BOX('lock', head, body)


def TABLE(headers, rows, widths=None, mono_cols=()):
    data = [[Paragraph(esc(h), S['thead']) for h in headers]]
    for r in rows:
        data.append([Paragraph(rich(c), S['tmono'] if i in mono_cols else S['tcell'])
                     for i, c in enumerate(r)])
    if widths is None:
        widths = [1] * len(headers)
    tot = sum(widths)
    widths = [w * CONTENT_W / tot for w in widths]
    tbl = Table(data, colWidths=widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), ACCENT),
        ('GRID', (0, 0), (-1, -1), 0.4, RULE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5.5),
        ('TOPPADDING', (0, 0), (-1, -1), 4.2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.2),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1),
         [colors.white, colors.HexColor('#f3f6f8')]),
    ]))
    return [Spacer(1, 3), tbl, Spacer(1, 9)]


def HR():
    t = Table([['']], colWidths=[CONTENT_W], rowHeights=[0.8])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), RULE)]))
    return [Spacer(1, 3), t, Spacer(1, 9)]


def PART(title, blurb):
    """A part-opener: large heading plus an orienting paragraph."""
    return (H1(title) +
            LEAD(blurb))


class Guide(BaseDocTemplate):
    def __init__(self, filename, **kw):
        super().__init__(
            filename, pagesize=LETTER,
            leftMargin=MARGIN_L, rightMargin=MARGIN_R,
            topMargin=MARGIN_T, bottomMargin=MARGIN_B,
            title='AMS — Hard Engineering: The Problems That Actually Matter',
            author='AMS Engineering',
            subject='Concurrency, exact arithmetic, multi-tenancy, algorithms '
                    'and verification, taught from the AMS codebase',
            **kw)
        frame = Frame(MARGIN_L, MARGIN_B, CONTENT_W,
                      PAGE_H - MARGIN_T - MARGIN_B, id='main')
        self.addPageTemplates([
            PageTemplate(id='cover', frames=[frame]),
            PageTemplate(id='body', frames=[frame], onPage=self._deco),
        ])

    def _deco(self, canv, doc):
        canv.saveState()
        canv.setFont('Helvetica', 7.2)
        canv.setFillColor(MUTED)
        canv.drawString(MARGIN_L, PAGE_H - MARGIN_T + 18,
                        'AMS — Hard Engineering')
        canv.drawRightString(PAGE_W - MARGIN_R, PAGE_H - MARGIN_T + 18,
                             'Concurrency · Exact arithmetic · Verification')
        canv.setStrokeColor(RULE)
        canv.setLineWidth(0.5)
        canv.line(MARGIN_L, PAGE_H - MARGIN_T + 13,
                  PAGE_W - MARGIN_R, PAGE_H - MARGIN_T + 13)
        canv.line(MARGIN_L, MARGIN_B - 15, PAGE_W - MARGIN_R, MARGIN_B - 15)
        canv.setFont('Helvetica', 7.6)
        canv.drawString(MARGIN_L, MARGIN_B - 26,
                        'Internal engineering document — not regulatory advice')
        canv.drawRightString(PAGE_W - MARGIN_R, MARGIN_B - 26,
                             f'Page {doc.page}')
        canv.restoreState()