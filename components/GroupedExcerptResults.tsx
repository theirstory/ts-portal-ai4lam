'use client';

import React, { useMemo, useState } from 'react';
import { Box, Collapse, IconButton, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useRouter } from 'next/navigation';
import { Chunks } from '@/types/weaviate';
import { colors } from '@/lib/theme';
import { normalizeTimedNerData } from '@/types/ner';
import { getMuxThumbnailUrl } from '@/lib/muxThumbnail';

export type ExcerptGroupingSource = Partial<Chunks>;

/** Matches the convention used across TheirStory portals for search marking. */
const HIGHLIGHT_COLOR = '#fde047';

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

/**
 * Splits an excerpt around the entity mentions so they can be marked, without
 * regex over user text — offsets come from the stored mention text itself.
 */
const highlightParts = (text: string, terms: string[]) => {
  if (!text || terms.length === 0) return [{ text, match: false }];

  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];

  terms.forEach((term) => {
    const needle = term.toLowerCase();
    if (needle.length < 2) return;
    let from = 0;
    for (;;) {
      const index = lower.indexOf(needle, from);
      if (index === -1) break;
      ranges.push([index, index + needle.length]);
      from = index + needle.length;
    }
  });

  if (!ranges.length) return [{ text, match: false }];

  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  ranges.forEach(([start, end]) => {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
      return;
    }
    merged.push([start, end]);
  });

  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  merged.forEach(([start, end]) => {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    cursor = end;
  });
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
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

    excerpts.forEach((excerpt) => {
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
  }, [excerpts]);

  if (!groups.length) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">{emptyMessage ?? 'No excerpts found.'}</Typography>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {groups.map((group) => {
        const isCollapsed = Boolean(collapsed[group.id]);
        return (
          <Box
            key={group.id}
            sx={{ border: `1px solid ${colors.common.border}`, borderRadius: '8px', overflow: 'hidden' }}>
            <Box
              onClick={() => setCollapsed((current) => ({ ...current, [group.id]: !current[group.id] }))}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                cursor: 'pointer',
                bgcolor: colors.background.subtle,
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
                        {highlightParts(text, terms).map((part, partIndex) =>
                          part.match ? (
                            <Box
                              key={partIndex}
                              component="mark"
                              sx={{ bgcolor: HIGHLIGHT_COLOR, color: 'inherit', px: 0.25, borderRadius: '2px' }}>
                              {part.text}
                            </Box>
                          ) : (
                            <React.Fragment key={partIndex}>{part.text}</React.Fragment>
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
  );
};
