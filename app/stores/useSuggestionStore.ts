import { create } from 'zustand';
import { SuggestionContext } from '@/types/suggestion';

/**
 * Holds the correction a reader is in the middle of raising.
 *
 * In a store rather than in each surface's own state because the control that
 * opens it — a transcript selection, an entity chip, a metadata field, an
 * index row — is nowhere near the dialog that collects it, and the dialog is
 * mounted once for the whole app.
 */
interface SuggestionState {
  context: SuggestionContext | null;
  openSuggestion: (context: SuggestionContext) => void;
  closeSuggestion: () => void;
}

export const useSuggestionStore = create<SuggestionState>((set) => ({
  context: null,
  openSuggestion: (context) =>
    set({
      context: {
        ...context,
        // Captured at the moment of opening: by the time it is submitted the
        // reader may have scrolled, and the URL is how a maintainer gets back
        // to what they were looking at.
        pageUrl: context.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : undefined),
      },
    }),
  closeSuggestion: () => set({ context: null }),
}));
