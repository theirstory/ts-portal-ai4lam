'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useThreshold } from '@/app/stores/useThreshold';
import { useRefreshFilteredResults } from '@/app/hooks/useRefreshFilteredResults';
import { getNerColor, getNerDisplayName } from '@/config/organizationConfig';
import { SearchType } from '@/types/searchType';
import { colors } from '@/lib/theme';
import { NER_ENTITY_DISPLAY_PAGE_SIZE } from '@/app/constants';
import { FilterAccordionHeader } from './FilterAccordionHeader';

// Compact sizing only — no color overrides, so this keeps whatever
// border/focus colors the TextField already had.
const compactSearchFieldSx = {
  '& .MuiInputBase-input': {
    fontSize: '0.8125rem',
    padding: '6px 10px',
  },
};

interface Props {
  /** Label ids to show, already resolved against portal config and what the archive actually contains. */
  nerIds: string[];
}

/**
 * "Named Entities" section of the recordings filter sidebar — the label
 * checkboxes plus, for each checked label, its entity picker (Technology:
 * "Whisper", Organization: "Library of Congress", ...) with "Show more".
 */
export const NamedEntityFilterAccordion = ({ nerIds }: Props) => {
  const {
    nerFilters,
    setNerFilters,
    nerSearchTerm,
    setNerSearchTerm,
    searchTerm,
    searchType,
    selectedCollectionIds,
    selectedFolderIds,
    selectedNerEntity,
    setSelectedNerEntity,
    loadNerEntityOptions,
    nerEntityOptionsByLabel,
    nerEntityOptionsHasMoreByLabel,
    nerEntityOptionsLoadingByLabel,
    nerEntityOptionsVisibleCountByLabel,
    availableNerLabelCounts,
  } = useSemanticSearchStore();
  const { minValue, maxValue } = useThreshold();
  const refreshResults = useRefreshFilteredResults();

  const filteredNerIds = useMemo(() => {
    const query = nerSearchTerm.trim().toLowerCase();
    if (!query) return nerIds;
    return nerIds.filter((id) => {
      const displayName = getNerDisplayName(id).toLowerCase();
      if (id.toLowerCase().includes(query) || displayName.includes(query)) return true;
      // Only match against loaded entity text for labels that are checked —
      // otherwise a stale cache from a previously-checked label would surface
      // an unchecked one whose entity list isn't even visible.
      if (!nerFilters.includes(id)) return false;
      return (nerEntityOptionsByLabel[id] ?? []).some((entity) => entity.text.toLowerCase().includes(query));
    });
  }, [nerEntityOptionsByLabel, nerFilters, nerIds, nerSearchTerm]);

  const toggleSubject = (nerId: string) => {
    const next = nerFilters.includes(nerId) ? nerFilters.filter((id) => id !== nerId) : [...nerFilters, nerId];
    setNerFilters(next);
    refreshResults(next);
  };

  const toggleEntity = (label: string, text: string) => {
    const isActive = selectedNerEntity?.label === label && selectedNerEntity.text === text;
    setSelectedNerEntity(isActive ? null : { label, text });
    refreshResults(nerFilters);
  };

  const clearSubjects = () => {
    setSelectedNerEntity(null);
    setNerFilters([]);
    setNerSearchTerm('');
    refreshResults([]);
  };

  const previousNerOptionDepsRef = useRef<{
    nerFilters: string[];
    searchTerm: string;
    searchType: SearchType;
    selectedCollectionIds: string[];
    selectedFolderIds: string[];
    minValue: number;
    maxValue: number;
  } | null>(null);

  useEffect(() => {
    const previous = previousNerOptionDepsRef.current;
    const otherDepsChanged =
      previous !== null &&
      (previous.searchTerm !== searchTerm ||
        previous.searchType !== searchType ||
        previous.minValue !== minValue ||
        previous.maxValue !== maxValue ||
        previous.selectedCollectionIds.join(',') !== selectedCollectionIds.join(',') ||
        previous.selectedFolderIds.join(',') !== selectedFolderIds.join(','));

    // Only refetch labels that are newly checked and don't already have cached
    // options, unless something that affects every label's counts changed
    // (search, collections, folders, threshold). Otherwise re-checking an
    // already-loaded label needlessly refetches and flashes its spinner again.
    nerFilters.forEach((label) => {
      const isNewLabel = !previous?.nerFilters.includes(label);
      const alreadyLoaded = (nerEntityOptionsByLabel[label]?.length ?? 0) > 0;
      if (otherDepsChanged || (isNewLabel && !alreadyLoaded)) {
        loadNerEntityOptions(label, false, minValue, maxValue);
      }
    });

    previousNerOptionDepsRef.current = {
      nerFilters,
      searchTerm,
      searchType,
      selectedCollectionIds,
      selectedFolderIds,
      minValue,
      maxValue,
    };
  }, [
    loadNerEntityOptions,
    maxValue,
    minValue,
    nerEntityOptionsByLabel,
    nerFilters,
    searchTerm,
    searchType,
    selectedCollectionIds,
    selectedFolderIds,
  ]);

  return (
    <Accordion
      disableGutters
      defaultExpanded
      elevation={0}
      square
      slotProps={{ heading: { component: 'h2' } }}
      sx={{ '&:before': { display: 'none' }, borderTop: `1px solid ${colors.common.border}` }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <FilterAccordionHeader
          title="Named Entities"
          count={nerFilters.length}
          onClear={clearSubjects}
          ariaLabel="Clear named entity filters"
        />
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search named entities..."
          inputProps={{ 'aria-label': 'Search named entities' }}
          value={nerSearchTerm}
          onChange={(event) => setNerSearchTerm(event.target.value)}
          sx={{ mb: 1, ...compactSearchFieldSx }}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {filteredNerIds.map((id) => {
            const hasLoadedOptions = (nerEntityOptionsByLabel[id]?.length ?? 0) > 0;
            const showEntityList = nerFilters.includes(id) && (hasLoadedOptions || !nerEntityOptionsLoadingByLabel[id]);
            const entityQuery = nerSearchTerm.trim().toLowerCase();
            const matchingEntities = (nerEntityOptionsByLabel[id] ?? []).filter((entity) =>
              entity.text.toLowerCase().includes(entityQuery),
            );
            const visibleCount = nerEntityOptionsVisibleCountByLabel[id] ?? NER_ENTITY_DISPLAY_PAGE_SIZE;
            const visibleEntities = entityQuery ? matchingEntities : matchingEntities.slice(0, visibleCount);
            const canShowMore =
              !entityQuery && (matchingEntities.length > visibleCount || nerEntityOptionsHasMoreByLabel[id]);

            return (
              <Box key={id}>
                <Box
                  onClick={() => toggleSubject(id)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    cursor: 'pointer',
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}>
                  <Checkbox
                    checked={nerFilters.includes(id)}
                    size="small"
                    inputProps={{ 'aria-label': getNerDisplayName(id) }}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleSubject(id)}
                  />
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: getNerColor(id),
                      flexShrink: 0,
                    }}
                  />
                  <Typography fontSize="0.875rem" color="text.secondary">
                    {getNerDisplayName(id)} ({availableNerLabelCounts[id] ?? 0})
                  </Typography>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {nerEntityOptionsLoadingByLabel[id] && <CircularProgress size={12} />}
                  </Box>
                </Box>

                <Collapse in={showEntityList} timeout={200} unmountOnExit>
                  <Box sx={{ ml: 4.8, mt: 0.25, mb: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    {visibleEntities.map((entity) => {
                      const isActive =
                        selectedNerEntity?.label === entity.label && selectedNerEntity.text === entity.text;
                      return (
                        <Box
                          key={`${entity.label}-${entity.text}`}
                          onClick={() => toggleEntity(entity.label, entity.text)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            minHeight: 26,
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 1,
                            cursor: 'pointer',
                            bgcolor: isActive ? 'action.selected' : 'transparent',
                            '&:hover': { bgcolor: 'action.hover' },
                          }}>
                          <Typography
                            sx={{
                              fontSize: '0.8125rem',
                              color: isActive ? 'text.primary' : 'text.secondary',
                              fontWeight: isActive ? 700 : 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                            {entity.text}
                          </Typography>
                          <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled', flexShrink: 0 }}>
                            {entity.count}
                          </Typography>
                        </Box>
                      );
                    })}

                    {canShowMore && !nerEntityOptionsLoadingByLabel[id] && (
                      <Button
                        size="small"
                        onClick={() => loadNerEntityOptions(id, true, minValue, maxValue)}
                        sx={{
                          justifyContent: 'flex-start',
                          textTransform: 'none',
                          minWidth: 0,
                          px: 0.75,
                          py: 0.25,
                          fontSize: '0.75rem',
                          color: 'text.secondary',
                        }}>
                        Show more
                      </Button>
                    )}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};
