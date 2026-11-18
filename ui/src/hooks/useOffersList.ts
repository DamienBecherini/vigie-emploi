// List of offers read from the URL parameters: page, size, sort levels, chosen offer, and the query of the page.
import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';
import { queryKeys } from '../queryKeys.ts';
import { readLevels, writeLevels } from '../sort.ts';

export function useOffersList(params: URLSearchParams) {
  const page = Number(params.get('page') ?? 1);
  const size = Number(params.get('size') ?? 50);

  // Sort on one or several levels: ?sort=received_at:desc,score:desc (old format: ?sort=score&order=asc).
  const orderDefault = params.get('order') === 'asc' ? 'asc' : 'desc';
  const levels = useMemo(() => readLevels(params.get('sort'), orderDefault), [params, orderDefault]);
  const sort = writeLevels(levels);
  const offerChosen = params.get('offer') ? Number(params.get('offer')) : null;

  const request = new URLSearchParams(params);
  request.delete('offer');
  request.set('sort', sort);
  request.delete('order');
  if (!request.has('size')) request.set('size', String(size));
  const key = request.toString();

  const list = useQuery({ queryKey: queryKeys.offersPage(key), queryFn: () => api.offers(request), placeholderData: keepPreviousData });
  return { page, size, levels, offerChosen, list };
}

export type OffersList = ReturnType<typeof useOffersList>['list'];
