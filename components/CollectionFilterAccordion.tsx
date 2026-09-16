'use client';

import { useMemo, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Box, Checkbox, TextField, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useRefreshFilteredResults } from '@/app/hooks/useRefreshFilteredResults';
import { colors } from '@/lib/theme';
import { FilterAccordionHeader } from './FilterAccordionHeader';

// Compact sizing only — no color overrides, so this keeps whatever
// border/focus colors the TextField already had.
const compactSearchFieldSx = {
  '& .MuiInputBase-input': {
    fontSize: '0.8125rem',
    padding: '6px 10px',
  },
};

/** "Collection" section of RecordingsFilterSidebar's Filters panel. */
export const CollectionFilterAccordion = () => {
  const { collections, selectedCollectionIds, setSelectedCollectionIds } = useSemanticSearchStore();
  const refreshResults = useRefreshFilteredResults();
  const [collectionSearch, setCollectionSearch] = useState('');

  const filteredCollections = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase();
    if (!query) return collections;
    return collections.filter((collection) => `${collection.name} ${collection.id}`.toLowerCase().includes(query));
  }, [collections, collectionSearch]);

  const toggleCollection = (collectionId: string) => {
    const next = selectedCollectionIds.includes(collectionId)
      ? selectedCollectionIds.filter((id) => id !== collectionId)
      : [...selectedCollectionIds, collectionId];
    setSelectedCollectionIds(next);
    refreshResults();
  };

  const clearCollections = () => {
    setSelectedCollectionIds([]);
    refreshResults();
  };

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
          title="Collection"
          count={selectedCollectionIds.length}
          onClear={clearCollections}
          ariaLabel="Clear collection filters"
        />
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0 }}>
        {collections.length > 5 && (
          <TextField
            size="small"
            fullWidth
            placeholder="Search collections..."
            value={collectionSearch}
            onChange={(event) => setCollectionSearch(event.target.value)}
            sx={{ mb: 1, ...compactSearchFieldSx }}
          />
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {filteredCollections.map((collection) => (
            <Box
              key={collection.id}
              onClick={() => toggleCollection(collection.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                cursor: 'pointer',
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}>
              <Checkbox
                checked={selectedCollectionIds.includes(collection.id)}
                size="small"
                inputProps={{ 'aria-label': collection.name }}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleCollection(collection.id)}
              />
              <Typography fontSize="0.875rem" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                {collection.name}
              </Typography>
            </Box>
          ))}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};
