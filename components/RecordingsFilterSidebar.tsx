'use client';

import React, { useEffect, useMemo } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useRefreshFilteredResults } from '@/app/hooks/useRefreshFilteredResults';
import { nerLabels } from '@/config/organizationConfig';
import { colors } from '@/lib/theme';
import { CollectionFilterAccordion } from './CollectionFilterAccordion';
import { NamedEntityFilterAccordion } from './NamedEntityFilterAccordion';

/**
 * Filter panel for the recordings view. Desktop only — it is hidden below md,
 * where the compact dropdown filters in SearchBox serve instead.
 *
 * Toggles apply immediately rather than behind an "Apply" step, since there is
 * no popup to dismiss. Search itself stays in SearchBox above the results
 * rather than being duplicated here.
 */
export const RecordingsFilterSidebar = () => {
  const {
    collections,
    selectedCollectionIds,
    setSelectedCollectionIds,
    setNerSearchTerm,
    setExpandedNerLabels,
    stories,
    availableNerLabels,
    availableNerEntityCounts,
    availableNerLabelsLoaded,
    loadAvailableNerLabels,
    selectedNerEntities,
    clearNerEntities,
  } = useSemanticSearchStore();
  const refreshResults = useRefreshFilteredResults();

  useEffect(() => {
    void loadAvailableNerLabels();
  }, [loadAvailableNerLabels]);

  const hasMultipleCollections = collections.length > 1;
  const availableNerLabelSet = useMemo(() => new Set(availableNerLabels), [availableNerLabels]);

  const nerIds = useMemo(() => {
    return (nerLabels ?? [])
      .map((label) => label?.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      // config.json declares every label the portal could use; only offer the
      // ones this archive actually contains, so a filter can never be a
      // control that only ever returns nothing. A label already checked stays
      // visible so it can be unchecked.
      .filter((id) => !availableNerLabelsLoaded || availableNerLabelSet.has(id))
      // Ordered by how many distinct entities each holds, which is what opening
      // one reveals and what the count beside it reports.
      .sort((a, b) => (availableNerEntityCounts[b] ?? 0) - (availableNerEntityCounts[a] ?? 0) || a.localeCompare(b));
  }, [availableNerEntityCounts, availableNerLabelSet, availableNerLabelsLoaded]);

  const clearAllFilters = () => {
    setSelectedCollectionIds([]);
    clearNerEntities();
    setNerSearchTerm('');
    setExpandedNerLabels([]);
    refreshResults(undefined, []);
  };

  if (!stories?.objects.length) {
    return null;
  }

  const hasFilters = hasMultipleCollections || nerIds.length > 0;
  const activeFilterCount = selectedCollectionIds.length + selectedNerEntities.length;

  const ghostButtonSx = {
    textTransform: 'none' as const,
    color: 'text.secondary',
    fontWeight: 500,
    fontSize: '0.8125rem',
    minWidth: 0,
    px: 1,
    py: 0.25,
    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
  };

  if (!hasFilters) return null;

  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        gap: 2,
        width: 280,
        flexShrink: 0,
        position: 'sticky',
        top: 16,
        maxHeight: '100%',
        minHeight: 0,
        alignSelf: 'flex-start',
      }}>
      <Box
        sx={{
          border: `1px solid ${colors.common.border}`,
          borderRadius: '8px',
          overflow: 'hidden',
          flex: '0 1 auto',
          maxHeight: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'nowrap',
            height: '48px',
            flexShrink: 0,
            overflow: 'hidden',
            pl: 2,
            pr: 1,
            py: 1,
            bgcolor: colors.background.subtle,
            borderBottom: `1px solid ${colors.common.border}`,
          }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', whiteSpace: 'nowrap' }}>
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
          </Typography>
          {activeFilterCount > 0 && (
            <Button size="small" onClick={clearAllFilters} sx={{ ...ghostButtonSx, whiteSpace: 'nowrap', flexShrink: 0 }}>
              Clear all
            </Button>
          )}
        </Box>

        <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', bgcolor: 'background.paper' }}>
          {hasMultipleCollections && <CollectionFilterAccordion />}
          {nerIds.length > 0 && <NamedEntityFilterAccordion nerIds={nerIds} />}
        </Box>
      </Box>
    </Box>
  );
};
