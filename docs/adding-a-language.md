# Adding a language

**English** · [Français](adding-a-language.fr.md) · [README](../README.md)

vigie-emploi ships in English and French. One more language needs no change to the logic: you declare it, then translate what the compiler and the tests point out. Example with Spanish (`es`).

## 1. Declare the language

In `src/i18n/tool.ts`:

```ts
export const LANGUAGES = ['fr', 'en', 'es'] as const;
export const LOCALES: Record<Language, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' };
export const NAMES_LANGUAGES: Record<Language, string> = { fr: 'Français', en: 'English', es: 'Español' };
```

The locale sets dates, numbers and plurals (`Intl`). The name appears in the interface's selector and is accepted as a value of `language` ("Español", "espanol", "es").

## 2. Translate what the compiler points out

`npm run typecheck` lists every place where the new language is missing:

| File | Contents |
|---|---|
| `src/i18n/es.ts` (copy of `en.ts`), to add to `DICTIONARIES` in `src/i18n/index.ts` | CLI, API, generated tracker, initialisation |
| `ui/src/i18n/es.ts`, to add to `DICTIONARIES_UI` in `ui/src/i18n/index.ts` | Dashboard |
| `src/mcp/i18n/es.ts`, to add to `DICTIONARIES_MCP_USER` in `src/mcp/texts.ts` | MCP server texts shown as is to the user (titles of the tools and prompts, prompt descriptions, `to_tell` sentences); the rest (instructions, tool descriptions, parameters, results and errors, read by the AI only) stays in English |
| `src/i18n/labels.ts` | Labels of statuses, event types, inventory levels |
| `ui/src/theme.ts` | Colour names (`LABELS_NEUTRAL`, `LABELS_ACCENTS`) |

That is three dictionaries (about a thousand texts in all, starting from the English files) and five small tables. The compiler points out nothing else: the rest of the code knows no particular language.

Texts keep their `{name}` parameters. A plural text is an object `{ one, other }`, completed if needed with `zero`, `two`, `few` or `many` for languages that distinguish them (categories of `Intl.PluralRules`).

## 3. Translated files

| File | Role | Without a translation |
|---|---|---|
| `scaffold-es/` (copy of `scaffold/`) | Workspace created by `init --language es`: AI instructions, onboarding, sample résumé | The English template is copied, with a warning |
| `AGENTS.es.md` | The application's instructions for the agent | `AGENTS.md` (English) |
| `examples/rubric.es.json` | Sample grid | English grid |
| `README.es.md` | Presentation, to link from the language selector at the top of the READMEs | — |
| `docs/*.es.md` | Guides (reference, MCP server, adding a language, the code), to link from their language selector | English guides |

`npm test` (file `tests/languages.test.ts`) checks that these files exist, that `scaffold-es/` contains the same files as `scaffold/`, and that no dictionary text is empty or left in French.

## 4. Optional

- Usual section titles of a résumé in the language (`SECTIONS_BY_LANGUAGE`, `src/cv/cv.ts`): the résumé's `lang` attribute is then detected automatically.
- Descriptions of the résumé templates (`DESCRIPTIONS_TEMPLATES`, same file) and palette names (`translations` in `ui/src/theme.ts`): French by default.
- "Language" field of the Claude Desktop extension (`mcpb/manifest.json`): mention the new value in the description.

## 5. Check

```bash
npm run typecheck && npm test && npm run build
node bin/vigie-emploi.js init /tmp/try-es --language es
```

Then open the dashboard (`node bin/vigie-emploi.js serve --data /tmp/try-es`) and pick the language in the header. Have the texts proofread by a native speaker.

Identifiers (statuses `new`, `sent`…, command names, in English) and the workspace's file names (in French) are the same in every language: the AI and scripts rely on them.
