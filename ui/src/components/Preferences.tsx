// Preferences of the header bar: language, light or dark theme, palettes drawer and zoom (remembered in localStorage).
import { useCallback, useEffect, useState } from 'react';
import { Moon, Palette as PaletteIcon, Sun, ZoomIn, ZoomOut } from 'lucide-react';
import { chooseLanguage, language, LANGUAGES, NAMES_LANGUAGES, t, type Language } from '../i18n/index.ts';
import { usePreference, usePreferenceText } from '../state.ts';
import { useDarkSystem } from '../hooks/useMediaQuery.ts';
import { ChoiceTheme, type Mode } from './Theme.tsx';
import {
  applyPalette,
  PALETTE_LIGHT_DEFAULT,
  PALETTE_DARK_DEFAULT,
  PALETTES_LIGHT,
  PALETTES_DARK,
  PERSONAL_DEFAULT,
  findPalette,
  variablesPalette,
  type Palette,
} from '../theme.ts';

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`vigie-emploi:${key}`, JSON.stringify(value));
  } catch {
    /* stockage indisponible : la préférence vaut pour la session */
  }
}

/** Language of the interface: the choice is remembered (localStorage) and wins over the configuration. */
function ChoiceLanguage() {
  // Short codes in the header (FR / EN), full name of the language in the tooltip of each option.
  return (
    <select
      className="field py-1 text-sm"
      style={{ width: 'auto' }}
      value={language()}
      onChange={(e) => chooseLanguage(e.target.value as Language)}
      aria-label={t('header.language')}
      title={t('header.language')}
    >
      {LANGUAGES.map((l) => (
        <option key={l} value={l} lang={l} title={NAMES_LANGUAGES[l]}>
          {l.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

export function Preferences() {
  const [mode, setMode] = usePreferenceText('theme', 'system') as [Mode, (m: Mode) => void];
  const [paletteLight, setPaletteLight] = usePreferenceText('palette-light', PALETTE_LIGHT_DEFAULT);
  const [paletteDark, setPaletteDark] = usePreferenceText('palette-dark', PALETTE_DARK_DEFAULT);
  const [personalLight, setPersonalLight] = usePreference<Palette>('palette-personal-light', PERSONAL_DEFAULT);
  const [personalDark, setPersonalDark] = usePreference<Palette>('palette-personal-dark', PERSONAL_DEFAULT);
  const [zoom, setZoom] = usePreference<number>('zoom', 100);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const darkSystem = useDarkSystem();
  const dark = mode === 'dark' || (mode === 'system' && darkSystem);
  const light = findPalette(PALETTES_LIGHT, paletteLight, personalLight);
  const darkPalette = findPalette(PALETTES_DARK, paletteDark, personalDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    applyPalette(dark ? darkPalette : light);
    // Variables read by the script of index.html at the next load (no colour flash).
    save('palette-vars-light', variablesPalette(light));
    save('palette-vars-dark', variablesPalette(darkPalette));
  }, [dark, light, darkPalette]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${zoom}%`;
  }, [zoom]);
  const close = useCallback(() => setDrawerOpen(false), []);
  return (
    <div className="flex items-center gap-1">
      <ChoiceLanguage />
      <button
        type="button"
        className="button"
        onClick={() => setMode(dark ? 'light' : 'dark')}
        aria-label={dark ? t('theme.toLight') : t('theme.toDark')}
        title={dark ? t('theme.toLight') : t('theme.toDark')}
      >
        {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
      </button>
      <button type="button" className="button" onClick={() => setDrawerOpen(true)} aria-haspopup="dialog" title={t('theme.palettes')}>
        <PaletteIcon className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">{t('theme.button')}</span>
      </button>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own box and legend into the header bar */}
      <div role="group" aria-label={t('zoom.group')} className="flex items-center">
        <button
          type="button"
          className="button rounded-r-none"
          onClick={() => setZoom(Math.max(75, zoom - 10))}
          aria-label={t('zoom.collapse')}
          title={t('zoom.collapse')}
        >
          <ZoomOut className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="border-y border-slate-300 bg-white px-2 py-1 text-sm whitespace-nowrap tabular-nums hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
          onClick={() => setZoom(100)}
          aria-live="polite"
          aria-label={t('zoom.size', { zoom })}
          title={t('zoom.back')}
        >
          {zoom} %
        </button>
        <button
          type="button"
          className="button rounded-l-none"
          onClick={() => setZoom(Math.min(175, zoom + 10))}
          aria-label={t('zoom.expand')}
          title={t('zoom.expand')}
        >
          <ZoomIn className="size-4" aria-hidden="true" />
        </button>
      </div>
      {drawerOpen && (
        <ChoiceTheme
          close={close}
          mode={mode}
          setMode={setMode}
          light={{ palettes: PALETTES_LIGHT, chosen: paletteLight, choose: setPaletteLight, personal: personalLight, setPersonal: setPersonalLight }}
          dark={{ palettes: PALETTES_DARK, chosen: paletteDark, choose: setPaletteDark, personal: personalDark, setPersonal: setPersonalDark }}
        />
      )}
    </div>
  );
}
