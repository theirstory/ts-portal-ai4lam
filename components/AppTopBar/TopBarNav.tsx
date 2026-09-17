'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { config, isChatEnabled, isZoteroEnabled, externalNavLinks } from '@/config/organizationConfig';
import { ZoteroAuthButton } from '@/components/zotero/ZoteroAuthButton';

interface Props {
  /** True once the full row no longer fits on one line — see useNavOverflow. */
  isCompact: boolean;
  shouldShowCollectionsLink: boolean;
  isTopBarCollapsed: boolean;
  isFullScreenPage: boolean;
  onToggleCollapse: () => void;
}

const contrastText = config.theme.colors.primary.contrastText;

/**
 * The top bar's navigation, as one row of links or as a menu behind a
 * hamburger when that row would wrap.
 *
 * Both forms hold the same items in the same order, and the chip behind them
 * keeps its dark backdrop at every width — the links sit over photographic
 * artwork, where white-on-light is unreadable without it.
 */
export const TopBarNav = ({
  isCompact,
  shouldShowCollectionsLink,
  isTopBarCollapsed,
  isFullScreenPage,
  onToggleCollapse,
}: Props) => {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(menuAnchor);
  const closeMenu = () => setMenuAnchor(null);

  // Widening the window past the tipping point takes the hamburger away, and
  // a menu anchored to a button that no longer exists would hang over the page.
  useEffect(() => {
    if (!isCompact) setMenuAnchor(null);
  }, [isCompact]);

  const internalLinks = [
    { label: 'RECORDINGS', href: '/' },
    { label: 'INDEXES', href: '/indexes' },
    ...(shouldShowCollectionsLink ? [{ label: 'COLLECTIONS', href: '/collections' }] : []),
  ];

  const collapseToggle = !isFullScreenPage && (
    <Tooltip title={isTopBarCollapsed ? 'Expand' : 'Collapse'}>
      <IconButton
        onClick={onToggleCollapse}
        size="small"
        aria-label={isTopBarCollapsed ? 'Expand banner' : 'Collapse banner'}
        sx={{
          color: contrastText,
          bgcolor: 'transparent',
          border: `1.5px solid ${contrastText}`,
          width: 30,
          height: 30,
          flexShrink: 0,
          '&:hover': {
            color: config.theme.colors.primary.main,
            borderColor: config.theme.colors.primary.main,
            bgcolor: 'action.hover',
          },
        }}>
        {isTopBarCollapsed ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
      </IconButton>
    </Tooltip>
  );

  const poweredBy = (
    <>
      Powered by{' '}
      <a
        href="https://theirstory.io/welcome"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'underline' }}>
        TheirStory
      </a>
    </>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: isCompact ? 1 : 3,
        // Never shrinks: the row has to overflow rather than wrap, or the
        // measurement behind isCompact would have nothing to detect.
        flexShrink: 0,
        whiteSpace: 'nowrap',
        // The chip carries the whole row — nav, attribution and the collapse
        // control — so they read as one control surface over the artwork
        // instead of floating loose beside it.
        px: 1.5,
        py: 0.75,
        borderRadius: '8px',
        backgroundColor: 'rgba(0, 0, 0, 0.22)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
      }}>
      {isCompact ? (
        <>
          <IconButton
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            size="small"
            aria-label="Open navigation menu"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-controls={isMenuOpen ? 'top-bar-nav-menu' : undefined}
            sx={{
              color: contrastText,
              border: `1.5px solid ${contrastText}`,
              borderRadius: '6px',
              width: 30,
              height: 30,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
            }}>
            <MenuIcon fontSize="small" />
          </IconButton>
          <Menu
            id="top-bar-nav-menu"
            anchorEl={menuAnchor}
            open={isMenuOpen}
            onClose={closeMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ list: { 'aria-label': 'Portal navigation', sx: { minWidth: 220 } } }}>
            {internalLinks.map((link) => (
              <MenuItem key={link.href} component={Link} href={link.href} onClick={closeMenu}>
                {link.label}
              </MenuItem>
            ))}
            {externalNavLinks.map((link) => (
              <MenuItem
                key={link.href}
                component="a"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
                sx={{ gap: 1 }}>
                {link.label}
                <OpenInNewIcon sx={{ fontSize: 14 }} aria-hidden />
              </MenuItem>
            ))}
            {isChatEnabled && (
              <MenuItem component={Link} href="/discover" onClick={closeMenu} sx={{ gap: 1 }}>
                <AutoAwesomeIcon sx={{ fontSize: 16 }} aria-hidden />
                DISCOVER
              </MenuItem>
            )}
            {isZoteroEnabled && (
              <Box sx={{ px: 2, py: 1 }}>
                <ZoteroAuthButton variant="menu" />
              </Box>
            )}
            <Divider />
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {poweredBy}
              </Typography>
            </Box>
          </Menu>
        </>
      ) : (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              '& a': {
                color: contrastText,
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                opacity: 1,
                textShadow: '0 1px 8px rgba(0,0,0,0.45)',
                transition: 'opacity 0.15s',
                '&:hover': { opacity: 1 },
              },
            }}>
            {internalLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
            {/* Leaves the portal, so it is marked as such and opens in a new
                tab rather than replacing the archive the reader is in. */}
            {externalNavLinks.map((link) => (
              <Box
                key={link.href}
                component="a"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {link.label}
                <OpenInNewIcon sx={{ fontSize: 13 }} aria-hidden />
              </Box>
            ))}
            {isChatEnabled && (
              <Box
                component={Link}
                href="/discover"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  border: `1.5px solid ${contrastText}`,
                  borderRadius: '6px',
                  padding: '4px 12px',
                  opacity: '0.85 !important',
                  '&:hover': { opacity: '1 !important', bgcolor: 'rgba(255,255,255,0.1)' },
                }}>
                <AutoAwesomeIcon sx={{ fontSize: 16 }} />
                DISCOVER
              </Box>
            )}
            {isZoteroEnabled && <ZoteroAuthButton />}
          </Box>
          <Typography
            variant="caption"
            color={contrastText}
            sx={{ fontWeight: 500, textShadow: '0 1px 8px rgba(0,0,0,0.45)' }}>
            {poweredBy}
          </Typography>
        </>
      )}
      {collapseToggle}
    </Box>
  );
};
