// The suite runs as on a French system, on every machine.
// A new workspace and a missing configuration take the system's language (systemLanguage, src/core/config.ts):
// the locale variables first (LC_ALL is set to French in vitest.config.ts), then the locale Node reports.
// That locale is the machine's (English on the CI runners, and Windows ignores LC_ALL): it is fixed here, for the tests
// that pass an environment of their own without a locale variable. The tests of the detection give both explicitly.
const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
Intl.DateTimeFormat.prototype.resolvedOptions = function (this: Intl.DateTimeFormat) {
  return { ...resolvedOptions.call(this), locale: 'fr-FR' };
};
