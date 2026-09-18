'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Link from 'next/link';
import { VideoThumbnail } from './VideoThumbnail';
import { durationFormatHandler, formatTime } from '@/app/utils/util';
import { colors } from '@/lib/theme';
import { highlightSearchText } from '@/app/indexes/highlightSearch';
import { SuggestCorrectionButton } from '@/components/suggestions/SuggestCorrectionButton';
import { buildStoryShareUrl } from '@/lib/share';
import type { IndexesStory, IndexChapter } from '@/app/api/indexes/route';
import type { WeaviateGenericObject } from 'weaviate-client';
import type { Testimonies } from '@/types/weaviate';

function storyToThumbnailStory(story: IndexesStory): WeaviateGenericObject<Testimonies, any> {
  return {
    uuid: story.uuid,
    properties: {
      video_url: story.video_url,
      interview_title: story.interview_title,
      interview_duration: story.interview_duration,
      isAudioFile: story.isAudioFile,
      interview_description: story.interview_description,
      ner_labels: story.ner_labels,
      collection_id: story.collection_id,
      collection_name: story.collection_name,
      collection_description: story.collection_description,
      folder_id: story.folder_id,
      folder_name: story.folder_name,
      folder_path: story.folder_path,
      recording_date: '',
      transcoded: '',
      transcription: '',
      ner_data: null,
      participants: null,
      publisher: '',
      hasChunks: null,
    },
    metadata: {},
    references: {},
    vectors: {},
  } as WeaviateGenericObject<Testimonies, any>;
}

export function IndexesListView({
  stories,
  chaptersByStoryId,
  searchQuery = '',
}: {
  stories: IndexesStory[];
  chaptersByStoryId: Record<string, IndexChapter[]>;
  searchQuery?: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        pb: 2,
        maxWidth: 860,
        width: '100%',
      }}>
      {stories.map((story, index) => {
        const chapters = chaptersByStoryId[story.uuid] ?? [];
        const storyForThumb = storyToThumbnailStory(story);
        return (
          <React.Fragment key={story.uuid}>
            {index > 0 && <Divider sx={{ my: 2 }} />}
            <Box sx={{ bgcolor: 'transparent' }}>
              {/* The control sits beside the link rather than inside it: a
                  button nested in an anchor is invalid, and clicking it should
                  not open the recording. */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Link
                  href={`/story/${story.uuid}`}
                  style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 2,
                      py: 1.5,
                      px: 0,
                      '&:hover': { bgcolor: 'transparent' },
                    }}>
                    <Box sx={{ width: 100, flexShrink: 0 }}>
                      <VideoThumbnail
                        story={storyForThumb}
                        aspectRatio={16 / 9}
                        fontSize={9}
                        audioFileSize={{ width: '36', height: '20' }}
                      />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }} component="span">
                        {highlightSearchText(story.interview_title, searchQuery)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {story.folder_name
                          ? `${story.collection_name || story.collection_id} / ${story.folder_name}`
                          : story.collection_name || story.collection_id}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {durationFormatHandler(story.interview_duration)} — {chapters.length} chapter
                        {chapters.length !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                  </Box>
                </Link>
                <SuggestCorrectionButton
                  context={{
                    kind: 'index',
                    recordingId: story.uuid,
                    recordingTitle: story.interview_title,
                    field: 'Index entry',
                    quotedText: story.interview_title,
                    // The recording itself, not the /indexes page the reader
                    // happened to raise it from.
                    pageUrl: buildStoryShareUrl({ storyId: story.uuid }),
                  }}
                />
              </Box>
              {chapters.length > 0 && (
                <Box
                  sx={{
                    py: 0.5,
                    pl: 2.5,
                    borderLeft: `3px solid ${colors.grey[300]}`,
                    ml: 0.5,
                  }}>
                  {chapters.map((ch) => (
                    <Box
                      key={`${story.uuid}-${ch.section_id}`}
                      sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 1 }}>
                      <Link
                        href={`/story/${story.uuid}?start=${ch.start_time}`}
                        style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}>
                        <Box
                          sx={{
                            py: 1.5,
                            px: 1.5,
                            borderRadius: 1,
                            bgcolor: colors.background.paper,
                            border: `1px solid ${colors.common.border}`,
                            boxShadow: `0 1px 2px ${colors.common.shadow}`,
                            '&:hover': { bgcolor: colors.grey[50] },
                          }}>
                          <Typography variant="body2" color="text.secondary" component="span" sx={{ mr: 1 }}>
                            {formatTime(ch.start_time)}
                          </Typography>
                          <Typography variant="body2" component="span" fontWeight={500}>
                            {highlightSearchText(ch.section_title, searchQuery)}
                          </Typography>
                          {ch.synopsis && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              component="span"
                              sx={{
                                mt: 0.5,
                                fontSize: '0.8125rem',
                                lineHeight: 1.4,
                                display: 'block',
                              }}>
                              {highlightSearchText(ch.synopsis, searchQuery)}
                            </Typography>
                          )}
                          {ch.keywords && ch.keywords.length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                              {ch.keywords.map((kw) => (
                                <Chip
                                  key={kw}
                                  label={kw}
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    height: 22,
                                    fontSize: '0.75rem',
                                    '& .MuiChip-label': { px: 0.75 },
                                  }}
                                />
                              ))}
                            </Box>
                          )}
                        </Box>
                      </Link>
                      <SuggestCorrectionButton
                        context={{
                          kind: 'index',
                          recordingId: story.uuid,
                          recordingTitle: story.interview_title,
                          field: `Chapter at ${formatTime(ch.start_time)}`,
                          quotedText: [ch.section_title, ch.synopsis].filter(Boolean).join('\n\n'),
                          startTime: ch.start_time,
                          // Opens the recording where the chapter starts.
                          pageUrl: buildStoryShareUrl({ storyId: story.uuid, startTime: ch.start_time }),
                        }}
                        />
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
