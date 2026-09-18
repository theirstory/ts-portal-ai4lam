import React from 'react';
import type { Metadata } from 'next';
import { Box, Divider, Link as MuiLink, Typography } from '@mui/material';
import {
  organizationConfig,
  config,
  isChatEnabled,
  isChatAttachmentsEnabled,
  suggestionsRepositoryUrl,
} from '@/config/organizationConfig';
import { colors } from '@/lib/theme';

export const metadata: Metadata = {
  title: `How AI is used · ${organizationConfig.displayName}`,
  description: `Where artificial intelligence is used in ${organizationConfig.displayName}, what data leaves the server, and what is kept.`,
};

/**
 * A plain account of where AI touches this archive.
 *
 * Written from what the code does rather than from a policy template: each
 * claim here corresponds to something in the import scripts, the NLP service,
 * or the chat route. When any of those change, this page has to change with
 * them — an inaccurate transparency page is worse than none.
 */

const chatModel = config.features?.chat?.model?.trim() || 'a language model';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box component="section" sx={{ mb: 5 }}>
    <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5, fontSize: { xs: '1.25rem', md: '1.5rem' } }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const Paragraph = ({ children }: { children: React.ReactNode }) => (
  <Typography sx={{ mb: 1.5, lineHeight: 1.7, color: 'text.primary' }}>{children}</Typography>
);

const Row = ({ what, who, when }: { what: string; who: string; when: string }) => (
  <Box
    component="tr"
    sx={{ '& td': { borderBottom: `1px solid ${colors.common.border}`, px: 1.5, py: 1.25, verticalAlign: 'top' } }}>
    <Box component="td" sx={{ fontWeight: 600, minWidth: 160 }}>
      {what}
    </Box>
    <Box component="td">{who}</Box>
    <Box component="td" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
      {when}
    </Box>
  </Box>
);

export default function AiTransparencyPage() {
  return (
    <Box sx={{ maxWidth: 860, mx: 'auto', px: { xs: 2, sm: 3, md: 4 }, py: { xs: 3, md: 5 } }}>
      <Typography variant="h3" component="h1" sx={{ fontWeight: 800, mb: 1, fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
        How AI is used here
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 4, fontSize: '1.05rem', lineHeight: 1.6 }}>
        {organizationConfig.displayName} uses artificial intelligence to make spoken recordings searchable. This page
        says where it is used, what leaves this server, and what is kept — so you can judge the material you are reading
        and decide what you are comfortable putting into it.
      </Typography>

      <Section title="The recordings are the record">
        <Paragraph>
          Everything else on this site is derived from the recordings by machine, and machines get things wrong. The
          transcripts contain mishearings, the summaries are a model&apos;s reading of a conversation, and the entity
          labels are a model&apos;s guess at what a name refers to. Where something matters, listen to the recording at
          the timestamp rather than trusting the text beneath it.
        </Paragraph>
      </Section>

      <Section title="Where AI is used">
        <Box sx={{ overflowX: 'auto', mb: 2 }}>
          <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9375rem' }}>
            <Box component="thead">
              <Box
                component="tr"
                sx={{
                  '& th': {
                    textAlign: 'left',
                    px: 1.5,
                    py: 1,
                    borderBottom: `2px solid ${colors.common.border}`,
                    fontWeight: 700,
                  },
                }}>
                <Box component="th">What</Box>
                <Box component="th">How</Box>
                <Box component="th">When</Box>
              </Box>
            </Box>
            <Box component="tbody">
              <Row
                what="Transcripts"
                who="Speech recognition by Speechmatics, run on TheirStory's platform before the recording reached this portal."
                when="Once"
              />
              <Row
                what="Chapters and summaries"
                who="Written from the transcript by OpenAI's GPT API, called from TheirStory's platform, then imported here."
                when="Once"
              />
              <Row
                what="Named entities"
                who="Claude (Anthropic) reads each transcript and proposes the people, organisations, technologies and places named in it."
                when="Once, at import"
              />
              <Row
                what="Search"
                who="An open-source embedding model (LaBSE) running on this server turns text into vectors so that search can match meaning, not just words. No transcript is sent anywhere for this."
                when="Once, at import"
              />
              {isChatEnabled && (
                <Row
                  what="Discover chat"
                  who={`Your question, passages retrieved from the archive, and the chapter summaries are sent to Anthropic's API (${chatModel}), which writes the answer.`}
                  when="Each time you ask"
                />
              )}
            </Box>
          </Box>
        </Box>
        <Paragraph>
          Only the last of these happens while you are here. The rest was done once, when the recordings were prepared,
          and the results are stored on this server.
        </Paragraph>
        <Paragraph>
          All three services are used under terms that say the material sent to them is not used to train their models
          and is not kept on their servers long term. Their own policies are the authoritative statement of that —{' '}
          <MuiLink href="https://www.speechmatics.com/legal" target="_blank" rel="noopener noreferrer">
            Speechmatics
          </MuiLink>
          ,{' '}
          <MuiLink href="https://openai.com/policies" target="_blank" rel="noopener noreferrer">
            OpenAI
          </MuiLink>{' '}
          and{' '}
          <MuiLink href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noopener noreferrer">
            Anthropic
          </MuiLink>
          .
        </Paragraph>
      </Section>

      {isChatEnabled && (
        <Section title="What the chat sends, and where">
          <Paragraph>
            When you ask a question in Discover, this server sends to Anthropic: your question, the conversation so far,
            the passages its search found relevant, and the chapter summaries for the collection. If you have connected
            Zotero, matching items from your library are included too. Nothing else about you is sent — there are no
            accounts here, and no profile to send.
          </Paragraph>
          {isChatAttachmentsEnabled && (
            <Paragraph>
              Anything you attach — a document, an image, or a link you paste into the message — is read by this server
              and sent to the model with your question. Attached text is held in memory for about two hours and then
              dropped; it is never written to disk, and it does not survive a restart of the site. You can remove an
              attachment at any time, and clearing the chat drops all of them.
            </Paragraph>
          )}
          <Paragraph>
            Under Anthropic&apos;s commercial terms, material sent through their API is not used to train their models.
            They retain API traffic for a limited period for safety purposes; their current policies are the
            authoritative source on that, at{' '}
            <MuiLink href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noopener noreferrer">
              anthropic.com/legal
            </MuiLink>
            .
          </Paragraph>
        </Section>
      )}

      <Section title="What this site does not do">
        <Paragraph>
          There are no user accounts, no advertising, and no third-party analytics or tracking scripts. Nothing you
          search for is tied to an identity, because there is no identity to tie it to.
        </Paragraph>
        <Paragraph>
          The archive is behind a shared password. A link you share — to a recording, or to a moment inside one — asks
          for it before showing anything, and then opens at the passage it points to.
        </Paragraph>
      </Section>

      <Section title="When you tell us something is wrong">
        <Paragraph>
          Corrections you submit — to a transcript, an entity, a summary or an index entry — are filed as public issues
          on{' '}
          {suggestionsRepositoryUrl ? (
            <MuiLink href={suggestionsRepositoryUrl} target="_blank" rel="noopener noreferrer">
              the project&apos;s GitHub
            </MuiLink>
          ) : (
            "the project's GitHub"
          )}
          , along with the passage you quoted and, if you give one, your name. Do not put anything private in a
          correction.
        </Paragraph>
      </Section>

      <Section title="If something here is wrong about a person">
        <Paragraph>
          These are oral histories, and the people in them are real. If a transcript or a generated summary says
          something inaccurate about you, or you want a passage looked at, please raise it — use the correction control
          beside the text, or contact the working group directly. A machine&apos;s mistake about a person is worth
          fixing properly rather than leaving in the record.
        </Paragraph>
      </Section>

      <Divider sx={{ my: 4 }} />
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        This page describes the software as it is currently deployed. It is maintained alongside the code rather than
        separately from it; if you find it disagrees with what the site does, that is a bug worth reporting.
      </Typography>
    </Box>
  );
}
