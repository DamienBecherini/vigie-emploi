import { afterAll, describe, expect, it } from 'vitest';
import { chooseLanguage, compensationShown } from '../ui/src/i18n/index.ts';

describe('pay shown in the dashboard', () => {
  afterAll(() => chooseLanguage('fr'));

  it('writes the schema.org unit left by the JSON-LD in the current language', () => {
    chooseLanguage('fr');
    expect(compensationShown('45000-55000 YEAR')).toBe('45000-55000 / an');
    expect(compensationShown('500 DAY')).toBe('500 / jour');
    chooseLanguage('en');
    expect(compensationShown('3000 MONTH')).toBe('3000 / month');
  });

  it('leaves any other text as it is', () => {
    chooseLanguage('fr');
    expect(compensationShown('104 k€ - 112 k€')).toBe('104 k€ - 112 k€');
    expect(compensationShown('YEARLY bonus')).toBe('YEARLY bonus');
    expect(compensationShown(null)).toBeNull();
  });
});
