import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Badge,
  Box,
  EmptyState,
  Heading,
  Inline,
  Link,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Tag,
  TagGroup,
  Text,
  useConfig,
  useProductContext,
  xcss,
} from '@forge/react';
import { invoke } from './bridge';
import type { ListQuestionsResponse, MacroConfig, QuestionSummary } from '../types/models';
import { formatShortDate } from '../utils/formatting';

const containerStyle = xcss({
  backgroundColor: 'elevation.surface',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'radius.medium',
  padding: 'space.200',
});

const itemStyle = xcss({
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'radius.small',
  padding: 'space.150',
});

const answerBoxStyle = xcss({
  backgroundColor: 'color.background.success',
  borderColor: 'color.border.success',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'radius.small',
  padding: 'space.150',
});

const FaqMacroApp = () => {
  const productContext = useProductContext();
  const rawConfig = (useConfig() || {}) as MacroConfig;

  const heading = rawConfig.heading || 'Verified Team Q&A & FAQ';
  const mode = rawConfig.mode || 'accepted';
  const tagFilter = rawConfig.tagFilter || '';
  const spaceScope = rawConfig.spaceScope || 'current';
  const showAcceptedAnswers = rawConfig.showAcceptedAnswers !== false;
  const maxItems = Number(rawConfig.maxItems) || 10;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);

  useEffect(() => {
    if (!productContext) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const currentSpaceKey =
          (productContext.extension as { space?: { key?: string } } | undefined)?.space?.key || null;
        const sort =
          mode === 'accepted' ? 'accepted' : mode === 'unanswered' ? 'unanswered' : 'votes';
        const res = await invoke<ListQuestionsResponse>('listQuestions', {
          spaceKey: spaceScope === 'current' && currentSpaceKey ? currentSpaceKey : 'ALL',
          tag: mode === 'tag' && tagFilter ? tagFilter : undefined,
          sort,
          limit: maxItems,
          offset: 0,
          includeAcceptedAnswer: showAcceptedAnswers,
        });
        if (mounted) setQuestions(res.questions);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Unable to load AskSpace Q&A.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [productContext, mode, tagFilter, spaceScope, showAcceptedAnswers, maxItems]);

  if (loading) {
    return (
      <Box xcss={containerStyle}>
        <Inline space="space.100" alignBlock="center">
          <Spinner size="small" />
          <Text>Loading AskSpace Q&amp;A...</Text>
        </Inline>
      </Box>
    );
  }

  if (error) {
    return (
      <SectionMessage appearance="warning" title="AskSpace Q&A Macro">
        <Text>{error}</Text>
      </SectionMessage>
    );
  }

  return (
    <Box xcss={containerStyle}>
      <Stack space="space.150">
        <Inline spread="space-between" alignBlock="center">
          <Inline space="space.100" alignBlock="center">
            <Heading as="h4">{heading}</Heading>
            <Lozenge appearance="inprogress">AskSpace Live Q&amp;A</Lozenge>
          </Inline>
          <Badge>{questions.length}</Badge>
        </Inline>

        {questions.length === 0 ? (
          <EmptyState
            header="No matching Q&A threads yet"
            description="Open AskSpace Q&A from the Space sidebar or Apps menu to ask and verify questions."
          />
        ) : (
          <Stack space="space.150">
            {questions.map((q) => (
              <Box key={q.id} xcss={itemStyle}>
                <Stack space="space.100">
                  <Inline spread="space-between" alignBlock="center" shouldWrap>
                    <Inline space="space.075" alignBlock="center">
                      <Lozenge appearance={q.acceptedAnswerId ? 'success' : 'moved'}>
                        {q.acceptedAnswerId ? '✓ Verified Answer' : 'Open'}
                      </Lozenge>
                      <Badge>{q.voteScore} votes</Badge>
                      <Badge>{q.answersCount} answers</Badge>
                    </Inline>
                    <Text>
                      {q.spaceKey} · {formatShortDate(q.createdAt)}
                    </Text>
                  </Inline>

                  <Heading as="h5">Q: {q.title}</Heading>

                  {showAcceptedAnswers && q.acceptedAnswerBody && (
                    <Box xcss={answerBoxStyle}>
                      <Stack space="space.050">
                        <Text>
                          Verified Answer{q.acceptedAnswerAuthor ? ` by ${q.acceptedAnswerAuthor}` : ''}:
                        </Text>
                        <Text>{q.acceptedAnswerBody}</Text>
                      </Stack>
                    </Box>
                  )}

                  {q.promotedPageUrl && (
                    <Text>
                      Full documentation: <Link href={q.promotedPageUrl}>View Confluence Page</Link>
                    </Text>
                  )}

                  {q.tags.length > 0 && (
                    <TagGroup>
                      {q.tags.map((t) => (
                        <Tag key={t} text={t} color="blueLight" />
                      ))}
                    </TagGroup>
                  )}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <FaqMacroApp />
  </React.StrictMode>
);
