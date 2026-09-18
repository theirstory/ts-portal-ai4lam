'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { Button, Paper } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditNoteIcon from '@mui/icons-material/EditNote';
import ShareIcon from '@mui/icons-material/Share';
import { isZoteroEnabled, isChatEnabled, isSuggestionsEnabled } from '@/config/organizationConfig';
import { useZoteroStore } from '@/app/stores/useZoteroStore';
import { ZoteroIcon } from '@/components/zotero/ZoteroIcon';
import { useSuggestionStore } from '@/app/stores/useSuggestionStore';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { ShareMenu } from '@/components/share/ShareMenu';
import { buildStoryShareUrl, formatShareTimestamp } from '@/lib/share';

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

  if (found) return { startTime: minStart, endTime: maxEnd };

  // Nothing in the selection was a timed word — a speaker label, say, which is
  // exactly the kind of thing a reader corrects. The paragraph it sits in still
  // knows when it is, and a correction with no moment attached is one an
  // archivist has to go hunting for.
  const node = selection.getRangeAt(0).commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  const paragraph = element?.closest<HTMLElement>('[data-paragraph-start]');
  if (!paragraph || !container.contains(paragraph)) return null;

  const paragraphStart = parseFloat(paragraph.dataset.paragraphStart || '');
  const paragraphEnd = parseFloat(paragraph.dataset.paragraphEnd || '');
  if (!Number.isFinite(paragraphStart)) return null;

  return {
    startTime: paragraphStart,
    endTime: Number.isFinite(paragraphEnd) ? paragraphEnd : paragraphStart,
  };
}

/** Where the selection sits, in the scroll container's own coordinates. */
type SelectionAnchor = { top: number; bottom: number; left: number };

/** Clear of the text it points at, and of the container's edges. */
const POPOVER_GAP = 8;

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
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);
  // Resolved once the popover has been measured, since where it fits depends
  // on how wide it is — and its width changes with which actions are offered.
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [timeRange, setTimeRange] = useState<{ startTime: number; endTime: number } | null>(null);
  const [section, setSection] = useState<SelectedSection | null>(null);
  const [shareAnchor, setShareAnchor] = useState<null | HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = useZoteroStore((s) => s.isAuthenticated);
  const showZotero = isZoteroEnabled && isAuthenticated;
  const openSuggestion = useSuggestionStore((state) => state.openSuggestion);
  const storyHubPage = useSemanticSearchStore((state) => state.storyHubPage);

  const dismiss = () => {
    setAnchor(null);
    setPlacement(null);
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

      setAnchor({
        top: rect.top - containerRect.top + container.scrollTop,
        bottom: rect.bottom - containerRect.top + container.scrollTop,
        left: rect.left - containerRect.left + container.scrollLeft + rect.width / 2,
      });
      setPlacement(null);
      setSelectedText(text);
      setTimeRange(getSelectionTimeRange(container));
      setSection(getSelectedSection(container));
    }, 10);
  }, [containerRef]);

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      // The share menu is a portal outside this element, so a click on it
      // would otherwise dismiss the popover the menu belongs to.
      if (shareAnchor) return;
      dismiss();
    },
    [shareAnchor],
  );

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

  /**
   * Keeps the popover inside the panel.
   *
   * It used to sit a fixed 44px above the selection, which put it off the top
   * of the scroll container — and behind the toolbar — for anything selected
   * in the first chapter. It now flips below the selection when there is no
   * room above, and is held clear of the left and right edges by its own
   * measured width.
   */
  useLayoutEffect(() => {
    const container = containerRef.current;
    const node = popoverRef.current;
    if (!container || !node || !anchor) return;

    const { offsetWidth: width, offsetHeight: height } = node;
    const visibleTop = container.scrollTop;
    const above = anchor.top - height - POPOVER_GAP;
    const top = above >= visibleTop + POPOVER_GAP ? above : anchor.bottom + POPOVER_GAP;

    const half = width / 2;
    const minLeft = container.scrollLeft + half + POPOVER_GAP;
    const maxLeft = container.scrollLeft + container.clientWidth - half - POPOVER_GAP;
    // max before min, so a popover wider than the panel still starts on screen
    // rather than being pushed off the left edge by the clamp itself.
    const left = Math.max(minLeft, Math.min(anchor.left, maxLeft));

    setPlacement({ top, left });
  }, [anchor, containerRef, selectedText, section, timeRange]);

  // A citation points at the passage, so the link carries the span the reader
  // selected — the story page seeks to `start` and marks through to `end`.
  const shareUrl = storyHubPage?.uuid
    ? buildStoryShareUrl({
        storyId: storyHubPage.uuid,
        startTime: section ? section.start : timeRange?.startTime,
        endTime: section ? undefined : timeRange?.endTime,
      })
    : '';

  const shareCaption = section
    ? [section.title, formatShareTimestamp(section.start) && `from ${formatShareTimestamp(section.start)}`]
        .filter(Boolean)
        .join(' · ')
    : [
        formatShareTimestamp(timeRange?.startTime) &&
          `From ${formatShareTimestamp(timeRange?.startTime)}${
            formatShareTimestamp(timeRange?.endTime) ? ` to ${formatShareTimestamp(timeRange?.endTime)}` : ''
          }`,
      ]
        .filter(Boolean)
        .join('');

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
            // The same link Share produces: whoever picks the issue up lands on
            // the moment being questioned rather than the top of the recording.
            pageUrl: shareUrl || undefined,
          }
        : {
            kind: 'transcript',
            quotedText: selectedText,
            ...recording,
            startTime: timeRange?.startTime,
            endTime: timeRange?.endTime,
            pageUrl: shareUrl || undefined,
          },
    );
    dismiss();
    window.getSelection()?.removeAllRanges();
  };

  const showAskAI = isChatEnabled;
  const showZoteroButton = showZotero && timeRange;
  const showSuggest = isSuggestionsEnabled;
  const showShare = Boolean(shareUrl);

  if (!anchor || !selectedText) return null;
  if (!showAskAI && !showZoteroButton && !showSuggest && !showShare) return null;

  return (
    <Paper
      ref={popoverRef}
      elevation={4}
      sx={{
        position: 'absolute',
        top: placement?.top ?? anchor.top,
        left: placement?.left ?? anchor.left,
        // Hidden for the frame it takes to measure, so it is never seen in the
        // wrong place before being moved to the right one.
        visibility: placement ? 'visible' : 'hidden',
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
            borderRight: showZoteroButton || showSuggest || showShare ? '1px solid' : 'none',
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
            borderRight: showSuggest || showShare ? '1px solid' : 'none',
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
          Suggest an edit
        </Button>
      )}
      {showShare && (
        <Button
          size="small"
          startIcon={<ShareIcon sx={{ fontSize: 16 }} />}
          onClick={(event) => setShareAnchor(event.currentTarget)}
          aria-haspopup="menu"
          aria-expanded={Boolean(shareAnchor)}
          sx={{
            textTransform: 'none',
            px: 1.5,
            py: 0.75,
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
            borderRadius: 0,
            borderLeft: '1px solid',
            borderColor: 'divider',
          }}>
          Share
        </Button>
      )}
      <ShareMenu
        anchorEl={shareAnchor}
        open={Boolean(shareAnchor)}
        onClose={() => {
          setShareAnchor(null);
          dismiss();
        }}
        url={shareUrl}
        title={(storyHubPage?.properties?.interview_title as string) || 'Recording'}
        caption={shareCaption || undefined}
      />
    </Paper>
  );
};
