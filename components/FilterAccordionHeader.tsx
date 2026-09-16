'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface Props {
  title: string;
  count: number;
  onClear: () => void;
  ariaLabel: string;
}

/** Accordion summary content shared by the Collection and Named Entities filter sections. */
export const FilterAccordionHeader = ({ title, count, onClear, ariaLabel }: Props) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'nowrap',
      width: '100%',
      height: '32px',
      overflow: 'hidden',
      pr: 1,
    }}>
    <Typography sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
      {title}
    </Typography>
    {count > 0 && (
      <Tooltip title="Clear">
        {/* A real <button> here would nest inside AccordionSummary's own
        button, which is invalid HTML and breaks hydration. */}
        <Box
          component="span"
          role="button"
          tabIndex={0}
          aria-label={ariaLabel}
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onClear();
            }
          }}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.25,
            borderRadius: '999px',
            cursor: 'pointer',
            bgcolor: 'action.hover',
            color: 'text.secondary',
            fontSize: '0.75rem',
            fontWeight: 600,
            lineHeight: 1.4,
            '&:hover': { color: 'text.primary', bgcolor: 'action.selected' },
          }}>
          {count}
          <CloseIcon sx={{ fontSize: 14 }} />
        </Box>
      </Tooltip>
    )}
  </Box>
);
