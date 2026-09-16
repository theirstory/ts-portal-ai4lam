export const MIN_SCORE_THRESHOLD = 0.5;

export const PAGINATION_ITEMS_PER_PAGE = 10;

/** Entities shown per label before the "show more" control appears. */
export const NER_ENTITY_DISPLAY_PAGE_SIZE = 20;

/** Testimony fields the recordings list needs. */
export const STORIES_RETURN_PROPERTIES = [
  'interview_title',
  'interview_description',
  'interview_duration',
  'ner_labels',
  'isAudioFile',
  'video_url',
  'collection_id',
  'collection_name',
  'collection_description',
] as const;
