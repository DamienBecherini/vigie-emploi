# ADR 0006 — The 0.7 redesign: errors with a code, shared schemas, codes instead of sentences, site adapters

**English** · [Français](0006-redesign-0-7.fr.md)

Date: 18/11/2026 · Status: accepted

## Context

Version 0.6.0 was the first public one. An architecture review made just after it found the foundations sound (a core shared by the command line, the API and the MCP server; histories instead of overwritten fields; pure functions for the score) and five weaknesses that would cost more with each new feature:

1. **Errors recognised by their text.** The API answered 400 for everything, including a defect of the program, and one place chose 403 or 404 by searching the text of the message.
2. **The same data described several times.** A score had one shape in the command line, another in the MCP server and a third in the interface, which copied 25 types of the server by hand; 11 had drifted.
3. **French sentences in the data and in the core.** The flags of a score were saved as French sentences, so an English workspace showed French; labels of statuses lived in the core.
4. **Job sites named all over the code.** The link patterns were a chain of `if`, the reading of e-mails tested `source === 'glassdoor'`, the ingestion kept its own list of sites whose page it reads.
5. **Five files past 500 lines**, each mixing several subjects.

There was no lint, no coverage measure, and the documentation was French first, although the application was published for both languages.

## Decisions

1. **An expected error is an `AppError` with a code** ([`src/core/errors.ts`](../../src/core/errors.ts)): `invalid`, `not-found`, `forbidden`, `not-configured`, `file-not-found`, `language-unknown`. The core throws it; each way in maps the code to its own answer (HTTP status, exit code, MCP error result). Anything else is a defect: it shows its stack and answers 500. No code reads the text of a message. `ErrorConfig` and `MailError` inherit from it.
2. **One Zod schema per piece of data, and the types inferred from it.** A score is defined once (`schemaInputBatch(describe)`), and the MCP server passes its descriptions to that factory rather than writing a second schema. The body of each API request, the events and the configuration file are validated where they enter. The interface imports its types from the server, with type-only imports, so that nothing of the server reaches the bundle.
3. **What is saved carries codes and values; sentences are written when shown.** A flag is `{ code, params }`; the label of a status, of an event type or of a level comes from a table per language ([`src/i18n/labels.ts`](../../src/i18n/labels.ts)). Scores saved before 0.7 keep their French message and still read. A test refuses a French sentence in `src/` outside the dictionaries.
4. **One adapter per job site** ([`src/sources/`](../../src/sources/)): link recognition, who reads the ad, page reading, e-mail particularities. A registry lists them and the rest of the code asks the registry. The identifier of a site and the key (site, identifier on the site) do not change, so no migration. Indeed and Glassdoor keep the country site of the link received.
5. **Files split by domain, with no change of behaviour**: commands, routes, MCP tools, parts of the scoring grid, components and hooks of the interface. The test suite was the proof: it passed unchanged before and after each split. Target: no source file past 500 lines, dictionaries aside.
6. **English first in the repository.** A file without a suffix is in English and the French one carries `.fr` (`README.fr.md`, `docs/reference.fr.md`, `scaffold-fr/`). The changelog is kept in English only. A workspace created without `--language` takes the language of the system; a workspace whose configuration names no language stays French, as before.
7. **Tooling**: Biome for lint and formatting, coverage of `src/` with a floor, `npm run check` for everything the CI runs, on Linux, Windows and macOS.

## Alternatives set aside

- **Result types instead of exceptions** for expected errors. Cleaner in theory, but every function of the core and its three callers would have changed shape. An error class with a code gives the same guarantee (no text is compared) for a tenth of the change.
- **A separate package of shared types** between the server and the interface. The interface already compiles against `src/` with type-only imports; a package would add a build step for no gain.
- **Translating the saved sentences in a migration.** Old flags are free text; turning them back into codes would guess. They are kept and shown as they are.
- **A class per site with inheritance.** The sites share nothing but a shape. An object that satisfies an interface is enough, and the shared reading of schema.org `JobPosting` is a function the adapters call.
- **`noUncheckedIndexedAccess`** in the compiler. 226 errors, most of them noise on regular-expression matches already tested just above. Set aside; `noUnusedLocals` and `noUnusedParameters` are on.
- **Splitting further** (`Settings.tsx` and `Detail.tsx` in the interface are still long). Left for when they next change: they are one subject each, and a split made only for the line count would scatter it.

## Consequences

- The API's answers changed for the better and visibly: 404 for what does not exist and 500 for a defect (both were 400), and a `code` field in every error. A client that tested the status 400 for a missing job ad must test 404.
- Adding a job site is one file, one line in the registry and one block of tests. Adding a language no longer touches the core for labels.
- The French-first names are gone from the repository (`utiliser-avec-une-ia.md` is `mcp.md`). Links published before 0.7 to the French README must point to `README.fr.md`.
- The cost of the tooling is a slower CI (three systems, coverage on Linux) and a formatting commit listed in `.git-blame-ignore-revs`.
