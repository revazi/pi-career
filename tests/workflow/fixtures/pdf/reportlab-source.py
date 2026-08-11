# SPDX-License-Identifier: MIT OR Apache-2.0
"""Maintainer-only source for the immutable synthetic ReportLab PDF fixture."""

from pathlib import Path
import sys

from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

FONT_NAME = "FixtureLato"


def line(pdf: Canvas, x: int, y: int, text: str, size: int = 11) -> None:
    pdf.setFont(FONT_NAME, size)
    pdf.drawString(x, y, text)


def generate(output: Path, font: Path) -> None:
    pdfmetrics.registerFont(TTFont(FONT_NAME, str(font), validate=1))
    pdf = Canvas(
        str(output),
        pagesize=letter,
        pageCompression=1,
        invariant=1,
        pdfVersion=(1, 4),
        initialFontName=FONT_NAME,
        initialFontSize=11,
    )
    pdf.setAuthor("pi-career synthetic fixture")
    pdf.setCreator("pi-career synthetic fixture")
    pdf.setTitle("Synthetic ReportLab Resume")
    pdf.setSubject("Synthetic PDF compatibility test data")

    line(pdf, 48, 744, "Synthetic ReportLab Resume", 20)
    line(pdf, 48, 722, "synthetic@example.invalid | Example City", size=9)
    line(pdf, 48, 684, "EXPERIENCE", 12)
    line(pdf, 48, 662, "Built deterministic TypeScript test systems.")
    line(pdf, 48, 642, "Designed bounded synthetic compatibility fixtures.")
    line(pdf, 360, 684, "SKILLS", 12)
    line(pdf, 360, 662, "TypeScript")
    line(pdf, 360, 642, "Testing")
    line(pdf, 360, 622, "PDF compatibility")
    line(pdf, 360, 602, "Accessibility")
    pdf.showPage()

    line(pdf, 48, 744, "Synthetic ReportLab Resume - page 2", 16)
    line(pdf, 48, 706, "SELECTED WORK", 12)
    line(pdf, 48, 684, "Reviewed exact evidence before explicit selection.")
    line(pdf, 48, 664, "Kept private document handling local and bounded.")
    line(pdf, 48, 626, "EDUCATION", 12)
    line(pdf, 48, 604, "Example Institute - Synthetic Systems")
    pdf.save()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: reportlab-source.py OUTPUT.pdf Lato-Regular.ttf")
    generate(Path(sys.argv[1]), Path(sys.argv[2]))
