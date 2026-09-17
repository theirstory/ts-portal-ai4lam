'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box } from '@mui/material';
import { colors } from '@/lib/theme';
import { Citation } from '@/types/chat';
import { ChatCitationChip } from './ChatCitationChip';

type Props = {
  content: string;
  citations?: Citation[];
  messageId?: string;
};

export const ChatMessageContent = ({ content, citations, messageId }: Props) => {
  const citationMap = useMemo(() => {
    const map = new Map<number, Citation>();
    citations?.forEach((c) => map.set(c.index, c));
    return map;
  }, [citations]);

  // Split content around citation patterns like [1], [2], etc. and render them as chips
  const renderContentWithCitations = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const index = parseInt(match[1], 10);
        const citation = citationMap.get(index);
        if (citation) {
          return <ChatCitationChip key={i} citation={citation} siblings={citations} messageId={messageId} />;
        }
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  if (!content) {
    return (
      <Box sx={{ display: 'flex', gap: 0.5, py: 0.5 }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled', animation: 'pulse 1.4s infinite', '@keyframes pulse': { '0%, 100%': { opacity: 0.3 }, '50%': { opacity: 1 } } }} />
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled', animation: 'pulse 1.4s infinite 0.2s', '@keyframes pulse': { '0%, 100%': { opacity: 0.3 }, '50%': { opacity: 1 } } }} />
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled', animation: 'pulse 1.4s infinite 0.4s', '@keyframes pulse': { '0%, 100%': { opacity: 0.3 }, '50%': { opacity: 1 } } }} />
      </Box>
    );
  }

  return (
    <Box
      // Tables come back from the model often — a comparison of recordings, a
      // list of speakers and dates — and unstyled they render as rows with no
      // edges. They can also be wider than the chat column, so each one gets
      // its own horizontal scroll rather than stretching the conversation.
      sx={{
        '& table': {
          borderCollapse: 'collapse',
          width: 'auto',
          minWidth: '50%',
          my: 1.5,
          fontSize: '0.875rem',
        },
        '& th, & td': {
          border: `1px solid ${colors.common.border}`,
          px: 1.25,
          py: 0.75,
          textAlign: 'left',
          verticalAlign: 'top',
        },
        '& th': { backgroundColor: colors.background.subtle, fontWeight: 700 },
        '& .markdown-table-scroll': { overflowX: 'auto', maxWidth: '100%' },
        '& p:first-of-type': { mt: 0 },
        '& p:last-of-type': { mb: 0 },
      }}>
      <ReactMarkdown
        // GitHub-flavoured markdown: tables, strikethrough, task lists and bare
        // URLs are all extensions, and without this the model's tables arrived
        // as the pipes and dashes it wrote them with.
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <Box className="markdown-table-scroll">
              <table>{children}</table>
            </Box>
          ),
          p: ({ children }) => {
            // Process children to replace citation patterns with chips
            const processed = React.Children.map(children, (child) => {
              if (typeof child === 'string') {
                return <>{renderContentWithCitations(child)}</>;
              }
              return child;
            });
            return <p>{processed}</p>;
          },
          li: ({ children }) => {
            const processed = React.Children.map(children, (child) => {
              if (typeof child === 'string') {
                return <>{renderContentWithCitations(child)}</>;
              }
              return child;
            });
            return <li>{processed}</li>;
          },
          td: ({ children }) => {
            // Citations land in table cells too, and a chip is how they read
            // everywhere else in the answer.
            const processed = React.Children.map(children, (child) => {
              if (typeof child === 'string') {
                return <>{renderContentWithCitations(child)}</>;
              }
              return child;
            });
            return <td>{processed}</td>;
          },
          strong: ({ children }) => {
            const processed = React.Children.map(children, (child) => {
              if (typeof child === 'string') {
                return <>{renderContentWithCitations(child)}</>;
              }
              return child;
            });
            return <strong>{processed}</strong>;
          },
        }}>
        {content}
      </ReactMarkdown>
    </Box>
  );
};
