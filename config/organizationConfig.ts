/**
 * Configuration module for TheirStory Portals
 *
 * This file provides type-safe access to the application configuration.
 * To customize the portal for a different organization, edit config.json
 * in the root directory.
 */

import configData from '../config.json';

export interface NerLabelConfig {
  id: string;
  displayName: string;
  color: string;
}

export interface OrganizationConfig {
  name: string;
  displayName: string;
  description: string;
  /**
   * Public URL of this portal, e.g. "https://ai4lam-stt.theirstory.io".
   * Link previews need absolute image URLs, and the app has no other way to
   * know where it is deployed. Falls back to NEXT_PUBLIC_SITE_URL.
   */
  siteUrl?: string;
  /** Image shown when a link to this portal is shared, ideally 1200x630. */
  socialImage?: string;
  logo?: {
    path?: string;
    alt?: string;
  };
}

export interface ThemeColorsConfig {
  primary: {
    main: string;
    light: string;
    dark: string;
    contrastText: string;
  };
  secondary: {
    main: string;
    light: string;
    dark: string;
    contrastText: string;
  };
  grey: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
  text: {
    primary: string;
    secondary: string;
    disabled: string;
  };
  background: {
    default: string;
    paper: string;
    subtle: string;
    mainPage: string;
    storyPage: string;
  };
  error: {
    main: string;
    light: string;
  };
  warning: {
    main: string;
    dark: string;
  };
  success: {
    main: string;
    light: string;
  };
  info: {
    main: string;
    light: string;
  };
  common: {
    white: string;
    black: string;
    border: string;
    divider: string;
    overlay: string;
    shadow: string;
  };
}

export interface FeaturesConfig {
  chat?: {
    enabled?: boolean;
    provider?: 'anthropic' | 'openai' | 'openai-compatible';
    model?: string;
    baseUrl?: string;
  };
  zotero?: {
    enabled?: boolean;
  };
  /**
   * Lets readers attach files and public links to a chat, as context for the
   * model. Extracted text is held in the server's memory for the sitting and
   * then dropped; nothing is written to disk.
   */
  chatAttachments?: {
    enabled?: boolean;
  };
  /**
   * Lets readers propose corrections to anything the archive states — a
   * transcript line, an entity, a description, an index entry — and files each
   * one as a GitHub issue. Needs GITHUB_TOKEN in the server environment.
   */
  suggestions?: {
    enabled?: boolean;
    /** "owner/name" of the repository issues are filed in. */
    repository?: string;
    /** Applied to every issue this creates, so they can be triaged as a group. */
    labels?: string[];
  };
}

export interface AppConfig {
  organization: OrganizationConfig;
  theme: {
    colors: ThemeColorsConfig;
  };
  ui: {
    carouselTopBar?: {
      images?: string[];
      intervalMs?: number;
      backgroundColor?: string;
    };
    portalHeaderOverlay?: {
      enabled?: boolean;
    };
    /**
     * Links out of the portal, shown in the top bar beside the internal nav.
     * Each opens in a new tab, so the reader does not lose the archive.
     */
    externalNavLinks?: {
      label: string;
      href: string;
    }[];
  };
  features?: FeaturesConfig;
  ner: {
    labels: NerLabelConfig[];
    fallbackColors: string[];
  };
}

// Type-safe config export
export const config: AppConfig = configData as AppConfig;

// Convenient exports for commonly used values
export const organizationConfig = config.organization;
export const themeColors = config.theme.colors;
export const nerLabels = config.ner.labels;
export const nerFallbackColors = config.ner.fallbackColors;
export const isChatEnabled = config.features?.chat?.enabled ?? false;
export const isZoteroEnabled = config.features?.zotero?.enabled ?? false;
export const isChatAttachmentsEnabled = Boolean(config.features?.chatAttachments?.enabled && isChatEnabled);
export const suggestionsConfig = config.features?.suggestions;
// The repository is what makes the feature work at all, so a portal that
// enabled it without naming one should not show controls that cannot file
// anything.
export const isSuggestionsEnabled = Boolean(
  suggestionsConfig?.enabled && suggestionsConfig?.repository?.trim(),
);
export const externalNavLinks = (config.ui?.externalNavLinks ?? []).filter(
  (link) => link?.label?.trim() && link?.href?.trim(),
);

const normalize = (value: string) => value?.trim()?.toLowerCase();

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
};

/**
 * Find config by NER id (the key used in transcripts / ner_data.label)
 */
export const getNerLabelConfig = (id: string): NerLabelConfig | undefined => {
  const key = normalize(id);
  return config.ner.labels.find((l) => normalize(l.id) === key);
};

export const getNerDisplayName = (id: string): string => {
  const cfg = getNerLabelConfig(id);
  return cfg?.displayName ?? id.replace(/_/g, ' ');
};

export const getNerColor = (id: string): string => {
  const cfg = getNerLabelConfig(id);
  if (cfg?.color) return cfg.color;

  const fallbacks = nerFallbackColors ?? [];
  if (fallbacks.length === 0) return '#9e9e9e';

  const idx = Math.abs(hashString(normalize(id))) % fallbacks.length;
  return fallbacks[idx];
};

export const getNerLabelColorMap = (): Map<string, string> => {
  const colorMap = new Map<string, string>();
  config.ner.labels.forEach((l) => colorMap.set(l.id, l.color));
  return colorMap;
};

export const getNerColorPalette = (): string[] => {
  return [...config.ner.labels.map((l) => l.color), ...config.ner.fallbackColors];
};
