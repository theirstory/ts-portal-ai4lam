'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useThreshold } from '@/app/stores/useThreshold';
import { SchemaTypes } from '@/types/weaviate';
import { SearchType } from '@/types/searchType';
import { NerEntityFilter } from '@/types/ner';
import { PAGINATION_ITEMS_PER_PAGE, STORIES_RETURN_PROPERTIES } from '@/app/constants';
import { returnedFields } from '@/components/SearchBox';

const PARAM = {
  query: 'q',
  searchType: 'type',
  entity: 'entity',
  collection: 'collection',
  filter: 'filter',
} as const;

/**
 * Entities travel as `entity=label:text`, repeated once per selection. The
 * label is split on the first colon only, since labels never contain one but
 * entity text can ("Q&A: part two").
 */
const parseEntityParam = (value: string): NerEntityFilter | null => {
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  const label = value.slice(0, separator).trim();
  const text = value.slice(separator + 1).trim();
  return label && text ? { label, text } : null;
};

const serializeEntity = (entity: NerEntityFilter) => `${entity.label}:${entity.text}`;

const isSearchType = (value: string | null): value is SearchType =>
  value === SearchType.bm25 || value === SearchType.Hybrid || value === SearchType.Vector;

/**
 * Keeps the recordings view's state in the URL so a search, a set of entity
 * filters, or a narrowed result list can be linked to and reopened as-is.
 *
 * Restoration happens once on mount and then the hook only writes, so typing
 * in a box cannot fight with a URL that is being rewritten underneath it. The
 * URL is replaced rather than pushed: every keystroke-free filter change would
 * otherwise become a separate back-button step.
 */
export const useRecordingsUrlState = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { minValue, maxValue } = useThreshold();

  const {
    searchTerm,
    searchType,
    selectedNerEntities,
    selectedCollectionIds,
    resultsFilterTerm,
    hasSearched,
    setSearchTerm,
    setSearchType,
    setHasSearched,
    setSelectedCollectionIds,
    setSelectedNerEntities,
    setResultsFilterTerm,
    setExpandedNerLabels,
    loadNerExcerpts,
    getAllStories,
    run25bmSearch,
    runHybridSearch,
    runVectorSearch,
  } = useSemanticSearchStore();

  const hydratedRef = useRef(false);

  const runSearchFor = useCallback(
    (type: SearchType, entities: NerEntityFilter[]) => {
      const labels = [...new Set(entities.map((entity) => entity.label))];
      switch (type) {
        case SearchType.Hybrid:
          runHybridSearch(SchemaTypes.Chunks, 1000, 0, labels, returnedFields, minValue, maxValue);
          break;
        case SearchType.Vector:
          runVectorSearch(SchemaTypes.Chunks, 1000, 0, labels, returnedFields, minValue, maxValue);
          break;
        default:
          run25bmSearch(SchemaTypes.Chunks, 1000, 0, labels, returnedFields, minValue, maxValue);
          break;
      }
    },
    [maxValue, minValue, run25bmSearch, runHybridSearch, runVectorSearch],
  );

  // --- restore, once -----------------------------------------------------
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const query = searchParams.get(PARAM.query) ?? '';
    const typeParam = searchParams.get(PARAM.searchType);
    const type = isSearchType(typeParam) ? typeParam : searchType;
    const collections = searchParams.getAll(PARAM.collection).filter(Boolean);
    const entities = searchParams
      .getAll(PARAM.entity)
      .map(parseEntityParam)
      .filter((entity): entity is NerEntityFilter => entity !== null);
    const filter = searchParams.get(PARAM.filter) ?? '';

    if (collections.length) setSelectedCollectionIds(collections);
    if (filter) setResultsFilterTerm(filter);
    if (typeParam && isSearchType(typeParam)) setSearchType(typeParam);

    // Always load the recordings list, whatever else is being restored. It is
    // the baseline the view falls back to when filters are cleared, the filter
    // sidebar hides itself when there are no recordings, and the store's
    // `loading` starts true and is only cleared by this call or a search —
    // skipping it left a restored link spinning forever.
    getAllStories(SchemaTypes.Testimonies, [...STORIES_RETURN_PROPERTIES], PAGINATION_ITEMS_PER_PAGE, 0);

    if (entities.length) {
      setSelectedNerEntities(entities);
      // Open the labels the entities belong to, so the sidebar shows why the
      // results are narrowed rather than looking untouched.
      setExpandedNerLabels([...new Set(entities.map((entity) => entity.label))]);
      void loadNerExcerpts(entities);
    }

    if (query) {
      setSearchTerm(query);
      setHasSearched(true);
      runSearchFor(type, entities);
    }
  }, [
    getAllStories,
    loadNerExcerpts,
    runSearchFor,
    searchParams,
    searchType,
    setExpandedNerLabels,
    setHasSearched,
    setResultsFilterTerm,
    setSearchTerm,
    setSearchType,
    setSelectedCollectionIds,
    setSelectedNerEntities,
  ]);

  // --- write ------------------------------------------------------------
  useEffect(() => {
    if (!hydratedRef.current) return;

    const params = new URLSearchParams();
    if (hasSearched && searchTerm.trim()) {
      params.set(PARAM.query, searchTerm.trim());
      params.set(PARAM.searchType, searchType);
    }
    selectedCollectionIds.forEach((id) => params.append(PARAM.collection, id));
    selectedNerEntities.forEach((entity) => params.append(PARAM.entity, serializeEntity(entity)));
    if (resultsFilterTerm.trim()) params.set(PARAM.filter, resultsFilterTerm.trim());

    const next = params.toString();
    if (next === searchParams.toString()) return;

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    hasSearched,
    pathname,
    resultsFilterTerm,
    router,
    searchParams,
    searchTerm,
    searchType,
    selectedCollectionIds,
    selectedNerEntities,
  ]);
};
