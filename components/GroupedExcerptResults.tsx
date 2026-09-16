'use client';

import React, { useMemo, useState } from 'react';
import { Box, Collapse, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import ClearIcon from '@mui/icons-material/Clear';
import { useRouter } from 'next/navigation';
import { Chunks } from '@/types/weaviate';
import { colors } from '@/lib/theme';
import { normalizeTimedNerData } from '@/types/ner';
import { getMuxThumbnailUrl } from '@/lib/muxThumbnail';

export type ExcerptGroupingSource = Partial<Chunks>;

const excerptThumbnail = (videoUrl?: string, startTime?: number) => {
  const src = getMuxThumbnailUrl(videoUrl, startTime ?? 0, { width: 160 });
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
    />
  );
};

const formatTimestamp = (seconds?: number) => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
};

/** Marks entity mentions; the narrowing term gets its own colour. */
const HIGHLIGHT_COLOR = '#fde047';
const FILTER_HIGHLIGHT_COLOR = '#a5d8ff';

type HighlightPart = { text: string; kind: 'none' | 'entity' | 'filter' };

/**
 * Splits an excerpt around the terms to mark, without regex over user text —
 * offsets come from indexOf on the term itself, so a filter containing regex
 * metacharacters cannot break the render or match the wrong thing.
 *
 * Entity mentions and the narrowing term are marked in different colours: they
 * answer different questions, and one colour for both would leave a reader
 * unable to tell why any given word is lit up.
 */
export const highlightParts = (text: string, entityTerms: string[], filterTerm?: string): HighlightPart[] => {
  if (!text) return [{ text, kind: 'none' }];

  const lower = text.toLowerCase();
  const ranges: { start: number; end: number; kind: 'entity' | 'filter' }[] = [];

  const collect = (term: string, kind: 'entity' | 'filter') => {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) return;
    let from = 0;
    for (;;) {
      const index = lower.indexOf(needle, from);
      if (index === -1) break;
      ranges.push({ start: index, end: index + needle.length, kind });
      from = index + needle.length;
    }
  };

  entityTerms.forEach((term) => collect(term, 'entity'));
  if (filterTerm) collect(filterTerm, 'filter');

  if (!ranges.length) return [{ text, kind: 'none' }];

  // Longest first at a given position, and the narrowing term wins a tie since
  // it is what the reader just asked to see.
  ranges.sort(
    (a, b) =>
      a.start - b.start ||
      b.end - b.start - (a.end - a.start) ||
      (a.kind === 'filter' ? -1 : 1),
  );

  const accepted: typeof ranges = [];
  ranges.forEach((range) => {
    const last = accepted[accepted.length - 1];
    if (last && range.start < last.end) return;
    accepted.push(range);
  });

  const parts: HighlightPart[] = [];
  let cursor = 0;
  accepted.forEach(({ start, end, kind }) => {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), kind: 'none' });
    parts.push({ text: text.slice(start, end), kind });
    cursor = end;
  });
  if (cursor < text.length) parts.push({ text: text.slice(cursor), kind: 'none' });
  return parts;
};

interface Props {
  excerpts: ExcerptGroupingSource[];
  /** Entity texts to mark within each excerpt. */
  highlightTerms?: string[];
  /** Appended to the story link so the page can restore the entity context. */
  nerFilterParam?: string;
  emptyMessage?: string;
}

/**
 * Search and entity results grouped by the recording they came from.
 *
 * A flat list of excerpts buries which interview each belongs to and repeats
 * the same recording over and over; grouping makes the recording the unit you
 * scan and the excerpts the detail you open. Groups start expanded so results
 * are visible without a click, and collapse to let a reader skim recordings.
 */
export const GroupedExcerptResults = ({ excerpts, highlightTerms = [], nerFilterParam, emptyMessage }: Props) => {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [resultsFilter, setResultsFilter] = useState('');

  const filterTerm = resultsFilter.trim();
  // Narrowing happens over the excerpts already on screen rather than by
  // re-querying, so it stays instant and can only ever reduce what is shown.
  const visibleExcerpts = useMemo(() => {
    if (!filterTerm) return excerpts;
    const needle = filterTerm.toLowerCase();
    return excerpts.filter((excerpt) => String(excerpt.transcription ?? '').toLowerCase().includes(needle));
  }, [excerpts, filterTerm]);

  const groups = useMemo(() => {
    const byRecording = new Map<
      string,
      {
        id: string;
        title: string;
        date?: string;
        thumbnail?: string;
        videoUrl?: string;
        items: ExcerptGroupingSource[];
      }
    >();

    visibleExcerpts.forEach((excerpt) => {
      const id = String(excerpt.theirstory_id ?? '');
      if (!id) return;
      const existing = byRecording.get(id);
      if (existing) {
        existing.items.push(excerpt);
        return;
      }
      byRecording.set(id, {
        id,
        title: String(excerpt.interview_title ?? 'Untitled recording'),
        date: excerpt.recording_date ? String(excerpt.recording_date) : undefined,
        // Stored thumbnails are frequently empty for these recordings, so fall
        // back to a still from the video itself.
        thumbnail:
          (excerpt.thumbnail_url ? String(excerpt.thumbnail_url) : '') ||
          getMuxThumbnailUrl(excerpt.video_url as string | undefined, 10, { width: 160 }) ||
          undefined,
        videoUrl: excerpt.video_url ? String(excerpt.video_url) : undefined,
        items: [excerpt],
      });
    });

    return [...byRecording.values()].map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => Number(a.start_time ?? 0) - Number(b.start_time ?? 0)),
    }));
  }, [visibleExcerpts]);

  const totalExcerpts = excerpts.length;
  const shownExcerpts = visibleExcerpts.length;

  const filterBox = totalExcerpts > 0 && (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
      <TextField
        size="small"
        placeholder="Filter these results..."
        value={resultsFilter}
        onChange={(event) => setResultsFilter(event.target.value)}
        inputProps={{ 'aria-label': 'Filter the results shown' }}
        sx={{ flex: 1, minWidth: 220, maxWidth: 420 }}
        InputProps={{
          // Matches the search field above it, so the two read as inputs of the
          // same kind rather than one appearing disabled against the page.
          style: { backgroundColor: colors.background.default },
          startAdornment: (
            <InputAdornment position="start">
              <FilterAltOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
            </InputAdornment>
          ),
          endAdornment: resultsFilter ? (
            <InputAdornment position="end">
              <IconButton size="small" aria-label="Clear results filter" onClick={() => setResultsFilter('')}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        {filterTerm
          ? `${shownExcerpts} of ${totalExcerpts} ${totalExcerpts === 1 ? 'excerpt' : 'excerpts'}`
          : `${totalExcerpts} ${totalExcerpts === 1 ? 'excerpt' : 'excerpts'}`}
      </Typography>
    </Box>
  );

  if (!groups.length) {
    return (
      <Box>
        {filterBox}
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {filterTerm ? `No excerpts contain "${filterTerm}".` : (emptyMessage ?? 'No excerpts found.')}
          </Typography>
        </Box>
      </Box>
    );
  }

  const openExcerpt = (recordingId: string, excerpt: ExcerptGroupingSource) => {
    const params = new URLSearchParams();
    if (typeof excerpt.start_time === 'number') params.set('start', String(excerpt.start_time));
    if (typeof excerpt.end_time === 'number') params.set('end', String(excerpt.end_time));
    if (nerFilterParam) params.set('nerFilters', nerFilterParam);
    router.push(`/story/${recordingId}?${params.toString()}`);
  };

  return (
    <Box>
      {filterBox}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {groups.map((group) => {
        const isCollapsed = Boolean(collapsed[group.id]);
        return (
          <Box
            key={group.id}
            // No overflow clipping here: it would trap the sticky header
            // inside the group instead of letting it pin to the scroll box.
            sx={{ border: `1px solid ${colors.common.border}`, borderRadius: '8px' }}>
            <Box
              onClick={() => setCollapsed((current) => ({ ...current, [group.id]: !current[group.id] }))}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                cursor: 'pointer',
                // Pins while its own excerpts are on screen, so a reader deep in
                // a long list always knows which recording they are reading and
                // can collapse it without scrolling back up. The next group's
                // header pushes this one away as it arrives.
                position: 'sticky',
                top: 0,
                zIndex: 2,
                borderRadius: '8px 8px 0 0',
                // Opaque: excerpts scroll underneath it.
                bgcolor: colors.background.subtle,
                borderBottom: `1px solid ${colors.common.border}`,
                '&:hover': { bgcolor: 'action.hover' },
              }}>
              <IconButton
                size="small"
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.title}`}
                aria-expanded={!isCollapsed}
                onClick={(event) => {
                  event.stopPropagation();
                  setCollapsed((current) => ({ ...current, [group.id]: !current[group.id] }));
                }}
                sx={{ p: 0.25 }}>
                {isCollapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>

              {group.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.thumbnail}
                  alt=""
                  style={{ width: 64, height: 40, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                />
              )}

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }} noWrap>
                  {group.title}
                </Typography>
                {group.date && (
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{group.date}</Typography>
                )}
              </Box>

              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', flexShrink: 0 }}>
                {group.items.length} {group.items.length === 1 ? 'result' : 'results'}
              </Typography>
            </Box>

            <Collapse in={!isCollapsed} timeout={200} unmountOnExit>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {group.items.map((excerpt, index) => {
                  const text = String(excerpt.transcription ?? '');
                  const mentionTexts = normalizeTimedNerData(excerpt.ner_data).map((ner) => ner.text);
                  const terms = highlightTerms.length ? highlightTerms : mentionTexts;

                  return (
                    <Box
                      key={`${group.id}-${excerpt.start_time ?? index}`}
                      onClick={() => openExcerpt(group.id, excerpt)}
                      sx={{
                        px: 2,
                        py: 1.5,
                        cursor: 'pointer',
                        borderTop: `1px solid ${colors.common.border}`,
                        '&:hover': { bgcolor: 'action.hover' },
                      }}>
                      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                        {excerptThumbnail(group.videoUrl, excerpt.start_time as number | undefined)}
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                          {formatTimestamp(excerpt.start_time as number | undefined)}
                        </Typography>
                        {excerpt.speaker && (
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            · {String(excerpt.speaker)}
                          </Typography>
                        )}
                        {excerpt.section_title && (
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                            · {String(excerpt.section_title)}
                          </Typography>
                        )}
                      </Box>
                      <Typography sx={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                        {highlightParts(text, terms, filterTerm).map((part, partIndex) =>
                          part.kind === 'none' ? (
                            <React.Fragment key={partIndex}>{part.text}</React.Fragment>
                          ) : (
                            <Box
                              key={partIndex}
                              component="mark"
                              sx={{
                                bgcolor: part.kind === 'filter' ? FILTER_HIGHLIGHT_COLOR : HIGHLIGHT_COLOR,
                                color: 'inherit',
                                px: 0.25,
                                borderRadius: '2px',
                              }}>
                              {part.text}
                            </Box>
                          ),
                        )}
                      </Typography>
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Collapse>
          </Box>
        );
      })}
      </Box>
    </Box>
  );
};
