"""Rend les pages d'un PDF en PNG (pypdfium2) : python pdf-en-png.py <pdf> <prefixe-sortie> [echelle].

Écrit <prefixe-sortie>-p1.png, -p2.png… ; échelle 1.5 par défaut (A4 : 893 × 1263 pixels).
"""
import sys

import pypdfium2 as pdfium

pdf, prefixe = sys.argv[1], sys.argv[2]
echelle = float(sys.argv[3]) if len(sys.argv) > 3 else 1.5
doc = pdfium.PdfDocument(pdf)
for i, page in enumerate(doc, start=1):
    image = page.render(scale=echelle).to_pil()
    chemin = f"{prefixe}-p{i}.png"
    image.save(chemin)
    print(chemin, image.size)
