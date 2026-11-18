# Contributing to vigie-emploi

**English** · [Français](CONTRIBUTING.fr.md)

Thank you for looking at the code. This page says how to set up, what a change must come with, and where things go. [`docs/code.md`](docs/code.md) explains how the code fits together; read it first.

## Setting up

You need Node 24 or later and git. Chrome or Edge is needed only to produce a résumé as PDF.

```sh
git clone https://github.com/DamienBecherini/vigie-emploi.git
cd vigie-emploi
npm ci
npm run check        # typecheck, lint, build, tests: what the CI runs
```

Node runs the TypeScript of `src/` directly, so there is nothing to build to try a change at the command line:

```sh
node bin/vigie-emploi.js init ../my-test-workspace --language en
node bin/vigie-emploi.js list --data ../my-test-workspace
```

The dashboard needs its interface compiled once (`npm run build`), then `node bin/vigie-emploi.js serve --data ../my-test-workspace`. While working on the interface, `npm run dev:ui` serves it with hot reload on port 5173 and sends its API calls to that running server (port 4410, or the address in `VIGIE_EMPLOI_API`).

A demo workspace with fictitious job ads: `node scripts/demo/demo.ts ../demo-en en`.

## What a change comes with

- **A test.** A fix comes with a test that fails without it; a feature with tests of what it does and of what it refuses. Tests use fictitious data only (`tests/fixtures/`): no real name, e-mail, company or job ad.
- **`npm run check` passes.** `npm run format` rewrites the formatting; `npm run coverage` must stay above the floor set in `vitest.config.ts`.
- **A line in [`CHANGELOG.md`](CHANGELOG.md)** when a user can see the change, written for that user: what they can now do or what no longer goes wrong.
- **The documentation that describes it**, in English and in French: every document has both versions (`x.md` and `x.fr.md`), and a test checks that each exists and that no relative link is broken.

## Rules of the code

- **Syntax Node can erase.** No `enum`, no parameter properties, no namespaces; imports name the file with its `.ts` extension. The compiler enforces it (`erasableSyntaxOnly`).
- **A rule of the domain goes in `src/core/`**, and the command, the route and the MCP tool call it. If you are writing the same condition in two of them, it belongs in the core.
- **An error the user can cause is an `AppError` with a code** (`src/core/errors.ts`). Never compare the text of a message.
- **What comes from outside goes through a Zod schema** where it enters, and its type is inferred from the schema.
- **No sentence in the data or in the core.** Save an identifier or a code with its values; write the sentence when it is shown, from the dictionaries (`src/i18n/`, `src/mcp/i18n/`, `ui/src/i18n/`). A new text needs its key in every language: the compiler reports a missing one.
- **Identifiers are English and stable**: commands, options, tools, statuses, JSON fields, the `source` of a job site. Renaming one breaks the workspaces and scripts of users.
- **No personal data in the repository.** Everything about a user lives in their workspace.
- **Comments say what the code cannot**: why, the constraint, the trap. In English.

## Common additions

- **A job site**: one adapter in `src/sources/`. See [Job sites](docs/code.md#job-sites). Do not add the download of a page that the site's terms of use forbid.
- **A language**: [`docs/adding-a-language.md`](docs/adding-a-language.md).
- **A command, a route or a tool**: write the operation in `src/core/` with its tests, then expose it. A command goes in the matching file of `src/cli/commands/` and in the help text; a route in `src/api/routes/` with its body schema in `src/api/bodies.ts`; a tool in `src/mcp/tools/` with its descriptions in `src/mcp/i18n/en.ts`.
- **A change of the database**: a new numbered file in `migrations/`. Never edit a published migration: users' databases have already applied it.

## Proposing a change

Open an issue first for anything larger than a fix, to agree on the direction before the work. Then a pull request on GitHub, one subject per pull request, with what it changes for the user and how you tested it.

The repository on GitHub is a mirror of the maintainer's own git server: an accepted pull request is applied there and reaches GitHub through the mirror, so it may be closed by hand rather than with the merge button. Your commits keep your name.

A security problem is not reported in a public issue: see [`SECURITY.md`](.github/SECURITY.md).
