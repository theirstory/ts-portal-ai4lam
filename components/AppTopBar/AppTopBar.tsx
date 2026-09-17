'use client';
import React, { useEffect, useRef } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import { LogoArchive } from '@/app/assets/svg/LogoArchive';
import { CarouselTopBar } from '../CarouselTopBar/CarouselTopBar';
import useLayoutState from '@/app/stores/useLayout';
import { usePathname, useSearchParams } from 'next/navigation';
import { config, organizationConfig } from '@/config/organizationConfig';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { colors } from '@/lib/theme';
import { TopBarNav } from './TopBarNav';
import { useNavOverflow } from './useNavOverflow';

export interface NavLink {
  name: string;
  href: string;
  icon?: React.ReactElement;
}

export const AppTopBar = () => {
  const { setTopBarCollapsedAuto, setTopBarCollapsedManual, resetTopBarPreference, isTopBarCollapsed } =
    useLayoutState();
  const { collections, loadCollections } = useSemanticSearchStore();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';

  const isStoryPage = pathname.startsWith('/story/');
  const isChatPage = pathname.startsWith('/discover');
  const isIndexPage = pathname.startsWith('/indexes');
  const isFullScreenPage = isStoryPage || isChatPage;
  const isAutoCollapsePage = isStoryPage || isChatPage || isIndexPage;
  const isHeaderOverlayEnabled = config?.ui?.portalHeaderOverlay?.enabled ?? true;
  const organizationLogoPath = config.organization.logo?.path?.trim();
  const shouldUseCustomLogo = Boolean(organizationLogoPath);
  const logoAlt = config.organization.logo?.alt?.trim() || `${config.organization.displayName} logo`;

  const handleTopBarCollapseToggle = () => {
    setTopBarCollapsedManual(!isTopBarCollapsed);
  };

  useEffect(() => {
    resetTopBarPreference();
  }, [pathname, resetTopBarPreference]);

  useEffect(() => {
    if (isAutoCollapsePage) {
      setTopBarCollapsedAuto(true);
      return;
    }
    setTopBarCollapsedAuto(false);
  }, [isAutoCollapsePage, setTopBarCollapsedAuto]);

  useEffect(() => {
    if (collections.length === 0) {
      loadCollections();
    }
  }, [collections.length, loadCollections]);

  const shouldShowCollectionsLink = collections.length > 1;
  const topRowRef = useRef<HTMLDivElement | null>(null);
  // Remeasure from scratch whenever the row's contents change, since the
  // width it needs changes with them.
  const isNavCompact = useNavOverflow(
    topRowRef,
    `${shouldShowCollectionsLink}|${isFullScreenPage}|${shouldUseCustomLogo}`,
  );

  // After the hooks, not before them: an embed that toggled this early return
  // would otherwise change how many hooks the component runs between renders.
  if (isEmbed) return null;

  return (
    <AppBar
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        boxShadow: 'none',
        backgroundColor: 'transparent',
      }}
      elevation={0}>
      <Toolbar
        disableGutters
        sx={{
          justifyContent: 'space-between',
          backgroundColor: 'transparent',
          boxShadow: 'none',
          paddingLeft: 0,
          paddingRight: 0,
        }}>
        <CarouselTopBar isCollapsed={isTopBarCollapsed}>
          {/* The row the nav measures itself against: its children never shrink,
              so when they stop fitting it overflows — which is the signal the
              hook watches for — instead of silently wrapping to a second line. */}
          <Box ref={topRowRef} display="flex" justifyContent="space-between" alignItems="center" gap={1.5}>
            <Link
              href="/"
              style={{ textDecoration: 'none', cursor: 'pointer', flexShrink: 0 }}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = '/';
              }}>
              <Box sx={{ display: 'flex', alignItems: 'center', height: 40, flexShrink: 0 }}>
                {shouldUseCustomLogo ? (
                  <Box
                    component="img"
                    src={organizationLogoPath}
                    alt={logoAlt}
                    sx={{ maxHeight: 40, maxWidth: { xs: 118, sm: 140, md: 220 }, width: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <LogoArchive
                    color={config.theme.colors.primary.contrastText}
                    text={config.organization.displayName}
                  />
                )}
              </Box>
            </Link>
            <TopBarNav
              isCompact={isNavCompact}
              shouldShowCollectionsLink={shouldShowCollectionsLink}
              isTopBarCollapsed={isTopBarCollapsed}
              isFullScreenPage={isFullScreenPage}
              onToggleCollapse={handleTopBarCollapseToggle}
            />
          </Box>
          <Box
            id="top-bar-info"
            display="flex"
            justifyContent="space-between"
            alignItems="flex-end"
            aria-hidden={isTopBarCollapsed}
            sx={{
              maxHeight: isTopBarCollapsed ? 0 : { xs: 220, md: 260 },
              opacity: isTopBarCollapsed ? 0 : 1,
              transform: isTopBarCollapsed ? 'translateY(-10px)' : 'translateY(0)',
              overflow: 'hidden',
              pointerEvents: isTopBarCollapsed ? 'none' : 'auto',
              transition: 'max-height 0.65s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease, transform 0.45s ease',
            }}>
            <Box
              // A tab stop on the hero, so a keyboard user reaches the name and
              // description of what they are looking at rather than skipping
              // from the nav straight into results.
              //
              // Removed from the tab order while the hero is collapsed: the
              // container is aria-hidden and clipped to zero height then, and a
              // focusable element inside that is both an accessibility error and
              // a way to send focus somewhere invisible.
              tabIndex={isTopBarCollapsed ? -1 : 0}
              role="group"
              aria-label={`${organizationConfig.displayName}, portal overview`}
              sx={{
                // Focus has to be visible, or this reads as focus vanishing.
                '&:focus-visible': {
                  outline: `2px solid ${config.theme.colors.primary.contrastText}`,
                  outlineOffset: '3px',
                },
                ...(isHeaderOverlayEnabled
                  ? {
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      width: 'fit-content',
                      maxWidth: 'min(100%, 980px)',
                      backgroundColor: colors.common.overlay,
                      backdropFilter: 'blur(2px)',
                      borderRadius: '8px',
                      px: '14px',
                      py: '10px',
                    }
                  : {}),
              }}>
              <Typography
                variant="h4"
                fontWeight={700}
                color={config.theme.colors.primary.contrastText}
                sx={{
                  mb: 1,
                  fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' },
                  lineHeight: { xs: 1.2, md: 1.167 },
                }}>
                {organizationConfig.displayName}
              </Typography>
              <Typography
                variant="body1"
                color={config.theme.colors.primary.contrastText}
                sx={{
                  maxWidth: 700,
                  fontSize: { xs: '0.875rem', md: '1rem' },
                  lineHeight: { xs: 1.4, md: 1.5 },
                }}>
                {organizationConfig.description}
              </Typography>
            </Box>
            <Typography
              fontSize="11px"
              fontWeight={500}
              variant="body1"
              color={config.theme.colors.primary.contrastText}
              sx={{ display: { xs: 'none', md: 'block' }, ml: 2 }}>
              {organizationConfig.name}
            </Typography>
          </Box>
        </CarouselTopBar>
      </Toolbar>
    </AppBar>
  );
};
