'use client';

import { useEffect, useRef } from 'react';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useThreshold } from '@/app/stores/useThreshold';

/** Keystrokes settle before the entity lists are refetched. */
const RELOAD_DEBOUNCE_MS = 350;

/**
 * Keeps the checked labels' entity lists in step with whatever narrows the
 * results — the search term and type, the collection and folder filters, and
 * the score threshold.
 *
 * The lists have to move with the query or their counts describe the archive
 * instead of the results on screen, which would tell a user a filter narrows
 * their results when it would actually widen them. Reloads are debounced
 * because each one costs a request per checked label.
 */
export const useReloadNerEntityOptions = () => {
  const nerFilters = useSemanticSearchStore((state) => state.nerFilters);
  const searchTerm = useSemanticSearchStore((state) => state.searchTerm);
  const searchType = useSemanticSearchStore((state) => state.searchType);
  const selectedCollectionIds = useSemanticSearchStore((state) => state.selectedCollectionIds);
  const selectedFolderIds = useSemanticSearchStore((state) => state.selectedFolderIds);
  const loadNerEntityOptions = useSemanticSearchStore((state) => state.loadNerEntityOptions);
  const { minValue, maxValue } = useThreshold();

  // Read through a ref so the effect depends on the query, not on identities
  // that change every render.
  const loadRef = useRef(loadNerEntityOptions);
  loadRef.current = loadNerEntityOptions;

  const labelsKey = [...nerFilters].sort().join('|');
  const collectionsKey = [...selectedCollectionIds].sort().join('|');
  const foldersKey = [...selectedFolderIds].sort().join('|');

  useEffect(() => {
    if (!labelsKey) return;

    const labels = labelsKey.split('|').filter(Boolean);
    const timer = setTimeout(() => {
      labels.forEach((label) => {
        void loadRef.current(label, false, minValue, maxValue);
      });
    }, RELOAD_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [labelsKey, searchTerm, searchType, collectionsKey, foldersKey, minValue, maxValue]);
};
