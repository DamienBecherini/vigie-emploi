#!/usr/bin/env bash
# Régénère les PDF d'exemple de docs/exemples/ (trois gabarits, français et anglais) et leurs aperçus
# (page 1 en PNG, docs/captures/cv-<gabarit>[-en].png). À lancer depuis la racine du dépôt :
#   bash scripts/demo/cv-exemples.sh
# Prérequis : Chrome ou Edge (comme pour « vigie-emploi cv »), Python avec pypdfium2 (pip install pypdfium2).
set -euo pipefail
RACINE="$(pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for gabarit in plain modern compact; do
  for langue in fr en; do
    if [ "$langue" = fr ]; then src="CV-damien-becherini.md"; pdf="CV-damien-becherini-$gabarit.pdf"; png="cv-$gabarit.png"
    else src="CV-damien-becherini.en.md"; pdf="CV-damien-becherini-$gabarit.en.pdf"; png="cv-$gabarit-en.png"; fi
    rm -rf "$TMP/gabarit" && cp -r "templates/cv/$gabarit" "$TMP/gabarit"   # copie : « cv » écrit son aperçu HTML dans le gabarit
    cp "docs/exemples/$src" "$TMP/cv.md"
    node bin/vigie-emploi.js cv "$TMP/cv.md" --template "$TMP/gabarit"
    cp "$TMP/cv.pdf" "docs/exemples/$pdf"
    python scripts/demo/pdf-en-png.py "$TMP/cv.pdf" "$TMP/apercu" 1.5 > /dev/null
    cp "$TMP/apercu-p1.png" "docs/captures/$png"
    echo "$pdf, $png"
  done
done
