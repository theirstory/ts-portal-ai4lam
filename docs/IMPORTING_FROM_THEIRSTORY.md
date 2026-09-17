# Importing From TheirStory

This guide covers the `theirstory:import-stories` script, which helps prepare TheirStory content for `ts-portal`.

## What it does

- Pulls stories from TheirStory by `storyIds`, `projectId`, or `folderId`
- Publishes or unpublishes media when needed
- Exports import-ready JSON files for `ts-portal`
- Validates required metadata such as transcript content, `story.indexes`, and `story.description`
- Can generate missing indexes and summaries during validation
- Supports batch processing with configurable concurrency

## Basic Usage

Set your auth token first:

```bash
export THEIRSTORY_AUTH_TOKEN='YOUR_TOKEN'
```

Import by IDs:

```bash
yarn theirstory:import-stories --ids '6998c9f5af83ef7a86a3a5a7,6998c6643f9d2efc9a710d42'
```

Import from a file:

```bash
yarn theirstory:import-stories --ids-file ./story-ids.txt
```

Import from a project:

```bash
yarn theirstory:import-stories --project-id 654a840f91a6dbedb12d8631
```

Import from a folder:

```bash
yarn theirstory:import-stories --folder-id 64f7be18ac45f390f20066fa
```

## Validation

Validate stories without publishing, unpublishing, or writing files:

```bash
yarn theirstory:import-stories --project-id 654a840f91a6dbedb12d8631 --validate
```

Validate and generate missing indexes/summaries before re-checking:

```bash
yarn theirstory:import-stories --project-id 654a840f91a6dbedb12d8631 --validate --generate-missing
```

Note: remote metadata generation can take a few minutes, so the script re-checks validation after triggering it.

## Unpublish

Unpublish media instead of generating JSON files:

```bash
yarn theirstory:import-stories --ids '6998c9f5af83ef7a86a3a5a7' --unpublish
```

## Behavior

- Calls `GET /transcripts/:storyId`
- Reads `story.custom_archive_media_type`
- Validates required metadata before importing
- Calls `GET /stories/:storyId/published_media_status?format=video|audio`
- Publishes as `video` when the media type contains `video`
- Publishes as `audio` otherwise
- Can fetch story IDs from project and folder pagination endpoints
- Reuses the existing published URL when media is already published
- Adds `mux_playback_id` extracted from the Mux URL
- Saves one JSON per story under `json/interviews/imported/`

## Transcript Corrections

Speech-to-text mishears terms it has no vocabulary for. This archive has seen
"FADGI" written as "Fiji" and, twice, as a slur, and the company "TheirStory"
written as the two ordinary words "their story".

`TRANSCRIPT_CORRECTIONS` in `scripts/import-theirstory-stories.ts` fixes these
on the way in. Each entry names the spoken tokens and what they should read as:

```ts
{ from: ['fiji'], to: 'FADGI', note: 'Federal Agencies Digital Guidelines Initiative' },
{ from: ['their', 'story'], to: 'TheirStory', note: 'the company, heard as two ordinary words' },
```

Corrections apply to the timed word stream, the full transcript text, the story
description, and the generated index titles, synopses and notes — the last of
those are written from the transcript and inherit its errors.

A multi-word entry collapses its tokens into one and keeps the span they
covered, so transcript and captions stay aligned. Matching respects word
boundaries, so "Fijian" is left alone, and only the exact token sequence is
matched, so "their stories" — a real plural, not the company — is untouched.

These files are regenerated on every import, so corrections made by hand are
lost the next time a recording is pulled. Add them here instead.

The durable fix is a custom vocabulary on the recogniser; every entry in this
list is a term worth adding there.

## Useful Flags

- `--out-dir json/interviews/my-batch`
- `--force`
- `--token`
- `--page-size 30`
- `--concurrency 5`
- `--format video`
- `--format audio`
- `--generate-missing`
- `--skip-invalid`
- `--unpublish`
- `--validate`
