'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Paper } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { isZoteroEnabled, isChatEnabled, isSuggestionsEnabled } from '@/config/organizationConfig';
import { useZoteroStore } from '@/app/stores/useZoteroStore';
import { ZoteroIcon } from '@/components/zotero/ZoteroIcon';
import { useSuggestionStore } from '@/app/stores/useSuggestionStore';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onAskAI?: (query: string) => void;
  onZoteroSave?: (selectedText: string, startTime: number, endTime: number) => void;
};

function getSelectionTimeRange(container: HTMLElement): { startTime: number; endTime: number } | null {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return null;

  const range = selection.getRangeAt(0);
  const wordSpans = container.querySelectorAll<HTMLElement>('span[data-word-start]');
  let minStart = Infinity;
  let maxEnd = -Infinity;
  let found = false;

  for (const span of wordSpans) {
    if (range.intersectsNode(span)) {
      const start = parseFloat(span.dataset.wordStart || '');
      const end = parseFloat(span.dataset.wordEnd || '');
      if (!isNaN(start) && !isNaN(end)) {
        minStart = Math.min(minStart, start);
        maxEnd = Math.max(maxEnd, end);
        found = true;
      }
    }
  }

  return found ? { startTime: minStart, endTime: maxEnd } : null;
}

type SelectedSection = { start?: number; title?: string };

/**
 * The chapter heading a selection falls inside, if any.
 *
 * An index entry is a claim about the recording just as a transcript line is,
 * and it is just as capable of being wrong — so selecting a chapter title or
 * its synopsis has to raise a correction about that chapter rather than about
 * the words of the transcript, which are not what the reader highlighted.
 */
function getSelectedSection(container: HTMLElement): SelectedSection | null {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return null;

  const node = selection.getRangeAt(0).commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  const summary = element?.closest<HTMLElement>('[data-section-start]');
  if (!summary || !container.contains(summary)) return null;

  const start = parseFloat(summary.dataset.sectionStart || '');
  return {
    start: Number.isFinite(start) ? start : undefined,
    title: summary.dataset.sectionTitle || undefined,
  };
}

const formatTimestamp = (seconds?: number) => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.floor(seconds));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

export const StoryTranscriptSelectionPopover = ({ containerRef, onAskAI, onZoteroSave }: Props) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [timeRange, setTimeRange] = useState<{ startTime: number; endTime: number } | null>(null);
  const [section, setSection] = useState<SelectedSection | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = useZoteroStore((s) => s.isAuthenticated);
  const showZotero = isZoteroEnabled && isAuthenticated;
  const openSuggestion = useSuggestionStore((state) => state.openSuggestion);
  const storyHubPage = useSemanticSearchStore((state) => state.storyHubPage);

  const dismiss = () => {
    setPosition(null);
    setSelectedText('');
    setTimeRange(null);
    setSection(null);
  };

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';

      if (text.length < 3) {
        dismiss();
        return;
      }

      const range = selection?.getRangeAt(0);
      if (!range) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      setPosition({
        top: rect.top - containerRect.top + container.scrollTop - 44,
        left: rect.left - containerRect.left + container.scrollLeft + rect.width / 2,
      });
      setSelectedText(text);
      setTimeRange(getSelectionTimeRange(container));
      setSection(getSelectedSection(container));
    }, 10);
  }, [containerRef]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (popoverRef.current?.contains(e.target as Node)) return;
    dismiss();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef, handleMouseUp, handleMouseDown]);

  const handleAskAI = () => {
    if (!selectedText) return;
    onAskAI?.(selectedText);
    dismiss();
    window.getSelection()?.removeAllRanges();
  };

  const handleZoteroSave = () => {
    if (!selectedText || !timeRange) return;
    onZoteroSave?.(selectedText, timeRange.startTime, timeRange.endTime);
    dismiss();
  };

  // Selecting the words that are wrong is the whole description of a
  // transcript error, so the correction starts from the same selection the
  // other actions use.
  const handleSuggest = () => {
    if (!selectedText) return;
    const recording = {
      recordingId: storyHubPage?.uuid,
      recordingTitle: storyHubPage?.properties?.interview_title as string | undefined,
    };

    openSuggestion(
      section
        ? {
            kind: 'index',
            quotedText: selectedText,
            ...recording,
            startTime: section.start,
            field: [section.title, formatTimestamp(section.start) && `at ${formatTimestamp(section.start)}`]
              .filter(Boolean)
              .join(' '),
          }
        : {
            kind: 'transcript',
            quotedText: selectedText,
            ...recording,
            startTime: timeRange?.startTime,
            endTime: timeRange?.endTime,
          },
    );
    dismiss();
    window.getSelection()?.removeAllRanges();
  };

  const showAskAI = isChatEnabled;
  const showZoteroButton = showZotero && timeRange;
  const showSuggest = isSuggestionsEnabled;

  if (!position || !selectedText) return null;
  if (!showAskAI && !showZoteroButton && !showSuggest) return null;

  return (
    <Paper
      ref={popoverRef}
      elevation={4}
      sx={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
        zIndex: 1300,
        borderRadius: 2,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
      }}>
      {showAskAI && (
        <Button
          size="small"
          startIcon={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
          onClick={handleAskAI}
          sx={{
            textTransform: 'none',
            px: 1.5,
            py: 0.75,
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
            borderRadius: 0,
            borderRight: showZoteroButton || showSuggest ? '1px solid' : 'none',
            borderColor: 'divider',
          }}>
          Ask AI
        </Button>
      )}
      {showZoteroButton && (
        <Button
          size="small"
          startIcon={<ZoteroIcon size={14} />}
          onClick={handleZoteroSave}
          sx={{
            textTransform: 'none',
            px: 1.5,
            py: 0.75,
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
            borderRadius: 0,
            borderRight: showSuggest ? '1px solid' : 'none',
            borderColor: 'divider',
          }}>
          Zotero
        </Button>
      )}
      {showSuggest && (
        <Button
          size="small"
          startIcon={<EditNoteIcon sx={{ fontSize: 16 }} />}
          onClick={handleSuggest}
          sx={{
            textTransform: 'none',
            px: 1.5,
            py: 0.75,
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
            borderRadius: 0,
          }}>
          {section ? 'Suggest a correction to this chapter' : 'Suggest a correction'}
        </Button>
      )}
    </Paper>
  );
};
