'use client';

import React, { useState } from 'react';
import { Button, IconButton, Tooltip } from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import { ShareMenu } from './ShareMenu';

interface Props {
  url: string;
  title: string;
  /** Describes what is being shared, e.g. "From 12:04 to 12:38". */
  caption?: string;
  display?: 'icon' | 'text';
  label?: string;
  size?: 'small' | 'medium';
}

/**
 * A share control and its menu, for anything with a link of its own — a whole
 * recording, or a moment inside one.
 */
export const ShareButton = ({ url, title, caption, display = 'icon', label = 'Share', size = 'small' }: Props) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isOpen = Boolean(anchorEl);

  const open = (event: React.MouseEvent<HTMLElement>) => {
    // Often sits inside something clickable; sharing is not that thing.
    event.stopPropagation();
    event.preventDefault();
    setAnchorEl(event.currentTarget);
  };

  return (
    <>
      {display === 'text' ? (
        <Button
          size={size}
          startIcon={<ShareIcon />}
          onClick={open}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          sx={{ textTransform: 'none' }}>
          {label}
        </Button>
      ) : (
        <Tooltip title={label}>
          <IconButton size={size} onClick={open} aria-label={label} aria-haspopup="menu" aria-expanded={isOpen}>
            <ShareIcon fontSize={size === 'small' ? 'small' : 'medium'} />
          </IconButton>
        </Tooltip>
      )}

      <ShareMenu
        anchorEl={anchorEl}
        open={isOpen}
        onClose={() => setAnchorEl(null)}
        url={url}
        title={title}
        caption={caption}
      />
    </>
  );
};
