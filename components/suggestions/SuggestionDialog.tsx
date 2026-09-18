'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
  TextField,
  Typography,
} from '@mui/material';
import { useSuggestionStore } from '@/app/stores/useSuggestionStore';
import { suggestionsRepositoryUrl } from '@/config/organizationConfig';
import { SUGGESTION_KIND_LABELS, SUGGESTION_LIMITS } from '@/types/suggestion';
import { colors } from '@/lib/theme';

/**
 * Collects a suggested correction and files it.
 *
 * Mounted once for the whole app; every surface opens it through the store,
 * carrying the context of what the reader was looking at, so nobody has to
 * describe where they found the problem.
 */
export const SuggestionDialog = () => {
  const context = useSuggestionStore((state) => state.context);
  const closeSuggestion = useSuggestionStore((state) => state.closeSuggestion);

  const [comment, setComment] = useState('');
  const [submitter, setSubmitter] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<{ number: number; url: string } | null>(null);

  // A new context is a new suggestion, so nothing carries over from the last.
  useEffect(() => {
    if (context) {
      setComment('');
      setError(null);
      setFiled(null);
    }
  }, [context]);

  if (!context) return null;

  const submit = async () => {
    setIsSending(true);
    setError(null);
    try {
      const response = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...context, comment, submitter: submitter.trim() || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'Could not send the suggestion. Please try again.');
        return;
      }
      setFiled(data as { number: number; url: string });
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const detail = [
    context.recordingTitle,
    context.entityText && `${context.entityText}${context.entityLabel ? ` (${context.entityLabel})` : ''}`,
    context.field,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Dialog open onClose={isSending ? undefined : closeSuggestion} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Suggest an edit
        <Typography component="div" sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>
          {SUGGESTION_KIND_LABELS[context.kind]}
          {detail ? ` · ${detail}` : ''}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {filed ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            Thank you — this is now{' '}
            <MuiLink href={filed.url} target="_blank" rel="noopener noreferrer">
              issue #{filed.number}
            </MuiLink>{' '}
            for the archivists to review.
          </Alert>
        ) : (
          <>
            {context.quotedText && (
              <Box
                sx={{
                  mb: 2,
                  p: 1.5,
                  borderLeft: `3px solid ${colors.common.border}`,
                  bgcolor: colors.background.subtle,
                  maxHeight: 160,
                  overflowY: 'auto',
                }}>
                <Typography sx={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{context.quotedText}</Typography>
              </Box>
            )}

            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={3}
              required
              label="What should change?"
              placeholder="For example: the speaker says “FADGI”, not “fad gee”."
              value={comment}
              onChange={(event) => setComment(event.target.value.slice(0, SUGGESTION_LIMITS.comment))}
              helperText={`${comment.length}/${SUGGESTION_LIMITS.comment}`}
            />

            <TextField
              fullWidth
              label="Your name or email (optional)"
              placeholder="So we can follow up if we have a question"
              value={submitter}
              onChange={(event) => setSubmitter(event.target.value.slice(0, SUGGESTION_LIMITS.submitter))}
              sx={{ mt: 2 }}
            />

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 2 }}>
              Suggestions are filed publicly as issues on{' '}
              {suggestionsRepositoryUrl ? (
                <MuiLink href={suggestionsRepositoryUrl} target="_blank" rel="noopener noreferrer">
                  the project&apos;s GitHub
                </MuiLink>
              ) : (
                "the project's GitHub"
              )}
              , where anyone can read them.
            </Typography>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={closeSuggestion} disabled={isSending} sx={{ textTransform: 'none' }}>
          {filed ? 'Close' : 'Cancel'}
        </Button>
        {!filed && (
          <Button
            variant="contained"
            onClick={submit}
            disabled={isSending || comment.trim().length < 3}
            startIcon={isSending ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none' }}>
            {isSending ? 'Sending…' : 'Send suggestion'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
