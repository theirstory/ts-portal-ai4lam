'use server';
import { Chunks, Testimonies, SchemaMap, SchemaTypes } from '@/types/weaviate';
import { initWeaviateClient } from './client';
import { FilterValue, QueryProperty } from 'weaviate-client';
import { NerEntityOption, normalizeTimedNerData } from '@/types/ner';
import { SearchType } from '@/types/searchType';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type CollectionFilterOption = {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  image?: string;
};

export type FolderFilterOption = {
  id: string;
  name: string;
  path: string;
  collectionId: string;
  collectionName: string;
  itemCount: number;
};

type EmbeddingResponse = {
  vector: number[];
  dim: number;
};

type CollectionJsonMetadata = {
  id?: string;
  name?: string;
  description?: string;
  image?: string;
};

type PropertyFilterBuilder = {
  containsAny: (values: string[]) => FilterValue;
  equal: (value: string) => FilterValue;
  notEqual: (value: string) => FilterValue;
};

const TESTIMONIES_COLLECTION_PROPS: QueryProperty<Testimonies>[] = [
  'collection_id',
  'collection_name',
  'collection_description',
];

const TESTIMONIES_FOLDER_PROPS: QueryProperty<Testimonies>[] = [
  'folder_id',
  'folder_name',
  'folder_path',
  'collection_id',
  'collection_name',
];

const NER_SEARCH_RETURN_PROPS: QueryProperty<Chunks>[] = [
  'interview_title',
  'start_time',
  'end_time',
  'speaker',
  'transcription',
  'ner_labels',
  'theirstory_id',
];

const STORY_ID_ONLY_RETURN_PROPS: QueryProperty<Chunks>[] = ['theirstory_id'];

async function loadCollectionMetadataMap(): Promise<Map<string, CollectionJsonMetadata>> {
  const collectionsRoot = path.join(process.cwd(), 'json', 'interviews');
  const metadataById = new Map<string, CollectionJsonMetadata>();

  let directoryEntries: Awaited<ReturnType<typeof readdir>>;
  try {
    directoryEntries = await readdir(collectionsRoot, { withFileTypes: true });
  } catch {
    return metadataById;
  }

  for (const entry of directoryEntries) {
    if (!entry.isDirectory()) continue;

    const collectionFile = path.join(collectionsRoot, entry.name, 'collection.json');

    try {
      const raw = await readFile(collectionFile, 'utf-8');
      const parsed = JSON.parse(raw) as CollectionJsonMetadata;
      const id = String(parsed.id || entry.name).trim();
      if (!id) continue;
      metadataById.set(id, parsed);
    } catch {
      // Ignore folders without valid collection metadata.
    }
  }

  return metadataById;
}

function getByPropertyFilter(collection: { filter: { byProperty: unknown } }) {
  return collection.filter.byProperty as unknown as (property: string) => PropertyFilterBuilder;
}

function buildCombinedFilters(
  myCollection: { filter: { byProperty: unknown } },
  nerFilters?: string[],
  collectionFilters?: string[],
  folderFilters?: string[],
): FilterValue | undefined {
  const filtersArray: FilterValue[] = [];
  const byProperty = getByPropertyFilter(myCollection);

  if (nerFilters?.length) {
    filtersArray.push(byProperty('ner_labels').containsAny(nerFilters));
  }

  if (collectionFilters?.length) {
    filtersArray.push(byProperty('collection_id').containsAny(collectionFilters));
  }

  if (folderFilters?.length) {
    filtersArray.push(byProperty('folder_id').containsAny(folderFilters));
  }

  if (!filtersArray.length) return undefined;
  if (filtersArray.length === 1) return filtersArray[0];

  return {
    operator: 'And',
    filters: filtersArray,
    value: true,
  } as FilterValue;
}

export async function getLocalEmbedding(text: string): Promise<number[]> {
  const baseUrl = process.env.NLP_PROCESSOR_URL ?? 'http://nlp-processor:7070';

  const res = await fetch(`${baseUrl}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Embedding service failed: ${res.status} ${msg}`);
  }

  const data = (await res.json()) as EmbeddingResponse;
  return data.vector;
}

export async function fetchStoryTranscriptByUuid(StoryUuid: string) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Testimonies>('Testimonies');

  const response = await myCollection.query.fetchObjectById(StoryUuid);

  return response;
}

export async function getStoryByUuid(StoryUuid: string) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');
  const response = await myCollection.query.fetchObjectById(StoryUuid);
  return response;
}

export async function getAllStoriesFromCollection<T extends SchemaTypes>(
  collection: T,
  returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
  limit = 1000,
  offset = 0,
  collectionFilters?: string[],
  folderFilters?: string[],
  nerFilters?: string[],
  /** Restrict to these recordings, e.g. the ones matching selected entities. */
  recordingIds?: string[],
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);
  const propertyFilter = buildCombinedFilters(myCollection, nerFilters, collectionFilters, folderFilters);

  let combinedFilter = propertyFilter;
  if (recordingIds) {
    // An empty list means the entity selection matched nothing, which must
    // return nothing rather than silently falling back to every recording.
    const idFilter = myCollection.filter.byId().containsAny(recordingIds.length ? recordingIds : ['__none__']);
    combinedFilter = propertyFilter
      ? ({ operator: 'And', filters: [propertyFilter, idFilter], value: true } as FilterValue)
      : idFilter;
  }

  const response = await myCollection.query.fetchObjects({
    limit,
    offset,
    filters: combinedFilter,
    returnProperties: returnProperties,
  });

  return response;
}

export async function getAvailableCollections(limit = 5000): Promise<CollectionFilterOption[]> {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Testimonies>('Testimonies');
  const collectionMetadataMap = await loadCollectionMetadataMap();

  const response = await myCollection.query.fetchObjects({
    limit,
    returnProperties: TESTIMONIES_COLLECTION_PROPS,
  });

  const map = new Map<string, CollectionFilterOption>();

  for (const item of response.objects) {
    const props = (item.properties ?? {}) as Partial<Testimonies>;
    const id = String(props.collection_id || '').trim();
    if (!id) continue;

    // Source of truth today:
    // - `id` always comes from Weaviate (`collection_id`)
    // - `name`/`description` prefer local JSON metadata, then fall back to Weaviate properties
    // - `image` only comes from local JSON metadata
    const metadata = collectionMetadataMap.get(id);
    const name = String(metadata?.name || props.collection_name || '').trim() || id;
    const description = String(metadata?.description || props.collection_description || '').trim();
    const image = String(metadata?.image || '').trim() || undefined;
    const existing = map.get(id);
    if (!existing) {
      map.set(id, { id, name, description, image, itemCount: 1 });
    } else {
      map.set(id, {
        ...existing,
        image: existing.image || image,
        itemCount: existing.itemCount + 1,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAvailableFolders(limit = 5000): Promise<FolderFilterOption[]> {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Testimonies>('Testimonies');

  const response = await myCollection.query.fetchObjects({
    limit,
    returnProperties: TESTIMONIES_FOLDER_PROPS,
  });

  const map = new Map<string, FolderFilterOption>();

  for (const item of response.objects) {
    const props = (item.properties ?? {}) as Partial<Testimonies>;
    const id = String(props.folder_id || '').trim();
    if (!id) continue;

    const name = String(props.folder_name || props.folder_path || id).trim() || id;
    const folderPath = String(props.folder_path || props.folder_name || '').trim();
    const collectionId = String(props.collection_id || '').trim();
    const collectionName = String(props.collection_name || collectionId).trim() || collectionId;
    const existing = map.get(id);

    if (!existing) {
      map.set(id, {
        id,
        name,
        path: folderPath,
        collectionId,
        collectionName,
        itemCount: 1,
      });
    } else {
      map.set(id, {
        ...existing,
        itemCount: existing.itemCount + 1,
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    const collectionCompare = a.collectionName.localeCompare(b.collectionName);
    if (collectionCompare !== 0) return collectionCompare;
    return a.name.localeCompare(b.name);
  });
}

export async function vectorSearch<T extends SchemaTypes>(
  collection: T,
  searchTerm: string,
  limit = 1000,
  offset = 0,
  filters?: string[],
  collectionFilters?: string[],
  folderFilters?: string[],
  returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
  minValue?: number,
  maxValue?: number,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);

  const combinedFilter = buildCombinedFilters(myCollection, filters, collectionFilters, folderFilters);

  const vector = await getLocalEmbedding(searchTerm);

  const rawResults = await myCollection.query.nearVector(vector, {
    limit,
    offset,
    returnMetadata: ['score', 'certainty', 'distance'],
    filters: combinedFilter,
    returnProperties,
  });

  const filteredObjects = rawResults.objects.filter((item) => {
    const score = item.metadata?.certainty;
    if (score === undefined) return false;
    return (minValue === undefined || score >= minValue) && (maxValue === undefined || score <= maxValue);
  });

  const seen = new Set<number>();

  const uniqueByStartTime = filteredObjects.filter((item) => {
    const start = (item.properties as Partial<Chunks> | undefined)?.start_time;
    if (typeof start !== 'number') return false;
    if (seen.has(start)) return false;
    seen.add(start);
    return true;
  });

  return {
    ...rawResults,
    objects: uniqueByStartTime.slice(0, limit),
  };
}

export async function hybridSearch<T extends SchemaTypes>(
  collection: T,
  searchTerm: string,
  limit = 1000,
  offset = 0,
  filters?: string[],
  collectionFilters?: string[],
  folderFilters?: string[],
  returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
  minValue?: number,
  maxValue?: number,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);
  const combinedFilter = buildCombinedFilters(myCollection, filters, collectionFilters, folderFilters);

  const vector = await getLocalEmbedding(searchTerm);
  const response = await myCollection.query.hybrid(searchTerm, {
    vector,
    alpha: 0.55,
    fusionType: 'RelativeScore',
    limit,
    offset,
    returnMetadata: ['score', 'distance', 'certainty'],
    filters: combinedFilter,
    returnProperties,
  });

  const filteredObjects = response.objects.filter((item) => {
    const score = item?.metadata?.score ?? 0;
    return (minValue === undefined || score >= minValue) && (maxValue === undefined || score <= maxValue);
  });

  const seen = new Set<number>();
  const uniqueByStartTime = filteredObjects.filter((item) => {
    const start = (item.properties as Partial<Chunks> | undefined)?.start_time;
    if (typeof start !== 'number') return false;
    if (seen.has(start)) return false;
    seen.add(start);
    return true;
  });

  return {
    ...response,
    objects: uniqueByStartTime.slice(0, limit),
  };
}

export async function bm25Search<T extends SchemaTypes>(
  collection: T,
  searchTerm: string,
  limit = 1000,
  offset = 0,
  filters?: string[],
  collectionFilters?: string[],
  folderFilters?: string[],
  returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
  minValue?: number,
  maxValue?: number,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);
  const combinedFilter = buildCombinedFilters(myCollection, filters, collectionFilters, folderFilters);

  const response = await myCollection.query.bm25(searchTerm, {
    limit: limit,
    offset: offset,
    returnMetadata: ['distance', 'score', 'certainty'],
    filters: combinedFilter,
    returnProperties: returnProperties,
  });

  const scores = response.objects.map((obj) => obj.metadata?.score ?? 0);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  // Normalizes the score from bm25 to a 0-1 range
  const normalizedObjects = response.objects.map((obj) => {
    const rawScore = obj.metadata?.score ?? 0;
    const normalizedScore = maxScore === minScore ? 1 : (rawScore - minScore) / (maxScore - minScore);

    return {
      ...obj,
      metadata: {
        ...obj.metadata,
        score: normalizedScore,
      },
    };
  });

  const filteredObjects = normalizedObjects.filter((obj) => {
    const score = obj.metadata?.score ?? 0;
    return score >= (minValue ?? 0) && score <= (maxValue ?? 1);
  });

  const seen = new Set<number>();
  const uniqueByStartTime = filteredObjects.filter((item) => {
    const start = (item.properties as Partial<Chunks> | undefined)?.start_time;
    if (typeof start !== 'number') return false;
    if (seen.has(start)) return false;
    seen.add(start);
    return true;
  });

  return {
    ...response,
    objects: uniqueByStartTime.slice(0, limit),
  };
}

export async function hybridSearchForStoryId<T extends SchemaTypes>(
  collection: T,
  theirStoryId: string,
  searchTerm: string,
  limit = 1000,
  nerFilters?: string[],
  minValue?: number,
  maxValue?: number,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);
  const byProperty = getByPropertyFilter(myCollection as unknown as { filter: { byProperty: unknown } });

  const filtersArray: FilterValue[] = [byProperty('theirstory_id').equal(theirStoryId)];

  if (nerFilters?.length) {
    filtersArray.push(byProperty('ner_labels').containsAny(nerFilters));
  }

  const combinedFilter: FilterValue =
    filtersArray.length > 1 ? { operator: 'And', filters: filtersArray, value: true } : filtersArray[0];

  const vector = await getLocalEmbedding(searchTerm);
  const response = await myCollection.query.hybrid(searchTerm, {
    vector,
    alpha: 0.55,
    fusionType: 'RelativeScore',
    limit,
    returnMetadata: ['score', 'distance', 'certainty'],
    filters: combinedFilter,
  });

  const filteredObjects = response.objects.filter((item) => {
    const score = item?.metadata?.score ?? 0;
    return (minValue === undefined || score >= minValue) && (maxValue === undefined || score <= maxValue);
  });

  const seen = new Set<number>();
  const uniqueByStartTime = filteredObjects.filter((item) => {
    const start = (item.properties as Partial<Chunks> | undefined)?.start_time;
    if (typeof start !== 'number') return false;
    if (seen.has(start)) return false;
    seen.add(start);
    return true;
  });

  return {
    ...response,
    objects: uniqueByStartTime.slice(0, limit),
  };
}

export async function vectorSearchForStoryId<T extends SchemaTypes>(
  collection: T,
  theirStoryId: string,
  searchTerm: string,
  limit = 1000,
  nerFilters?: string[],
  minValue?: number,
  maxValue?: number,
  returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);
  const byProperty = getByPropertyFilter(myCollection as unknown as { filter: { byProperty: unknown } });

  const filtersArray: FilterValue[] = [byProperty('theirstory_id').equal(theirStoryId)];

  if (nerFilters?.length) {
    filtersArray.push(byProperty('ner_labels').containsAny(nerFilters));
  }

  const combinedFilter: FilterValue =
    filtersArray.length > 1 ? { operator: 'And', filters: filtersArray, value: true } : filtersArray[0];

  const vector = await getLocalEmbedding(searchTerm);

  const response = await myCollection.query.nearVector(vector, {
    filters: combinedFilter,
    limit,
    returnMetadata: ['distance', 'certainty', 'score'],
    returnProperties,
  });

  const processedObjects = response.objects.map((obj) => {
    const certainty = obj.metadata?.certainty ?? 0;

    return {
      ...obj,
      metadata: {
        ...obj.metadata,
        score: certainty,
      },
    };
  });

  const filteredObjects = processedObjects.filter((obj) => {
    const certainty = obj.metadata?.certainty ?? 0;
    return certainty >= (minValue ?? 0) && certainty <= (maxValue ?? 1);
  });

  return {
    ...response,
    objects: filteredObjects,
  };
}

export async function bm25SearchForStoryId<T extends SchemaTypes>(
  collection: T,
  theirStoryId: string,
  searchTerm: string,
  limit = 1000,
  nerFilters?: string[],
  minValue?: number,
  maxValue?: number,
  returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);
  const byProperty = getByPropertyFilter(myCollection as unknown as { filter: { byProperty: unknown } });

  const filtersArray: FilterValue[] = [byProperty('theirstory_id').equal(theirStoryId)];

  if (nerFilters?.length) {
    filtersArray.push(byProperty('ner_labels').containsAny(nerFilters));
  }

  const combinedFilter: FilterValue =
    filtersArray.length > 1 ? { operator: 'And', filters: filtersArray, value: true } : filtersArray[0];

  const response = await myCollection.query.bm25(searchTerm, {
    filters: combinedFilter,
    limit,
    returnMetadata: ['score'],
    returnProperties,
  });

  const scores = response.objects.map((obj) => obj.metadata?.score ?? 0);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  // Normalizes the score from bm25 to a 0-1 range
  const normalizedObjects = response.objects.map((obj) => {
    const rawScore = obj.metadata?.score ?? 0;
    const normalizedScore = maxScore === minScore ? 1 : (rawScore - minScore) / (maxScore - minScore);

    return {
      ...obj,
      metadata: {
        ...obj.metadata,
        score: normalizedScore,
      },
    };
  });

  const filteredObjects = normalizedObjects.filter((obj) => {
    const score = obj.metadata?.score ?? 0;
    return score >= (minValue ?? 0) && score <= (maxValue ?? 1);
  });

  return {
    ...response,
    objects: filteredObjects,
  };
}

// Search for NER entities across the collection
export async function searchNerEntitiesAcrossCollection(
  entityText: string,
  entityLabel: string,
  excludeStoryUuid?: string,
  limit = 100,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');
  const byProperty = getByPropertyFilter(myCollection as unknown as { filter: { byProperty: unknown } });

  try {
    const filtersArray: FilterValue[] = [
      byProperty('ner_text').containsAny([entityText.toLowerCase()]),
      byProperty('ner_labels').containsAny([entityLabel]),
    ];

    if (excludeStoryUuid) {
      filtersArray.push(byProperty('theirstory_id').notEqual(excludeStoryUuid));
    }

    const combinedFilter: FilterValue = {
      operator: 'And',
      filters: filtersArray,
      value: true,
    };

    const response = await myCollection.query.fetchObjects({
      limit,
      filters: combinedFilter,
      returnProperties: NER_SEARCH_RETURN_PROPS,
    });

    return response;
  } catch (error) {
    console.error('Error searching NER entities across collection:', error);
    throw new Error('Failed to search NER entities across collection');
  }
}

const NER_ENTITY_RECORDING_COUNT_KEY = (text: string, label: string) => `${text.toLowerCase()}|${label}`;

/** Returns how many distinct recordings (testimonies) contain each entity. */
export async function getNerEntityRecordingCounts(
  entities: { text: string; label: string }[],
): Promise<Record<string, number>> {
  if (entities.length === 0) return {};
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');
  const byProperty = getByPropertyFilter(myCollection as unknown as { filter: { byProperty: unknown } });
  const result: Record<string, number> = {};
  const limit = 1000;

  for (const { text, label } of entities) {
    try {
      const filtersArray: FilterValue[] = [
        byProperty('ner_text').containsAny([text.toLowerCase()]),
        byProperty('ner_labels').containsAny([label]),
      ];
      const combinedFilter: FilterValue = {
        operator: 'And',
        filters: filtersArray,
        value: true,
      };
      const response = await myCollection.query.fetchObjects({
        limit,
        filters: combinedFilter,
        returnProperties: STORY_ID_ONLY_RETURN_PROPS,
      });
      const ids = new Set<string>();
      for (const obj of response.objects) {
        const id = (obj.properties as Partial<Chunks> | undefined)?.theirstory_id;
        if (id) ids.add(id);
      }
      result[NER_ENTITY_RECORDING_COUNT_KEY(text, label)] = ids.size;
    } catch (err) {
      console.error('Error getting recording count for entity:', text, label, err);
      result[NER_ENTITY_RECORDING_COUNT_KEY(text, label)] = 0;
    }
  }

  return result;
}

/* --------------------------------------------------- NER entity browsing */

// ner_data is an object[] in the schema, so it has to be requested in the
// nested form. Asking for it as a bare property name fails at the gRPC layer
// with "creating primitive value for ner_data".
const NER_DATA_RETURN_PROPS = [
  { name: 'ner_data', properties: ['text', 'label', 'start_time', 'end_time'] },
] as unknown as QueryProperty<Testimonies>[];
const NER_ENTITY_CHUNK_TEXT_PROPS: QueryProperty<Chunks>[] = ['ner_text', 'ner_labels', 'theirstory_id'];
const NER_ENTITY_CHUNK_RETURN_PROPS: QueryProperty<Chunks>[] = ['theirstory_id', 'start_time', 'end_time'];

/** Testimonies scanned per batch while discovering the entities for a label. */
const NER_ENTITY_SOURCE_BATCH_SIZE = 500;
/** Safety net for pathologically large portals, not the normal case. */
const NER_ENTITY_MAX_SCAN_BATCHES = 10;
const NER_ENTITY_CHUNK_COUNT_BATCH_SIZE = 500;

type NerEntityAccumulator = NerEntityOption & { recordingIds: Set<string> };

function addNerEntityOption(
  map: Map<string, NerEntityAccumulator>,
  text: string,
  label: string,
  recordingId: string,
) {
  const normalizedText = text.trim();
  if (!normalizedText) return;

  const key = `${label}:${normalizedText.toLowerCase()}`;
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    existing.recordingIds.add(recordingId);
    existing.recordingCount = existing.recordingIds.size;
    return;
  }

  map.set(key, {
    text: normalizedText,
    label,
    count: 1,
    recordingCount: 1,
    recordingIds: new Set([recordingId]),
  });
}

function sortNerEntityOptions(map: Map<string, NerEntityAccumulator>): NerEntityOption[] {
  return [...map.values()]
    .map(({ text, label, count, recordingCount }) => ({ text, label, count, recordingCount }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

/**
 * The testimony scan tells us which entities exist, but its counts are per
 * testimony-level ner_data entry. The sidebar shows how many excerpts a user
 * will actually get back, so counts are recomputed against Chunks.
 */
async function countChunkMatchesForEntityOptions(
  options: NerEntityOption[],
  label: string,
  collectionFilters?: string[],
  folderFilters?: string[],
): Promise<NerEntityOption[]> {
  if (options.length === 0) return options;

  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');
  const byProperty = getByPropertyFilter(myCollection);
  const optionByText = new Map(options.map((option) => [option.text.toLowerCase(), option]));

  const filtersArray: FilterValue[] = [
    byProperty('ner_labels').containsAny([label]),
    byProperty('ner_text').containsAny([...optionByText.keys()]),
  ];
  if (collectionFilters?.length) {
    filtersArray.push(byProperty('collection_id').containsAny(collectionFilters));
  }
  if (folderFilters?.length) {
    filtersArray.push(byProperty('folder_id').containsAny(folderFilters));
  }
  const combinedFilter: FilterValue = { operator: 'And', filters: filtersArray, value: true };

  const countsByText = new Map<string, { count: number; recordingIds: Set<string> }>();
  let offset = 0;

  for (;;) {
    const response = await myCollection.query.fetchObjects({
      limit: NER_ENTITY_CHUNK_COUNT_BATCH_SIZE,
      offset,
      filters: combinedFilter,
      returnProperties: NER_ENTITY_CHUNK_TEXT_PROPS,
    });

    response.objects.forEach((chunk) => {
      const properties = chunk.properties as Partial<Chunks> | undefined;
      const nerText = properties?.ner_text;
      if (!Array.isArray(nerText)) return;

      const recordingId = properties?.theirstory_id ?? '';
      // A chunk mentioning the same entity twice is still one excerpt.
      const matchedTexts = new Set<string>();

      nerText.forEach((value) => {
        if (typeof value !== 'string') return;
        const normalizedText = value.trim().toLowerCase();
        if (optionByText.has(normalizedText)) matchedTexts.add(normalizedText);
      });

      matchedTexts.forEach((text) => {
        const existing = countsByText.get(text) ?? { count: 0, recordingIds: new Set<string>() };
        existing.count += 1;
        if (recordingId) existing.recordingIds.add(recordingId);
        countsByText.set(text, existing);
      });
    });

    if (response.objects.length < NER_ENTITY_CHUNK_COUNT_BATCH_SIZE) break;
    offset += NER_ENTITY_CHUNK_COUNT_BATCH_SIZE;
  }

  return options
    .map((option) => {
      const counts = countsByText.get(option.text.toLowerCase());
      return {
        ...option,
        count: counts?.count ?? 0,
        recordingCount: counts?.recordingIds.size ?? 0,
      };
    })
    .filter((option) => option.count > 0)
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

async function fetchTestimonyNerDataByIds(ids: string[]) {
  if (ids.length === 0) return [];

  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Testimonies>('Testimonies');

  try {
    const response = await myCollection.query.fetchObjects({
      limit: ids.length,
      filters: myCollection.filter.byId().containsAny(ids),
      returnProperties: NER_DATA_RETURN_PROPS,
    });
    return response.objects.map((obj) => ({
      id: obj.uuid,
      nerData: normalizeTimedNerData(obj.properties?.ner_data),
    }));
  } catch (error) {
    console.error('Error fetching testimony NER data for ids:', ids, error);
    return [];
  }
}

/**
 * Distinct entities recorded under one NER label, with the number of excerpts
 * and recordings each appears in — the list shown beneath a checked label in
 * the recordings sidebar.
 */
export async function getNerEntityOptionsForLabel({
  label,
  searchTerm,
  searchType,
  collectionFilters,
  folderFilters,
  offset = 0,
  sourceLimit = NER_ENTITY_SOURCE_BATCH_SIZE,
  minValue,
  maxValue,
}: {
  label: string;
  searchTerm?: string;
  searchType?: SearchType;
  collectionFilters?: string[];
  folderFilters?: string[];
  offset?: number;
  sourceLimit?: number;
  minValue?: number;
  maxValue?: number;
}): Promise<{ options: NerEntityOption[]; hasMore: boolean; scannedCount: number }> {
  const entityMap = new Map<string, NerEntityAccumulator>();
  const normalizedSearchTerm = searchTerm?.trim();

  // With an active search the sidebar must describe the visible results, not
  // the whole archive, so entities are derived from the chunks that matched
  // rather than from a full scan.
  if (normalizedSearchTerm) {
    return getNerEntityOptionsForSearch({
      label,
      searchTerm: normalizedSearchTerm,
      searchType,
      collectionFilters,
      folderFilters,
      offset,
      sourceLimit,
      minValue,
      maxValue,
      entityMap,
    });
  }

  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Testimonies>('Testimonies');
  const combinedFilter = buildCombinedFilters(myCollection, [label], collectionFilters, folderFilters);

  // Discovery has to see every testimony before deciding which entities are
  // "top" — cutting to a fixed page after only the first batch lets common
  // entities that happened to sample low get dropped with no way back.
  let scanOffset = offset;
  let scannedCount = 0;
  let hitSafetyCap = false;

  for (let batch = 0; batch < NER_ENTITY_MAX_SCAN_BATCHES; batch++) {
    const response = await myCollection.query.fetchObjects({
      limit: sourceLimit,
      offset: scanOffset,
      filters: combinedFilter,
      returnProperties: NER_DATA_RETURN_PROPS,
    });

    response.objects.forEach((item) => {
      const recordingId = item.uuid ?? '';
      normalizeTimedNerData(item.properties?.ner_data)
        .filter((ner) => ner.label === label)
        .forEach((ner) => addNerEntityOption(entityMap, ner.text, label, recordingId));
    });

    scannedCount += response.objects.length;
    scanOffset += response.objects.length;

    if (response.objects.length < sourceLimit) break;
    if (batch === NER_ENTITY_MAX_SCAN_BATCHES - 1) {
      hitSafetyCap = true;
      console.warn(
        `getNerEntityOptionsForLabel: hit the ${NER_ENTITY_MAX_SCAN_BATCHES}-batch safety cap scanning testimonies for label="${label}" — entity list may be missing some options`,
      );
    }
  }

  const options = await countChunkMatchesForEntityOptions(
    sortNerEntityOptions(entityMap),
    label,
    collectionFilters,
    folderFilters,
  );

  return { options, hasMore: hitSafetyCap, scannedCount };
}

/**
 * Entity options for a label restricted to what an active search matched.
 *
 * The chunks that matched give time windows; an entity counts if one of its
 * mentions overlaps a matched window. That keeps the sidebar describing the
 * results on screen — a count drawn from the whole archive would tell the user
 * a filter will narrow their results when it would actually widen them.
 */
async function getNerEntityOptionsForSearch({
  label,
  searchTerm,
  searchType,
  collectionFilters,
  folderFilters,
  offset,
  sourceLimit,
  minValue,
  maxValue,
  entityMap,
}: {
  label: string;
  searchTerm: string;
  searchType?: SearchType;
  collectionFilters?: string[];
  folderFilters?: string[];
  offset: number;
  sourceLimit: number;
  minValue?: number;
  maxValue?: number;
  entityMap: Map<string, NerEntityAccumulator>;
}): Promise<{ options: NerEntityOption[]; hasMore: boolean; scannedCount: number }> {
  const chunkFilters = [label];
  const effectiveSearchType = searchType ?? SearchType.bm25;
  const args = [
    SchemaTypes.Chunks,
    searchTerm,
    sourceLimit,
    offset,
    chunkFilters,
    collectionFilters,
    folderFilters,
    NER_ENTITY_CHUNK_RETURN_PROPS,
    minValue,
    maxValue,
  ] as const;

  let chunksResponse;
  switch (effectiveSearchType) {
    case SearchType.Hybrid:
      chunksResponse = await hybridSearch(...args);
      break;
    case SearchType.Vector:
      chunksResponse = await vectorSearch(...args);
      break;
    case SearchType.bm25:
    default:
      chunksResponse = await bm25Search(...args);
      break;
  }

  const windowsByRecording = new Map<string, { start: number; end: number }[]>();
  chunksResponse.objects.forEach((chunk) => {
    const props = chunk.properties as Partial<Chunks>;
    const recordingId = props.theirstory_id ?? '';
    if (!recordingId || typeof props.start_time !== 'number' || typeof props.end_time !== 'number') return;

    const existing = windowsByRecording.get(recordingId) ?? [];
    existing.push({ start: props.start_time, end: props.end_time });
    windowsByRecording.set(recordingId, existing);
  });

  const testimonyNerData = await fetchTestimonyNerDataByIds([...windowsByRecording.keys()]);
  testimonyNerData.forEach(({ id, nerData }) => {
    const entitiesForLabel = nerData.filter((ner) => ner.label === label);

    (windowsByRecording.get(id) ?? []).forEach((window) => {
      // One mention per matched chunk, so an entity said twice in the same
      // excerpt still counts as one result the user can click through to.
      const matchedTexts = new Set<string>();
      entitiesForLabel
        .filter((ner) => ner.end_time >= window.start && ner.start_time <= window.end)
        .forEach((ner) => {
          const text = ner.text.trim();
          if (text) matchedTexts.add(text);
        });

      matchedTexts.forEach((text) => addNerEntityOption(entityMap, text, label, id));
    });
  });

  return {
    options: sortNerEntityOptions(entityMap),
    hasMore: chunksResponse.objects.length === sourceLimit,
    scannedCount: chunksResponse.objects.length,
  };
}

/**
 * NER labels that actually appear in the archive, with the number of
 * recordings carrying each.
 *
 * config.json declares every label the portal could use, but a given archive
 * may have no instances of some of them — offering those as checkable filters
 * gives the user a control that can only ever return nothing.
 */
export async function getAvailableNerLabelStats(batchSize = 500): Promise<{
  labels: string[];
  /** Recordings carrying each label. */
  counts: Record<string, number>;
  /** Distinct entities recorded under each label. */
  entityCounts: Record<string, number>;
}> {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Testimonies>('Testimonies');
  const counts: Record<string, number> = {};
  const entityTextsByLabel: Record<string, Set<string>> = {};
  let offset = 0;

  for (;;) {
    const response = await myCollection.query.fetchObjects({
      limit: batchSize,
      offset,
      returnProperties: [
        'ner_labels' as unknown as QueryProperty<Testimonies>,
        ...NER_DATA_RETURN_PROPS,
      ],
    });

    response.objects.forEach((item) => {
      const props = item.properties as Partial<Testimonies> | undefined;

      const labels = props?.ner_labels;
      if (Array.isArray(labels)) {
        // A recording counts once per label however many times it is mentioned.
        new Set(
          labels.filter((label): label is string => typeof label === 'string').map((label) => label.trim()),
        ).forEach((label) => {
          if (label) counts[label] = (counts[label] ?? 0) + 1;
        });
      }

      // The sidebar shows how many distinct entities a label holds, which is
      // what the list under it will contain — not how many recordings use it.
      normalizeTimedNerData(props?.ner_data).forEach((ner) => {
        const label = ner.label?.trim();
        const text = ner.text?.trim().toLowerCase();
        if (!label || !text) return;
        (entityTextsByLabel[label] ??= new Set()).add(text);
      });
    });

    if (response.objects.length < batchSize) break;
    offset += response.objects.length;
  }

  const entityCounts = Object.fromEntries(
    Object.entries(entityTextsByLabel).map(([label, texts]) => [label, texts.size]),
  );

  return {
    labels: Object.keys(counts).sort(
      (a, b) => (entityCounts[b] ?? 0) - (entityCounts[a] ?? 0) || a.localeCompare(b),
    ),
    counts,
    entityCounts,
  };
}

const NER_ENTITY_RECORDING_BATCH_SIZE = 500;

/**
 * Recordings containing any of the given entities.
 *
 * Entity text lives on Chunks, not Testimonies, so selecting entities means
 * resolving matching chunks to their recordings first. Multiple entities are
 * OR'd: picking "Whisper" and "ASR" returns recordings mentioning either, which
 * is what a multi-select facet is expected to do.
 */
export async function getRecordingIdsForNerEntities(
  entities: { label: string; text: string }[],
  collectionFilters?: string[],
  folderFilters?: string[],
): Promise<string[]> {
  if (entities.length === 0) return [];

  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');
  const byProperty = getByPropertyFilter(myCollection);

  const filtersArray: FilterValue[] = [
    byProperty('ner_text').containsAny(entities.map((entity) => entity.text.toLowerCase())),
    byProperty('ner_labels').containsAny([...new Set(entities.map((entity) => entity.label))]),
  ];
  if (collectionFilters?.length) {
    filtersArray.push(byProperty('collection_id').containsAny(collectionFilters));
  }
  if (folderFilters?.length) {
    filtersArray.push(byProperty('folder_id').containsAny(folderFilters));
  }
  const combinedFilter: FilterValue = { operator: 'And', filters: filtersArray, value: true };

  const wanted = new Set(entities.map((entity) => `${entity.label}:${entity.text.toLowerCase()}`));
  const recordingIds = new Set<string>();
  let offset = 0;

  for (;;) {
    const response = await myCollection.query.fetchObjects({
      limit: NER_ENTITY_RECORDING_BATCH_SIZE,
      offset,
      filters: combinedFilter,
      returnProperties: NER_ENTITY_CHUNK_TEXT_PROPS,
    });

    response.objects.forEach((chunk) => {
      const props = chunk.properties as Partial<Chunks> | undefined;
      const recordingId = props?.theirstory_id;
      const nerText = props?.ner_text;
      if (!recordingId || !Array.isArray(nerText)) return;

      // containsAny matches text and label independently, so a chunk could
      // carry "Whisper" under one label and the wanted label from a different
      // entity. Confirm the pairing before accepting the recording.
      const labels = Array.isArray(props?.ner_labels) ? (props.ner_labels as string[]) : [];
      const hasPair = nerText.some(
        (value) =>
          typeof value === 'string' &&
          labels.some((label) => wanted.has(`${label}:${value.trim().toLowerCase()}`)),
      );
      if (hasPair) recordingIds.add(recordingId);
    });

    if (response.objects.length < NER_ENTITY_RECORDING_BATCH_SIZE) break;
    offset += response.objects.length;
  }

  return [...recordingIds];
}

/**
 * Total recordings matching the current filters.
 *
 * Pagination previously inferred the page count from whether the current page
 * came back full, which can only ever produce "this page, maybe one more" — so
 * an archive of any size showed at most two pages.
 */
export async function getStoriesCountFromCollection<T extends SchemaTypes>(
  collection: T,
  collectionFilters?: string[],
  folderFilters?: string[],
  nerFilters?: string[],
  recordingIds?: string[],
): Promise<number> {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);
  const propertyFilter = buildCombinedFilters(myCollection, nerFilters, collectionFilters, folderFilters);

  let combinedFilter = propertyFilter;
  if (recordingIds) {
    const idFilter = myCollection.filter.byId().containsAny(recordingIds.length ? recordingIds : ['__none__']);
    combinedFilter = propertyFilter
      ? ({ operator: 'And', filters: [propertyFilter, idFilter], value: true } as FilterValue)
      : idFilter;
  }

  try {
    const response = await myCollection.aggregate.overAll({ filters: combinedFilter });
    return response.totalCount ?? 0;
  } catch (error) {
    console.error('Error counting stories:', error);
    return 0;
  }
}

const EXCERPT_RETURN_PROPS: QueryProperty<Chunks>[] = [
  'theirstory_id',
  'interview_title',
  'recording_date',
  'thumbnail_url',
  'section_title',
  'speaker',
  'transcription',
  'start_time',
  'end_time',
  'isAudioFile',
];

/**
 * Chunk-level excerpts mentioning any of the selected entities.
 *
 * Filtering by entity is a question about moments, not whole recordings — the
 * useful answer is "here is where this was discussed", so results are the
 * passages themselves rather than the interviews containing them.
 */
export async function getExcerptsForNerEntities(
  entities: { label: string; text: string }[],
  collectionFilters?: string[],
  folderFilters?: string[],
  limit = 500,
): Promise<{ excerpts: Partial<Chunks>[]; total: number }> {
  if (entities.length === 0) return { excerpts: [], total: 0 };

  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');
  const byProperty = getByPropertyFilter(myCollection);

  const filtersArray: FilterValue[] = [
    byProperty('ner_text').containsAny(entities.map((entity) => entity.text.toLowerCase())),
    byProperty('ner_labels').containsAny([...new Set(entities.map((entity) => entity.label))]),
  ];
  if (collectionFilters?.length) {
    filtersArray.push(byProperty('collection_id').containsAny(collectionFilters));
  }
  if (folderFilters?.length) {
    filtersArray.push(byProperty('folder_id').containsAny(folderFilters));
  }
  const combinedFilter: FilterValue = { operator: 'And', filters: filtersArray, value: true };

  const wanted = new Set(entities.map((entity) => `${entity.label}:${entity.text.toLowerCase()}`));
  const response = await myCollection.query.fetchObjects({
    limit,
    filters: combinedFilter,
    returnProperties: [...EXCERPT_RETURN_PROPS, ...NER_DATA_RETURN_PROPS] as QueryProperty<Chunks>[],
  });

  // containsAny matches text and label independently, so confirm the pairing
  // before treating a chunk as a hit for the selected entity.
  const excerpts = response.objects
    .map((chunk) => chunk.properties as Partial<Chunks>)
    .filter((props) =>
      normalizeTimedNerData(props?.ner_data).some((ner) =>
        wanted.has(`${ner.label}:${ner.text.trim().toLowerCase()}`),
      ),
    )
    .sort(
      (a, b) =>
        String(a.interview_title ?? '').localeCompare(String(b.interview_title ?? '')) ||
        Number(a.start_time ?? 0) - Number(b.start_time ?? 0),
    );

  return { excerpts, total: excerpts.length };
}
