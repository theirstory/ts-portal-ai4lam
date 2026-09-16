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
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useThreshold } from '@/app/stores/useThreshold';
import { useRefreshFilteredResults } from '@/app/hooks/useRefreshFilteredResults';
import { getNerColor, getNerDisplayName } from '@/config/organizationConfig';
import { colors } from '@/lib/theme';
import { NER_ENTITY_SAMPLE_SIZE } from '@/app/constants';
import { NerEntityOption } from '@/types/ner';
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
 * "Named Entities" section of the recordings filter sidebar.
 *
 * A label is a group you open, not a filter you apply — filtering happens by
 * ticking the entities underneath, which multi-select and OR together. The
 * count beside a label is how many distinct entities it holds, since that is
 * what opening it reveals.
 */
export const NamedEntityFilterAccordion = ({ nerIds }: Props) => {
  const {
    nerSearchTerm,
    setNerSearchTerm,
    searchTerm,
    searchType,
    selectedCollectionIds,
    selectedFolderIds,
    selectedNerEntities,
    toggleNerEntity,
    clearNerEntities,
    expandedNerLabels,
    toggleExpandedNerLabel,
    setExpandedNerLabels,
    loadNerEntityOptions,
    nerEntityOptionsByLabel,
    nerEntityOptionsHasMoreByLabel,
    nerEntityOptionsLoadingByLabel,
    nerEntityOptionsVisibleCountByLabel,
    availableNerEntityCounts,
  } = useSemanticSearchStore();
  const { minValue, maxValue } = useThreshold();
  const refreshResults = useRefreshFilteredResults();

  const entityQuery = nerSearchTerm.trim().toLowerCase();

  const selectedEntityKeys = useMemo(
    () => new Set(selectedNerEntities.map((entity) => `${entity.label}:${entity.text.toLowerCase()}`)),
    [selectedNerEntities],
  );

  // Searching has to reach entities under labels that aren't open yet,
  // otherwise the box only finds what the user has already looked at. Every
  // label's entities load once a query is typed.
  useEffect(() => {
    if (!entityQuery) return;
    nerIds.forEach((label) => {
      const loaded = (nerEntityOptionsByLabel[label]?.length ?? 0) > 0;
      if (!loaded && !nerEntityOptionsLoadingByLabel[label]) {
        loadNerEntityOptions(label, false, minValue, maxValue);
      }
    });
  }, [
    entityQuery,
    loadNerEntityOptions,
    maxValue,
    minValue,
    nerEntityOptionsByLabel,
    nerEntityOptionsLoadingByLabel,
    nerIds,
  ]);

  const matchesByLabel = useMemo(() => {
    const result: Record<string, NerEntityOption[]> = {};
    if (!entityQuery) return result;
    nerIds.forEach((label) => {
      const matches = (nerEntityOptionsByLabel[label] ?? []).filter((entity) =>
        entity.text.toLowerCase().includes(entityQuery),
      );
      if (matches.length) result[label] = matches;
    });
    return result;
  }, [entityQuery, nerEntityOptionsByLabel, nerIds]);

  const filteredNerIds = useMemo(() => {
    if (!entityQuery) return nerIds;
    return nerIds.filter((id) => {
      const displayName = getNerDisplayName(id).toLowerCase();
      if (id.toLowerCase().includes(entityQuery) || displayName.includes(entityQuery)) return true;
      return Boolean(matchesByLabel[id]?.length);
    });
  }, [entityQuery, matchesByLabel, nerIds]);

  // A search opens the labels that have hits, so matches aren't hidden behind a
  // closed group. Clearing the box restores whatever was open beforehand.
  const expansionBeforeSearchRef = useRef<string[] | null>(null);
  const matchedLabelsKey = Object.keys(matchesByLabel).sort().join('|');
  useEffect(() => {
    if (entityQuery) {
      if (expansionBeforeSearchRef.current === null) {
        expansionBeforeSearchRef.current = expandedNerLabels;
      }
      const withMatches = matchedLabelsKey ? matchedLabelsKey.split('|') : [];
      const missing = withMatches.filter((label) => !expandedNerLabels.includes(label));
      if (missing.length) setExpandedNerLabels([...expandedNerLabels, ...missing]);
      return;
    }
    if (expansionBeforeSearchRef.current !== null) {
      setExpandedNerLabels(expansionBeforeSearchRef.current);
      expansionBeforeSearchRef.current = null;
    }
    // expandedNerLabels is intentionally omitted: it is written here, and
    // including it would re-run this on every expansion change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityQuery, matchedLabelsKey, setExpandedNerLabels]);

  const toggleLabel = (label: string) => {
    const next = toggleExpandedNerLabel(label);
    if (next.includes(label) && !(nerEntityOptionsByLabel[label]?.length ?? 0)) {
      loadNerEntityOptions(label, false, minValue, maxValue);
    }
  };

  const toggleEntity = (label: string, text: string) => {
    // toggleNerEntity returns the next selection, since the store setter has
    // not applied yet in this tick.
    const next = toggleNerEntity({ label, text });
    refreshResults(undefined, next);
  };

  const clearSubjects = () => {
    clearNerEntities();
    setNerSearchTerm('');
    setExpandedNerLabels([]);
    refreshResults(undefined, []);
  };

  // Reload open labels when something that changes their counts changes.
  const previousDepsRef = useRef<string | null>(null);
  useEffect(() => {
    const key = [
      searchTerm,
      searchType,
      minValue,
      maxValue,
      selectedCollectionIds.join(','),
      selectedFolderIds.join(','),
    ].join('|');
    if (previousDepsRef.current !== null && previousDepsRef.current !== key) {
      expandedNerLabels.forEach((label) => loadNerEntityOptions(label, false, minValue, maxValue));
    }
    previousDepsRef.current = key;
  }, [
    expandedNerLabels,
    loadNerEntityOptions,
    maxValue,
    minValue,
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
          count={selectedNerEntities.length}
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
            const isExpanded = expandedNerLabels.includes(id);
            const allEntities = nerEntityOptionsByLabel[id] ?? [];
            const matchingEntities = entityQuery
              ? (matchesByLabel[id] ?? allEntities.filter((e) => e.text.toLowerCase().includes(entityQuery)))
              : allEntities;
            const visibleCount = nerEntityOptionsVisibleCountByLabel[id] ?? NER_ENTITY_SAMPLE_SIZE;
            const visibleEntities = entityQuery ? matchingEntities : matchingEntities.slice(0, visibleCount);
            const canShowMore =
              !entityQuery && (matchingEntities.length > visibleCount || nerEntityOptionsHasMoreByLabel[id]);
            const entityCount = availableNerEntityCounts[id] ?? allEntities.length;

            return (
              <Box key={id}>
                <Box
                  onClick={() => toggleLabel(id)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    cursor: 'pointer',
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}>
                  <IconButton
                    size="small"
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${getNerDisplayName(id)}`}
                    aria-expanded={isExpanded}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleLabel(id);
                    }}
                    sx={{ p: 0.25 }}>
                    {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                  </IconButton>
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
                    {getNerDisplayName(id)} ({entityCount})
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

                <Collapse in={isExpanded} timeout={200} unmountOnExit>
                  <Box sx={{ ml: 3.5, mt: 0.25, mb: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    {visibleEntities.map((entity) => {
                      const isActive = selectedEntityKeys.has(`${entity.label}:${entity.text.toLowerCase()}`);
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
                            pr: 0.75,
                            borderRadius: 1,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' },
                          }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
                            <Checkbox
                              checked={isActive}
                              size="small"
                              inputProps={{ 'aria-label': `${entity.text}, ${getNerDisplayName(entity.label)}` }}
                              onClick={(event) => event.stopPropagation()}
                              onChange={() => toggleEntity(entity.label, entity.text)}
                              sx={{ p: 0.5 }}
                            />
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
                          </Box>
                          <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled', flexShrink: 0 }}>
                            {entity.count}
                          </Typography>
                        </Box>
                      );
                    })}

                    {!visibleEntities.length && !nerEntityOptionsLoadingByLabel[id] && (
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', px: 0.75, py: 0.5 }}>
                        No entities
                      </Typography>
                    )}

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
