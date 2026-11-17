// "Theme" window: mode (system, light, dark) and palette of each mode, including a personal palette.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Monitor, Moon, Sun, X } from 'lucide-react';
import {
  ACCENTS,
  LABELS_ACCENTS,
  LABELS_NEUTRAL,
  NEUTRAL,
  PERSONAL,
  hue,
  textsPalette,
  type Accent,
  type Neutral,
  type Palette,
  type PaletteNamed,
} from '../theme.ts';
import { language, t } from '../i18n/index.ts';

const neutral = () => LABELS_NEUTRAL[language()];
const accents = () => LABELS_ACCENTS[language()];

export type Mode = 'system' | 'light' | 'dark';

function Dots({ p, dark }: { p: Palette; dark: boolean }) {
  const background = hue(p.neutral, dark ? '900' : '50');
  return (
    <span className="flex h-8 w-16 shrink-0 items-center justify-center gap-1 rounded border border-slate-300 dark:border-slate-600" style={{ background: background }} aria-hidden="true">
      <span className="size-3 rounded-full" style={{ background: hue(p.neutral, dark ? '600' : '300') }} />
      <span className="size-3 rounded-full" style={{ background: hue(p.neutral, dark ? '300' : '700') }} />
      <span className="size-3 rounded-full" style={{ background: hue(p.accent, dark ? '500' : '700') }} />
    </span>
  );
}

function ChoicePalette(props: {
  title: string;
  dark: boolean;
  palettes: PaletteNamed[];
  chosen: string;
  choose: (id: string) => void;
  personal: Palette;
  setPersonal: (p: Palette) => void;
}) {
  const name = useId();
  const card = (id: string, p: Palette, label: string, description?: string) => {
    const active = props.chosen === id;
    return (
      <label
        key={id}
        className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 ${
          active ? 'border-blue-600 ring-2 ring-blue-600/30 dark:border-blue-400' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'
        }`}
      >
        <input type="radio" name={name} className="sr-only" checked={active} onChange={() => props.choose(id)} />
        <Dots p={p} dark={props.dark} />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold">{label}</span>
          {description && <span className="block text-xs text-slate-600 dark:text-slate-400">{description}</span>}
        </span>
        {active && <Check className="size-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />}
      </label>
    );
  };
  return (
    <fieldset className="space-y-2">
      <legend className="label">{props.title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {props.palettes.map((p) => {
          const { name: label, description } = textsPalette(p, language());
          return card(p.id, p, label, description);
        })}
        {card(PERSONAL, props.personal, t('theme.personal'), `${neutral()[props.personal.neutral]} · ${accents()[props.personal.accent]}`)}
      </div>
      {props.chosen === PERSONAL && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            <span className="label">{t('theme.gray')}</span>
            <select className="field" value={props.personal.neutral} onChange={(e) => props.setPersonal({ ...props.personal, neutral: e.target.value as Neutral })}>
              {NEUTRAL.map((n) => (
                <option key={n} value={n}>
                  {neutral()[n]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">{t('theme.accent')}</span>
            <select className="field" value={props.personal.accent} onChange={(e) => props.setPersonal({ ...props.personal, accent: e.target.value as Accent })}>
              {ACCENTS.map((a) => (
                <option key={a} value={a}>
                  {accents()[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </fieldset>
  );
}

export function ChoiceTheme(props: {
  close: () => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  light: { palettes: PaletteNamed[]; chosen: string; choose: (id: string) => void; personal: Palette; setPersonal: (p: Palette) => void };
  dark: { palettes: PaletteNamed[]; chosen: string; choose: (id: string) => void; personal: Palette; setPersonal: (p: Palette) => void };
}) {
  const title = useId();
  const header = useRef<HTMLHeadingElement>(null);
  const { close } = props;
  useEffect(() => {
    header.current?.focus({ preventScroll: true });
    // In capture: Escape closes this window without also closing the offer detail open below.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);
  const modes: [Mode, string, typeof Sun][] = [
    ['system', t('theme.system'), Monitor],
    ['light', t('theme.light'), Sun],
    ['dark', t('theme.dark'), Moon],
  ];
  // Portal: the header (sticky, blurred) would trap a fixed position.
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop, a click outside closes the panel; Escape does the same from the keyboard
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 sm:pt-16" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        className="w-full max-w-2xl rounded-lg border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 id={title} ref={header} tabIndex={-1} className="flex-1 text-lg font-bold">
            {t('theme.title')}
          </h2>
          <button type="button" className="button" onClick={close} aria-label={t('theme.closeEscape')}>
            <X className="size-4" aria-hidden="true" /> {t('theme.close')}
          </button>
        </div>
        <div className="space-y-5 p-4">
          <fieldset>
            <legend className="label">{t('theme.mode')}</legend>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {modes.map(([m, label, Icon]) => (
                // biome-ignore lint/a11y/useSemanticElements: buttons of a radio group, styled as the other buttons of the panel
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={props.mode === m}
                  className={`button ${props.mode === m ? 'button-active' : ''}`}
                  onClick={() => props.setMode(m)}
                >
                  <Icon className="size-4" aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </fieldset>
          <ChoicePalette title={t('theme.paletteLight')} dark={false} {...props.light} />
          <ChoicePalette title={t('theme.paletteDark')} dark {...props.dark} />
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {t('theme.help')}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
