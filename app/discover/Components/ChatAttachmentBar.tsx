'use client';

import React, { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Popover,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import LinkIcon from '@mui/icons-material/Link';
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
 * Lets a reader put their own material in front of the model — a paper they are
 * writing against, a page describing the project, a photograph of a document —
 * and shows what is currently attached.
 *
 * It says plainly that attachments are sent to the model. That is not a detail
 * a reader should have to infer from the fact that the model can read them.
 */
export const ChatAttachmentBar = ({ compact = false }: { compact?: boolean }) => {
  const attachments = useChatStore((state) => state.attachments);
  const isAttaching = useChatStore((state) => state.isAttaching);
  const error = useChatStore((state) => state.attachmentError);
  const addFile = useChatStore((state) => state.addAttachmentFile);
  const addUrl = useChatStore((state) => state.addAttachmentUrl);
  const remove = useChatStore((state) => state.removeAttachment);
  const setError = useChatStore((state) => state.setAttachmentError);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkAnchor, setLinkAnchor] = useState<null | HTMLElement>(null);
  const [linkValue, setLinkValue] = useState('');

  if (!isChatAttachmentsEnabled) return null;

  const submitLink = async () => {
    const url = linkValue.trim();
    if (!url) return;
    setLinkAnchor(null);
    setLinkValue('');
    await addUrl(url);
  };

  return (
    <Box sx={{ px: compact ? 1 : 0, pt: compact ? 1 : 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <Tooltip title="Attach a file — PDF, Word, text or image">
          <span>
            <IconButton size="small" onClick={() => fileInputRef.current?.click()} disabled={isAttaching}>
              <AttachFileIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Add a public link the portal can read">
          <span>
            <IconButton size="small" onClick={(event) => setLinkAnchor(event.currentTarget)} disabled={isAttaching}>
              <LinkIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {isAttaching && <CircularProgress size={14} sx={{ ml: 0.5 }} />}

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

      {attachments.length > 0 && (
        <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mt: 0.5 }}>
          Attachments are sent to the AI model along with your question, and are dropped when you clear the chat.
        </Typography>
      )}

      {error && (
        <Alert severity="warning" onClose={() => setError(null)} sx={{ mt: 1, py: 0, fontSize: '0.8125rem' }}>
          {error}
        </Alert>
      )}

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

      <Popover
        open={Boolean(linkAnchor)}
        anchorEl={linkAnchor}
        onClose={() => setLinkAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 2, width: 340 }}>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, mb: 1 }}>Add a link</Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="https://example.org/about"
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submitLink();
              }
            }}
          />
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mt: 1 }}>
            The page has to be public. A Google Doc works if it is shared as “anyone with the link”.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1.5 }}>
            <Button size="small" onClick={() => setLinkAnchor(null)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button size="small" variant="contained" onClick={submitLink} sx={{ textTransform: 'none' }}>
              Add
            </Button>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
};
