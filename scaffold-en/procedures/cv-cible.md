# Procedure: targeted CV

The **content** comes from the job ad, the application file and `_CONTEXTE.md`. The **layout** is described in [`../cv/LISEZMOI.md`](../cv/LISEZMOI.md).

1. Start from the ad and the application file, not from another CV: never carry the pitch of one targeted CV over to another target. The reference CV ("Reference CV" section of `_CONTEXTE.md`) is the source of facts.
2. Write `cv/<FirstName>_<LASTNAME>_CV-for-<Company>-<Role>.md`: a title using the ad's wording, a summary and skills reordered to match what the ad asks for, achievements that answer it. A freelance contract puts client evidence first; a permanent role, skills and achievements.
3. Check every line against the inventory and the restrictions in `_CONTEXTE.md`. A proven skill is written without hedging; anything that cannot be claimed does not appear, however it is rephrased.
4. `{{CMD}} cv "cv/<file>.md" --capture` (or `generate_cv` with `capture: true`): **2 pages**; deal with the fill warnings (badly placed page break, last page too empty), then look at the image of the pages. Beyond 2 pages, cut text; do not shrink the font or touch the template.
5. Never overwrite a PDF that has already been sent: new version with the suffix "V2".
6. **The template (`cv/gabarit/gabarit.css`) is shared by all the CVs**: only change it when the user asks, warning them that the change applies to all their CVs.
