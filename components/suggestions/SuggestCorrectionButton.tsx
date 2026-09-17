'use client';

import React from 'react';
import { Button, IconButton, Tooltip } from '@mui/material';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { useSuggestionStore } from '@/app/stores/useSuggestionStore';
import { isSuggestionsEnabled } from '@/config/organizationConfig';
import { SuggestionContext } from '@/types/suggestion';

interface Props {
  context: SuggestionContext;
  /** 'icon' for a quiet control beside content; 'text' where a label fits. */
  display?: 'icon' | 'text';
  label?: string;
  size?: 'small' | 'medium';
}

/**
 * Opens the correction dialog for a particular piece of the archive.
 *
 * Renders nothing when the portal has no suggestions configured, so every
 * surface can offer one without first checking whether it would work.
 */
export const SuggestCorrectionButton = ({ context, display = 'icon', label, size = 'small' }: Props) => {
  const openSuggestion = useSuggestionStore((state) => state.openSuggestion);
  if (!isSuggestionsEnabled) return null;

  const text = label ?? 'Suggest a correction';
  const open = (event: React.MouseEvent) => {
    // These often sit inside something clickable — a transcript word, an
    // entity chip, a result row — and raising a correction is not a request to
    // navigate.
    event.stopPropagation();
    event.preventDefault();
    openSuggestion(context);
  };

  if (display === 'text') {
    return (
      <Button size={size} startIcon={<EditNoteIcon />} onClick={open} sx={{ textTransform: 'none' }}>
        {text}
      </Button>
    );
  }

  return (
    <Tooltip title={text}>
      <IconButton size={size} onClick={open} aria-label={text}>
        <EditNoteIcon fontSize={size === 'small' ? 'small' : 'medium'} />
      </IconButton>
    </Tooltip>
  );
};
