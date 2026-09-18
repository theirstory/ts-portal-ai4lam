'use client';

import { memo, useState } from 'react';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import { ChatMessage as ChatMessageType } from '@/types/chat';
import { ChatMessageContent } from './ChatMessageContent';
import { useChatInteraction } from '@/app/discover/ChatInteractionContext';
import { colors } from '@/lib/theme';
import { buildCitationList } from '@/lib/citation';

type Props = {
  message: ChatMessageType;
};

export const ChatMessage = memo(({ message }: Props) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const { onViewSources } = useChatInteraction();
  const hasSources = !isUser && message.citations && message.citations.length > 0;

  const handleCopy = async () => {
    let text = message.content;

    if (message.citations?.length) {
      // Only what the answer actually cited, in the order the markers appear.
      const citationIndices = Array.from(
        new Set(Array.from(text.matchAll(/\[(\d+)\]/g)).map((m) => parseInt(m[1], 10))),
      ).sort((a, b) => a - b);

      if (citationIndices.length > 0) {
        // Chicago notes carrying a link to the moment quoted, so a passage
        // pasted into a document can be followed back to the recording.
        const footnotes = buildCitationList(message.citations, citationIndices);
        if (footnotes) {
          text = `${text}\n\nSources\n\n${footnotes}`;
        }
      }
    }

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      id={`chat-message-${message.id}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'center',
        width: '100%',
      }}>
      <Box
        id={isUser ? `chat-user-message-${message.id}` : `chat-assistant-message-${message.id}`}
        sx={{
          width: isUser ? 'auto' : '100%',
          maxWidth: isUser ? '85%' : 980,
          px: 2,
          py: 1.5,
          borderRadius: 2,
          bgcolor: isUser ? colors.primary.main : colors.background.paper,
          color: isUser ? colors.primary.contrastText : colors.text.primary,
          boxShadow: isUser ? 'none' : `0 1px 3px ${colors.common.shadow}`,
          '& p': { m: 0 },
          '& p + p': { mt: 1 },
          fontSize: '0.9rem',
          lineHeight: 1.6,
        }}>
        {isUser ? (
          message.content
        ) : (
          <ChatMessageContent content={message.content} citations={message.citations} messageId={message.id} />
        )}
      </Box>
      {!isUser && message.content && (
        <Box
          id={`chat-message-actions-${message.id}`}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, width: '100%', maxWidth: 980 }}>
          <Tooltip title={copied ? 'Copied!' : 'Copy response'} arrow>
            <IconButton
              id={`chat-copy-response-${message.id}`}
              size="small"
              onClick={handleCopy}
              sx={{ color: colors.text.secondary }}>
              {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
          {hasSources && onViewSources && (
            <Button
              id={`chat-inline-sources-${message.id}`}
              size="small"
              startIcon={<FormatListBulletedIcon sx={{ fontSize: 14 }} />}
              onClick={() => onViewSources(message.citations!)}
              sx={{
                textTransform: 'none',
                fontSize: '0.75rem',
                color: colors.text.secondary,
                py: 0.25,
                px: 1,
                minHeight: 0,
                '&:hover': { bgcolor: colors.grey[100] },
              }}>
              View {message.citations!.length} source{message.citations!.length !== 1 ? 's' : ''}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
});

ChatMessage.displayName = 'ChatMessage';
