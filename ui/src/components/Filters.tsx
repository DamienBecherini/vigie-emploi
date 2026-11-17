import { useEffect, useId, useRef, useState } from 'react';
import { STATUSES, type Status } from '../../../src/core/statuses.ts';
import { statusShown, t } from '../i18n/index.ts';
import type { Meta } from '../api.ts';
import { KEYS_FILTERS, useDebounce, type KeyUrl } from '../state.ts';
import { VerticalShadows, useVerticalShadows } from './VerticalShadows.tsx';

type Update = (updated: Partial<Record<KeyUrl, string | null>>) => void;

/** Text field written into the URL after a short typing pause. */
function FieldText(props: { key: KeyUrl; value: string; update: Update; label: string; type?: string; placeholder?: string; step?: string }) {
  const id = useId();
  const [local, setLocal] = useState(props.value);
  const deferred = useDebounce(local, props.type === 'date' ? 0 : 350);
  useEffect(() => setLocal(props.value), [props.value]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the debounced input changes, not when the URL does (it would write the old value back)
  useEffect(() => {
    if (deferred !== props.value) props.update({ [props.key]: deferred || null, page: null });
  }, [deferred]);
  return (
    <div>
      <label htmlFor={id} className="label">
        {props.label}
      </label>
      <input
        id={id}
        className="field"
        type={props.type ?? 'text'}
        inputMode={props.type === 'number' ? 'decimal' : undefined}
        step={props.step}
        min={props.type === 'number' ? 0 : undefined}
        max={props.type === 'number' ? 10 : undefined}
        placeholder={props.placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />
    </div>
  );
}

function Cases(props: { legend: string; key: KeyUrl; options: { value: string; label: string; n?: number }[]; chosen: string[]; update: Update }) {
  const toggle = (v: string) => {
    const s = new Set(props.chosen);
    if (s.has(v)) s.delete(v);
    else s.add(v);
    props.update({ [props.key]: [...s].join(',') || null, page: null });
  };
  const list = useRef<HTMLDivElement>(null);
  const shadows = useVerticalShadows(list, props.options.length > 0);
  if (!props.options.length) return null;
  return (
    <fieldset className="min-w-0">
      <legend className="label">{props.legend}</legend>
      {/* Scrolling list: framed so that its edges show, shaded at the top / bottom when boxes are
          hidden on that side; on a phone, a free strip on the right lets the thumb scroll the drawer. */}
      <div className="relative max-md:mr-10">
        <div ref={list} className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-md border border-slate-200 p-1 pr-1 dark:border-slate-600">
          {props.options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
              <input
                type="checkbox"
                className="size-4 accent-blue-700 dark:accent-blue-400"
                checked={props.chosen.includes(o.value)}
                onChange={() => toggle(o.value)}
              />
              <span className="flex-1 truncate">{o.label}</span>
              {o.n !== undefined && <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{o.n}</span>}
            </label>
          ))}
        </div>
        <VerticalShadows {...shadows} />
      </div>
    </fieldset>
  );
}

export function Filters({ params, update, meta }: { params: URLSearchParams; update: Update; meta: Meta | undefined }) {
  const g = (k: KeyUrl) => params.get(k) ?? '';
  const chosen = (k: KeyUrl) => g(k).split(',').filter(Boolean);
  const nByStatus = new Map((meta?.statuses ?? []).map((s) => [s.value, s.n]));
  const active = KEYS_FILTERS.filter((k) => params.has(k)).length;
  return (
    // On a phone, more space between the blocks: room to put the thumb outside the scrolling lists.
    <div className="flex flex-col gap-4 max-md:gap-7">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">
          {t('filters.title')}
          {active ? ` (${active})` : ''}
        </h2>
        <button type="button" className="button" disabled={!active} onClick={() => update(Object.fromEntries([...KEYS_FILTERS, 'page'].map((k) => [k, null])))}>
          {t('filters.reset')}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FieldText key="scoreMin" label={t('filters.scoreMin')} type="number" step="0.5" value={g('scoreMin')} update={update} />
        <FieldText key="scoreMax" label={t('filters.scoreMax')} type="number" step="0.5" value={g('scoreMax')} update={update} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-blue-700 dark:accent-blue-400"
          checked={g('unscored') === '1'}
          onChange={(e) => update({ unscored: e.target.checked ? '1' : null, page: null })}
        />
        {t('filters.unscored')}
      </label>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="label">{t('filters.received')}</legend>
        <FieldText key="receivedFrom" label={t('filters.from')} type="date" value={g('receivedFrom')} update={update} />
        <FieldText key="receivedUntil" label={t('filters.until')} type="date" value={g('receivedUntil')} update={update} />
      </fieldset>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="label">{t('filters.published')}</legend>
        <FieldText key="publishedFrom" label={t('filters.from')} type="date" value={g('publishedFrom')} update={update} />
        <FieldText key="publishedUntil" label={t('filters.until')} type="date" value={g('publishedUntil')} update={update} />
      </fieldset>
      <Cases
        legend={t('filters.status')}
        key="status"
        chosen={chosen('status')}
        update={update}
        options={STATUSES.map((s: Status) => ({ value: s, label: statusShown(s), n: nByStatus.get(s) ?? 0 }))}
      />
      <Cases
        legend={t('filters.source')}
        key="source"
        chosen={chosen('source')}
        update={update}
        options={(meta?.sources ?? []).map((s) => ({ value: s.value, label: s.value, n: s.n }))}
      />
      <FieldText key="contract" label={t('filters.contract')} placeholder={t('filters.contractExample')} value={g('contract')} update={update} />
      <FieldText key="remote" label={t('filters.remote')} placeholder={t('filters.remoteExample')} value={g('remote')} update={update} />
      <Cases
        legend={t('filters.tags')}
        key="tag"
        chosen={chosen('tag')}
        update={update}
        options={(meta?.tags ?? []).map((s) => ({ value: s.value, label: s.value, n: s.n }))}
      />
    </div>
  );
}
