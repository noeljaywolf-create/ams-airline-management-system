"""
Build the AMS Hard Engineering guide.

Usage:  python build.py
Output: ../../docs/AMS-Hard-Engineering.pdf
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from framework import Guide  # noqa: E402
import p1_concurrency, p2_data, p3_algorithms, p4_integrity, p5_review  # noqa: E402

OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', '..', 'docs', 'AMS-Hard-Engineering.pdf')


def main():
    story = []

    p1_concurrency.cover(story)
    p1_concurrency.front(story)
    p1_concurrency.part1(story)
    p2_data.part2(story)
    p2_data.part3(story)
    p3_algorithms.part4(story)
    p4_integrity.part5(story)
    p4_integrity.part6(story)
    p4_integrity.part7(story)
    p5_review.part8(story)
    p5_review.appendix(story)

    doc = Guide(OUT)
    doc.build(story)

    import re
    raw = open(OUT, 'rb').read()
    counts = re.findall(rb'/Count\s+(\d+)', raw)
    pages = max((int(c) for c in counts), default=0)
    print(f'Wrote {os.path.abspath(OUT)}')
    print(f'Pages: {pages}')
    print(f'Size:  {len(raw) / 1024:,.0f} KB')


if __name__ == '__main__':
    main()