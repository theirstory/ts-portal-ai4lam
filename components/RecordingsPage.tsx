'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useRecordingsUrlState } from '@/app/hooks/useRecordingsUrlState';
import CollectionLayout from './CollectionLayout';


export const RecordingsPage = () => {
  const searchParams = useSearchParams();
  const collectionId = searchParams.get('collection');

  const { loadCollections, loadFolders, setCurrentPage, setSelectedFolderIds } = useSemanticSearchStore();

  useEffect(() => {
    loadCollections();
    loadFolders();
  }, [loadCollections, loadFolders]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedFolderIds([]);
  }, [collectionId, setCurrentPage, setSelectedFolderIds]);

  // Owns restoring from the URL and keeping it in step, including the initial
  // listing — this component no longer clears and refetches on mount, which
  // would have wiped anything a shared link was trying to restore.
  useRecordingsUrlState();

  return <CollectionLayout />;
};
