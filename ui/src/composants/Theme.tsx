// Fenêtre « Thème » : mode (système, clair, sombre) et palette de chaque mode, dont une palette personnalisée.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Monitor, Moon, Sun, X } from 'lucide-react';
import {
  ACCENTS,
  LIBELLES_ACCENTS,
  LIBELLES_NEUTRES,
  NEUTRES,
  PERSO,
  teinte,
  type Accent,
  type Neutre,
  type Palette,
  type PaletteNommee,
} from '../theme.ts';

export type Mode = 'systeme' | 'clair' | 'sombre';

function Pastilles({ p, sombre }: { p: Palette; sombre: boolean }) {
  const fond = teinte(p.neutre, sombre ? '900' : '50');
  return (
    <span className="flex h-8 w-16 shrink-0 items-center justify-center gap-1 rounded border border-slate-300 dark:border-slate-600" style={{ background: fond }} aria-hidden="true">
      <span className="size-3 rounded-full" style={{ background: teinte(p.neutre, sombre ? '600' : '300') }} />
      <span className="size-3 rounded-full" style={{ background: teinte(p.neutre, sombre ? '300' : '700') }} />
      <span className="size-3 rounded-full" style={{ background: teinte(p.accent, sombre ? '500' : '700') }} />
    </span>
  );
}

function ChoixPalette(props: {
  titre: string;
  sombre: boolean;
  palettes: PaletteNommee[];
  choisie: string;
  choisir: (id: string) => void;
  perso: Palette;
  setPerso: (p: Palette) => void;
}) {
  const nom = useId();
  const carte = (id: string, p: Palette, libelle: string, description?: string) => {
    const active = props.choisie === id;
    return (
      <label
        key={id}
        className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 ${
          active ? 'border-blue-600 ring-2 ring-blue-600/30 dark:border-blue-400' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'
        }`}
      >
        <input type="radio" name={nom} className="sr-only" checked={active} onChange={() => props.choisir(id)} />
        <Pastilles p={p} sombre={props.sombre} />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold">{libelle}</span>
          {description && <span className="block text-xs text-slate-600 dark:text-slate-400">{description}</span>}
        </span>
        {active && <Check className="size-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />}
      </label>
    );
  };
  return (
    <fieldset className="space-y-2">
      <legend className="etiquette">{props.titre}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {props.palettes.map((p) => carte(p.id, p, p.nom, p.description))}
        {carte(PERSO, props.perso, 'Personnalisée', `${LIBELLES_NEUTRES[props.perso.neutre]} · ${LIBELLES_ACCENTS[props.perso.accent]}`)}
      </div>
      {props.choisie === PERSO && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            <span className="etiquette">Gris</span>
            <select className="champ" value={props.perso.neutre} onChange={(e) => props.setPerso({ ...props.perso, neutre: e.target.value as Neutre })}>
              {NEUTRES.map((n) => (
                <option key={n} value={n}>
                  {LIBELLES_NEUTRES[n]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="etiquette">Accent</span>
            <select className="champ" value={props.perso.accent} onChange={(e) => props.setPerso({ ...props.perso, accent: e.target.value as Accent })}>
              {ACCENTS.map((a) => (
                <option key={a} value={a}>
                  {LIBELLES_ACCENTS[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </fieldset>
  );
}

export function ChoixTheme(props: {
  fermer: () => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  clair: { palettes: PaletteNommee[]; choisie: string; choisir: (id: string) => void; perso: Palette; setPerso: (p: Palette) => void };
  sombre: { palettes: PaletteNommee[]; choisie: string; choisir: (id: string) => void; perso: Palette; setPerso: (p: Palette) => void };
}) {
  const titre = useId();
  const entete = useRef<HTMLHeadingElement>(null);
  const { fermer } = props;
  useEffect(() => {
    entete.current?.focus({ preventScroll: true });
    // En capture : Échap ferme cette fenêtre sans fermer aussi le détail d'offre ouvert dessous.
    const clavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      fermer();
    };
    window.addEventListener('keydown', clavier, true);
    return () => window.removeEventListener('keydown', clavier, true);
  }, [fermer]);
  const modes: [Mode, string, typeof Sun][] = [
    ['systeme', 'Système', Monitor],
    ['clair', 'Clair', Sun],
    ['sombre', 'Sombre', Moon],
  ];
  // Portail : l'en-tête (sticky, flou) piégerait une position fixe.
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 sm:pt-16" onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titre}
        className="w-full max-w-2xl rounded-lg border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 id={titre} ref={entete} tabIndex={-1} className="flex-1 text-lg font-bold">
            Thème
          </h2>
          <button type="button" className="bouton" onClick={fermer} aria-label="Fermer (Échap)">
            <X className="size-4" aria-hidden="true" /> Fermer
          </button>
        </div>
        <div className="space-y-5 p-4">
          <fieldset>
            <legend className="etiquette">Mode</legend>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {modes.map(([m, libelle, Icone]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={props.mode === m}
                  className={`bouton ${props.mode === m ? 'bouton-actif' : ''}`}
                  onClick={() => props.setMode(m)}
                >
                  <Icone className="size-4" aria-hidden="true" /> {libelle}
                </button>
              ))}
            </div>
          </fieldset>
          <ChoixPalette titre="Palette du thème clair" sombre={false} {...props.clair} />
          <ChoixPalette titre="Palette du thème sombre" sombre {...props.sombre} />
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Chaque mode garde sa dernière palette ; le bouton soleil / lune de l'en-tête bascule le mode sans la changer.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
