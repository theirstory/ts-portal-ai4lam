'use client';

import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useThreshold } from '@/app/stores/useThreshold';
import { PAGINATION_ITEMS_PER_PAGE } from '@/app/constants';
import { SchemaTypes } from '@/types/weaviate';
import { SearchType } from '@/types/searchType';
import { NerEntityFilter } from '@/types/ner';
import { returnedFields } from '@/components/SearchBox';
import { STORIES_RETURN_PROPERTIES } from '@/app/constants';

/**
 * Re-runs whatever view is currently active with the latest filters, so every
 * place a filter can change dispatches the same way.
 *
 * Which query to run depends on whether a search is active: with a search term
 * the results are chunks from that search, and without one they are the
 * recordings list, optionally narrowed by label. Callers pass the next filters
 * explicitly because a store setter in the same tick has not been applied yet.
 */
export const useRefreshFilteredResults = () => {
  const {
    nerFilters,
    hasSearched,
    searchType,
    getAllStories,
    clearSearch,
    runHybridSearch,
    runVectorSearch,
    run25bmSearch,
    setCurrentPage,
    selectedNerEntities,
    loadNerExcerpts,
  } = useSemanticSearchStore();
  const { minValue, maxValue } = useThreshold();

  return (
    nextNerFilters: string[] = nerFilters,
    nextNerEntities: NerEntityFilter[] = selectedNerEntities,
  ) => {
    setCurrentPage(1);

    // Picking an entity is a question about moments, so the results become the
    // passages mentioning it rather than the recordings containing it.
    void loadNerExcerpts(nextNerEntities);

    if (!hasSearched) {
      // Browsing rather than searching: the recordings list is the result set,
      // and label filters narrow it server-side.
      clearSearch();
      // Collection and folder filters are read from the store by getAllStories.
      getAllStories(
        SchemaTypes.Testimonies,
        [...STORIES_RETURN_PROPERTIES],
        PAGINATION_ITEMS_PER_PAGE,
        0,
        nextNerFilters,
        nextNerEntities,
      );
      return;
    }

    switch (searchType) {
      case SearchType.Hybrid:
        runHybridSearch(SchemaTypes.Chunks, 1000, 0, nextNerFilters, returnedFields, minValue, maxValue);
        break;
      case SearchType.Vector:
        runVectorSearch(SchemaTypes.Chunks, 1000, 0, nextNerFilters, returnedFields, minValue, maxValue);
        break;
      case SearchType.bm25:
      default:
        run25bmSearch(SchemaTypes.Chunks, 1000, 0, nextNerFilters, returnedFields, minValue, maxValue);
        break;
    }
  };
};
