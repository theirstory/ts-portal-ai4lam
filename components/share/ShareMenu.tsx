'use client';

import React, { useState } from 'react';
import { Alert, Divider, ListItemIcon, Menu, MenuItem, Snackbar, Typography } from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import IosShareIcon from '@mui/icons-material/IosShare';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import XIcon from '@mui/icons-material/X';
import FacebookIcon from '@mui/icons-material/Facebook';
import { copyToClipboard, openShareWindow, socialShareUrls } from '@/lib/share';

interface Props {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  /** The link being shared — already carrying any timestamps. */
  url: string;
  /** What the link is, for the share sheet and the post text. */
  title: string;
  /** Shown under the menu's items so a reader can see what they are sharing. */
  caption?: string;
}

/**
 * The ways a reader can pass a link on.
 *
 * Copy comes first because that is what a citation needs — a footnote wants a
 * URL, not a post. The rest are conveniences for the same link.
 */
export const ShareMenu = ({ anchorEl, open, onClose, url, title, caption }: Props) => {
  const [notice, setNotice] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const canShareNatively = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async (message = 'Link copied') => {
    const copied = await copyToClipboard(url);
    setNotice(
      copied
        ? { message, severity: 'success' }
        : { message: 'Could not copy the link. You can copy it from the address bar.', severity: 'error' },
    );
    return copied;
  };

  const handleCopy = async () => {
    onClose();
    await copy();
  };

  const handleNativeShare = async () => {
    onClose();
    try {
      await navigator.share({ title, url });
    } catch (error) {
      // Dismissing the sheet rejects too, and that is not a failure.
      if ((error as Error)?.name !== 'AbortError') {
        setNotice({ message: 'Could not open the share sheet.', severity: 'error' });
      }
    }
  };

  // The networks do not reliably carry the text they are given, so the link
  // goes to the clipboard as well and the notice says so.
  const handleSocial = async (target: string) => {
    onClose();
    await copy('Link copied — paste it if the post opens empty');
    openShareWindow(target);
  };

  return (
    <>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ list: { 'aria-label': 'Share', sx: { minWidth: 232 } } }}>
        {caption && (
          <Typography
            sx={{
              px: 2,
              pt: 0.5,
              pb: 1,
              fontSize: '0.75rem',
              color: 'text.secondary',
              maxWidth: 280,
              whiteSpace: 'normal',
            }}>
            {caption}
          </Typography>
        )}

        <MenuItem onClick={handleCopy}>
          <ListItemIcon>
            <LinkIcon fontSize="small" />
          </ListItemIcon>
          Copy link
        </MenuItem>

        <Divider />

        {canShareNatively && (
          <MenuItem onClick={handleNativeShare}>
            <ListItemIcon>
              <IosShareIcon fontSize="small" />
            </ListItemIcon>
            Share via…
          </MenuItem>
        )}

        <MenuItem onClick={() => handleSocial(socialShareUrls.linkedin(url))}>
          <ListItemIcon>
            <LinkedInIcon fontSize="small" />
          </ListItemIcon>
          Share on LinkedIn
        </MenuItem>

        <MenuItem onClick={() => handleSocial(socialShareUrls.x(url, title))}>
          <ListItemIcon>
            <XIcon fontSize="small" />
          </ListItemIcon>
          Share on X
        </MenuItem>

        <MenuItem onClick={() => handleSocial(socialShareUrls.facebook(url))}>
          <ListItemIcon>
            <FacebookIcon fontSize="small" />
          </ListItemIcon>
          Share on Facebook
        </MenuItem>
      </Menu>

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={notice?.severity ?? 'success'} onClose={() => setNotice(null)} variant="filled">
          {notice?.message}
        </Alert>
      </Snackbar>
    </>
  );
};
