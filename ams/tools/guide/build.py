"""
Build the AMS JavaScript guide PDF.

Usage:  python build.py
Output: ../../docs/AMS-JavaScript-Guide.pdf
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from framework import Guide  # noqa: E402
import content_01, content_02, content_03, content_04  # noqa: E402
import content_05, content_06, content_07  # noqa: E402

OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', '..', 'docs', 'AMS-JavaScript-Guide.pdf')


def main():
    story = []

    content_01.build(story)
    content_02.build(story)
    content_03.build(story)
    content_04.build(story)
    content_05.build(story)
    content_06.build(story)
    content_07.build(story)

    doc = Guide(OUT)
    doc.build(story)

    size_kb = os.path.getsize(OUT) / 1024
    print(f'Wrote {os.path.abspath(OUT)}')
    print(f'Size: {size_kb:,.0f} KB')


if __name__ == '__main__':
    main()