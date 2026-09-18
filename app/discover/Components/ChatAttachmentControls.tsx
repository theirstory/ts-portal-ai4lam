'use client';

import React, { useRef } from 'react';
import { Alert, Box, Chip, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import { useChatStore } from '@/app/stores/useChatStore';
import { isChatAttachmentsEnabled } from '@/config/organizationConfig';

const ACCEPTED = '.pdf,.docx,.txt,.md,.csv,.tsv,.json,image/jpeg,image/png,image/gif,image/webp';

const kindIcon = {
  document: <DescriptionOutlinedIcon fontSize="small" />,
  image: <ImageOutlinedIcon fontSize="small" />,
  webpage: <PublicOutlinedIcon fontSize="small" />,
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * The attach control, for inside the composer.
 *
 * There is no companion control for links: a reader pastes one into the message
 * and the portal reads it, which is what pasting a link into a chat already
 * looks like everywhere else.
 */
export const AttachFileButton = ({ compact = false }: { compact?: boolean }) => {
  const isAttaching = useChatStore((state) => state.isAttaching);
  const addFile = useChatStore((state) => state.addAttachmentFile);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isChatAttachmentsEnabled) return null;

  return (
    <>
      <Tooltip title="Attach a file — PDF, Word, text or image">
        <span>
          <IconButton
            size={compact ? 'small' : 'medium'}
            onClick={() => fileInputRef.current?.click()}
            disabled={isAttaching}
            aria-label="Attach a file"
            sx={{
              // The button's own padding (8px, or 5px when small) and the
              // paperclip's internal whitespace together push the visible icon
              // about a dozen pixels inside the field, which read as the text
              // above it being misaligned. Pulled back so the two share an
              // optical left edge; the hit area is unchanged.
              ml: compact ? '-9px' : '-12px',
            }}>
            {isAttaching ? <CircularProgress size={16} /> : <AttachFileIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          // Reset first: choosing the same file twice in a row should still fire.
          event.target.value = '';
          if (file) await addFile(file);
        }}
      />
    </>
  );
};

/**
 * What is currently attached, above the composer.
 *
 * Renders nothing at all when there is nothing attached — an empty row of
 * controls above an empty message box is clutter with no meaning.
 */
export const ChatAttachmentChips = ({ compact = false }: { compact?: boolean }) => {
  const attachments = useChatStore((state) => state.attachments);
  const error = useChatStore((state) => state.attachmentError);
  const remove = useChatStore((state) => state.removeAttachment);
  const setError = useChatStore((state) => state.setAttachmentError);

  if (!isChatAttachmentsEnabled) return null;
  if (!attachments.length && !error) return null;

  return (
    <Box sx={{ px: compact ? 1 : 0, pt: compact ? 1 : 0 }}>
      {attachments.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          {attachments.map((attachment) => (
            <Chip
              key={attachment.id}
              size="small"
              icon={kindIcon[attachment.kind]}
              label={
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.5 }}>
                  <Box component="span" sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {attachment.name}
                  </Box>
                  <Box component="span" sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>
                    {formatBytes(attachment.bytes)}
                    {attachment.truncated ? ' · shortened' : ''}
                  </Box>
                </Box>
              }
              onDelete={() => remove(attachment.id)}
              sx={{ maxWidth: '100%' }}
            />
          ))}
        </Box>
      )}

      {attachments.length > 0 && (
        <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mt: 0.5 }}>
          Sent to the AI model with your question, and dropped when you clear the chat.
        </Typography>
      )}

      {error && (
        <Alert severity="warning" onClose={() => setError(null)} sx={{ mt: 1, py: 0, fontSize: '0.8125rem' }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};
