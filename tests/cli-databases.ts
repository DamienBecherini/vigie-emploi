// Databases opened by the CLI during the tests (see trackDatabases). No import of src/ at run time: this module is
// loaded by the vi.mock factory of src/db/database.ts.
/**
 * The CLI never closes its database (the process ends after the command); on Windows an open file cannot be removed.
 * Each test file wraps openDatabase with this mock, so that the databases opened by a run are closed after it.
 */
export async function trackDatabases(original: () => Promise<typeof import('../src/db/database.ts')>) {
  const m = await original();
  return {
    ...m,
    openDatabase(path: string) {
      const db = m.openDatabase(path);
      opened().push(db);
      return db;
    },
  };
}

function opened(): { isOpen: boolean; close(): void }[] {
  const g = globalThis as { __vigieEmploiCliDatabases?: { isOpen: boolean; close(): void }[] };
  g.__vigieEmploiCliDatabases ??= [];
  return g.__vigieEmploiCliDatabases;
}

export function closeDatabases(): void {
  for (const db of opened().splice(0)) if (db.isOpen) db.close();
}
