import type { NerLabelConfig } from '@/config/organizationConfig';

export type NerLabel = NerLabelConfig['id'];

export type NerGroupedEntities = Record<string, string[]>;

export type NerEntityFilter = {
  label: string;
  text: string;
};

export type NerEntityOption = NerEntityFilter & {
  /** Number of chunks the entity appears in. */
  count: number;
  /** Number of distinct recordings the entity appears in. */
  recordingCount: number;
};

export type NerDataItem = {
  text: string;
  label: string;
  start_time?: number;
  end_time?: number;
};

export type TimedNerDataItem = NerDataItem & {
  start_time: number;
  end_time: number;
};

export const isNerDataItem = (value: unknown): value is NerDataItem => {
  if (typeof value !== 'object' || value === null) return false;

  const maybe = value as Partial<NerDataItem>;
  return typeof maybe.text === 'string' && typeof maybe.label === 'string';
};

export const isTimedNerDataItem = (value: unknown): value is TimedNerDataItem => {
  if (!isNerDataItem(value)) return false;

  return typeof value.start_time === 'number' && typeof value.end_time === 'number';
};

export const normalizeNerData = (value: unknown): NerDataItem[] =>
  Array.isArray(value) ? value.filter(isNerDataItem) : [];

/**
 * Entity mentions that carry timings, which is what a deep link into the
 * recording needs. Anything without both timestamps is dropped rather than
 * defaulted, so a link can never point at 0:00 by accident.
 */
export const normalizeTimedNerData = (value: unknown): TimedNerDataItem[] =>
  Array.isArray(value) ? value.filter(isTimedNerDataItem) : [];
