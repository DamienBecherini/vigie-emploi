# CVs

CVs are written in Markdown, one file per CV, then converted into an A4 PDF:

```
{{CMD}} cv "cv/<name>.md"
```

Without a terminal (MCP-only client), the `generer_cv` tool does the same thing. The PDF is written next to the `.md`; the command shows the page count and how full each page is, measured on the PDF (`PAGES : 2 (fill: 96%, 58%)`), with a warning if a page followed by another is less than 80% full (badly placed page break) or if the last one is less than 50% full. **Target: 2 well-filled pages.** If there are 3, cut text rather than shrinking the font.

- `cv/<FirstName>_<LASTNAME>_CV-<JobTitle>.md`: the generic CV approved during onboarding.
- `cv/<FirstName>_<LASTNAME>_CV-for-<Company>-<Role>.md`: a CV targeted at one job ad, when the ad warrants it.
- Never overwrite a PDF that has already been sent: new version with the suffix "V2".
- [`_exemple-structure.md`](_exemple-structure.md): a fictitious CV showing the expected structure.

## Expected structure

1. `# FirstName LASTNAME`
2. The target job title in `**bold**` (use the ad's wording), then a subtitle in `*(italics)*`.
3. Contact details, one to four lines, items separated by " · ": availability, e-mail, phone, website; then the city; then the profiles (`[LinkedIn](…) · [GitHub](…)`). The converter sorts them into three rows by itself: contacts, address, profiles.
4. `## Summary`, then the sections in the order you want.
5. `## Experience`: one job = `### dates · location`, then a first line in **bold** (the job title), then text or a list.
6. Sections whose title contains *skills*, *competencies*, *education*, *certifications* or *languages* are laid out in two columns: keep their lists short. The section titles must be in English (Summary, Skills, Experience, Education & Certifications, Languages…): the converter recognises them and labels the PDF as English.
7. Manual page break, if the split falls badly: a line `<!-- saut-de-page -->` just before the `##` title of the section to push onto page 2. Then check it still fits on 2 pages.

## Template

The template is in [`gabarit/`](gabarit/): `gabarit.css`, the fonts, and an optional photo (`portrait.jpg`, `.png` or `.webp`). To change the look:

- pick another bundled template: `{{CMD}} gabarits` (tool `lister_gabarits`) lists them ("sobre", serif; "moderne", with a coloured band; "compact", single column), `{{CMD}} gabarit <name>` (tool `choisir_gabarit`) installs it; the old one is kept in `cv/gabarit-<date>/` and the photo is carried over;

- ask the AI: "adapt `cv/gabarit/gabarit.css` to this design", giving it a screenshot or a PDF of the look you want; it edits the stylesheet, regenerates the CV and checks the 2 pages;
- or edit `gabarit.css` yourself (accent colour, font, margins).

Visual check: `--capture` (tool: `capture: true`) produces a PNG image of the actual pages of the PDF, one below the other (in `cv/gabarit/apercu/`).
