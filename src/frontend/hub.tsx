import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Badge,
  Box,
  Button,
  ButtonGroup,
  DynamicTable,
  EmptyState,
  Heading,
  Inline,
  Label,
  Link,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tag,
  TagGroup,
  Text,
  TextArea,
  Textfield,
  useProductContext,
  xcss,
} from '@forge/react';
import { invoke } from './bridge';
import type {
  AuditLogEntry,
  HubStats,
  LeaderboardEntry,
  ListQuestionsResponse,
  NotificationItem,
  QuestionDetail,
  QuestionSummary,
  SortOption,
  TagSummary,
  ViewerProfile,
} from '../types/models';
import { formatShortDate } from '../utils/formatting';

interface SpaceOption {
  spaceId: string;
  spaceKey: string;
  spaceName: string;
}

interface BootstrapResponse {
  profile: ViewerProfile;
  spaces: SpaceOption[];
  tags: TagSummary[];
  notifications: NotificationItem[];
}

const cardStyle = xcss({
  backgroundColor: 'elevation.surface',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'radius.medium',
  padding: 'space.200',
});

const acceptedCardStyle = xcss({
  backgroundColor: 'color.background.success',
  borderColor: 'color.border.success',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'radius.medium',
  padding: 'space.200',
});

const statBoxStyle = xcss({
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'radius.medium',
  padding: 'space.150',
  minWidth: '140px',
});

const commentBoxStyle = xcss({
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'radius.small',
  padding: 'space.100',
});

const SORT_OPTIONS: Array<{ label: string; value: SortOption }> = [
  { label: 'Newest', value: 'newest' },
  { label: 'Most Voted', value: 'votes' },
  { label: 'Unanswered First', value: 'unanswered' },
  { label: 'Verified FAQs Only', value: 'accepted' },
  { label: 'Recently Active', value: 'active' },
];

const HubApp = () => {
  const productContext = useProductContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Listing state
  const [selectedSpace, setSelectedSpace] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [stats, setStats] = useState<HubStats>({
    totalQuestions: 0,
    answeredQuestions: 0,
    acceptedQuestions: 0,
    unansweredQuestions: 0,
    totalAnswers: 0,
    resolutionRatePercent: 0,
  });
  const [loadingList, setLoadingList] = useState(false);

  // Detail view state
  const [activeQuestion, setActiveQuestion] = useState<QuestionDetail | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [commentTarget, setCommentTarget] = useState<{ type: 'question' | 'answer'; id: string } | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  // Modals
  const [askOpen, setAskOpen] = useState(false);
  const [askTitle, setAskTitle] = useState('');
  const [askBody, setAskBody] = useState('');
  const [askTags, setAskTags] = useState('');
  const [askSpaceKey, setAskSpaceKey] = useState('GLOBAL');

  const [notifOpen, setNotifOpen] = useState(false);

  // Governance / Leaderboard / Audit
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [exportedCsv, setExportedCsv] = useState<string | null>(null);
  const [renameTagId, setRenameTagId] = useState('');
  const [renameTagValue, setRenameTagValue] = useState('');
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');

  const isSpaceScoped = Boolean(profile?.spaceKey);

  const loadQuestions = useCallback(
    async (opts?: { space?: string; search?: string; tag?: string; sort?: SortOption }) => {
      setLoadingList(true);
      setError(null);
      try {
        const res = await invoke<ListQuestionsResponse>('listQuestions', {
          spaceKey: opts?.space ?? selectedSpace,
          search: opts?.search ?? appliedSearch,
          tag: opts?.tag ?? selectedTag,
          sort: opts?.sort ?? sortBy,
          limit: 50,
          offset: 0,
        });
        setQuestions(res.questions);
        setStats(res.stats);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load questions.');
      } finally {
        setLoadingList(false);
      }
    },
    [appliedSearch, selectedSpace, selectedTag, sortBy]
  );

  const loadGovernanceTabs = useCallback(async (spaceKeyFilter: string) => {
    try {
      const [lb, audit, tagList] = await Promise.all([
        invoke<LeaderboardEntry[]>('getLeaderboard', { spaceKey: spaceKeyFilter }),
        invoke<AuditLogEntry[]>('listAuditLog', { limit: 50 }),
        invoke<TagSummary[]>('listTags', {}),
      ]);
      setLeaderboard(lb);
      setAuditEntries(audit);
      setTags(tagList);
    } catch {
      // Secondary tabs fail gracefully
    }
  }, []);

  useEffect(() => {
    if (!productContext) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const boot = await invoke<BootstrapResponse>('getBootstrap', {});
        if (!mounted) return;
        setProfile(boot.profile);
        setSpaces(boot.spaces);
        setTags(boot.tags);
        setNotifications(boot.notifications);
        const initialSpace = boot.profile.spaceKey || 'ALL';
        setSelectedSpace(initialSpace);
        setAskSpaceKey(boot.profile.spaceKey || boot.spaces[0]?.spaceKey || 'GLOBAL');
        if (boot.profile.licenseActive) {
          const list = await invoke<ListQuestionsResponse>('listQuestions', {
            spaceKey: initialSpace,
            sort: 'newest',
            limit: 50,
            offset: 0,
          });
          if (!mounted) return;
          setQuestions(list.questions);
          setStats(list.stats);
          loadGovernanceTabs(initialSpace);
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Unable to initialize AskSpace.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [productContext, loadGovernanceTabs]);

  const openQuestion = async (questionId: string) => {
    setBusyAction(true);
    setError(null);
    setNotice(null);
    try {
      const detail = await invoke<QuestionDetail | null>('getQuestionDetail', { questionId });
      setActiveQuestion(detail);
      setAnswerDraft('');
      setCommentTarget(null);
      setCommentDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load question details.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreateQuestion = async () => {
    setBusyAction(true);
    setError(null);
    try {
      const chosenSpace = spaces.find((s) => s.spaceKey === askSpaceKey);
      const created = await invoke<QuestionDetail>('createQuestion', {
        spaceKey: profile?.spaceKey || askSpaceKey || 'GLOBAL',
        spaceId: profile?.spaceId || chosenSpace?.spaceId || '',
        title: askTitle,
        body: askBody,
        tags: askTags,
      });
      setAskOpen(false);
      setAskTitle('');
      setAskBody('');
      setAskTags('');
      setActiveQuestion(created);
      setNotice('Question published! You are automatically watching it for answers.');
      await loadQuestions();
      await loadGovernanceTabs(selectedSpace);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish question.');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePostAnswer = async () => {
    if (!activeQuestion) return;
    setBusyAction(true);
    setError(null);
    try {
      const updated = await invoke<QuestionDetail>('createAnswer', {
        questionId: activeQuestion.id,
        body: answerDraft,
      });
      setActiveQuestion(updated);
      setAnswerDraft('');
      setNotice('Answer posted and watchers notified.');
      await loadQuestions();
      await loadGovernanceTabs(selectedSpace);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post answer.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleVote = async (targetType: 'question' | 'answer', targetId: string, value: 1 | -1) => {
    setError(null);
    try {
      const res = await invoke<{ voteScore: number; userVote: -1 | 0 | 1 }>('toggleVote', {
        targetType,
        targetId,
        value,
      });
      if (activeQuestion) {
        if (targetType === 'question' && activeQuestion.id === targetId) {
          setActiveQuestion({ ...activeQuestion, voteScore: res.voteScore, userVote: res.userVote });
        } else if (targetType === 'answer') {
          setActiveQuestion({
            ...activeQuestion,
            answers: activeQuestion.answers.map((a) =>
              a.id === targetId ? { ...a, voteScore: res.voteScore, userVote: res.userVote } : a
            ),
          });
        }
      }
      setQuestions((prev) =>
        prev.map((q) =>
          targetType === 'question' && q.id === targetId
            ? { ...q, voteScore: res.voteScore, userVote: res.userVote }
            : q
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vote failed.');
    }
  };

  const handleAcceptAnswer = async (answerId: string) => {
    if (!activeQuestion) return;
    setBusyAction(true);
    setError(null);
    try {
      const updated = await invoke<QuestionDetail>('acceptAnswer', {
        questionId: activeQuestion.id,
        answerId,
        spaceKey: activeQuestion.spaceKey,
      });
      setActiveQuestion(updated);
      setNotice('Updated verified accepted solution status.');
      await loadQuestions();
      await loadGovernanceTabs(selectedSpace);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update accepted solution.');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePromoteToPage = async () => {
    if (!activeQuestion) return;
    setBusyAction(true);
    setError(null);
    try {
      const targetSpace = spaces.find((s) => s.spaceKey === activeQuestion.spaceKey) || spaces[0];
      const updated = await invoke<QuestionDetail>('promoteToConfluencePage', {
        questionId: activeQuestion.id,
        targetSpaceId: activeQuestion.spaceId || targetSpace?.spaceId,
      });
      setActiveQuestion(updated);
      setNotice('Verified Q&A published as a permanent Confluence page!');
      await loadQuestions();
      await loadGovernanceTabs(selectedSpace);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish Confluence page.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleWatch = async () => {
    if (!activeQuestion) return;
    try {
      const res = await invoke<{ isWatching: boolean }>('toggleWatch', {
        questionId: activeQuestion.id,
      });
      setActiveQuestion({ ...activeQuestion, isWatching: res.isWatching });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update watch status.');
    }
  };

  const handleAddComment = async () => {
    if (!activeQuestion || !commentTarget) return;
    setBusyAction(true);
    setError(null);
    try {
      const updated = await invoke<QuestionDetail>('addComment', {
        questionId: activeQuestion.id,
        targetType: commentTarget.type,
        targetId: commentTarget.id,
        body: commentDraft,
      });
      setActiveQuestion(updated);
      setCommentDraft('');
      setCommentTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add comment.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!activeQuestion) return;
    setBusyAction(true);
    setError(null);
    try {
      await invoke('deleteQuestion', { questionId: activeQuestion.id });
      setActiveQuestion(null);
      setNotice('Question deleted.');
      await loadQuestions();
      await loadGovernanceTabs(selectedSpace);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleMarkNotificationsRead = async () => {
    await invoke('markNotificationsRead', {});
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleRenameTag = async () => {
    if (!renameTagId || !renameTagValue.trim()) return;
    setBusyAction(true);
    setError(null);
    try {
      const updated = await invoke<TagSummary[]>('renameTag', {
        tagId: renameTagId,
        newName: renameTagValue,
      });
      setTags(updated);
      setRenameTagId('');
      setRenameTagValue('');
      setNotice('Tag renamed cleanly across all questions.');
      await loadQuestions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tag rename failed.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleMergeTags = async () => {
    if (!mergeSourceId || !mergeTargetId) return;
    setBusyAction(true);
    setError(null);
    try {
      const updated = await invoke<TagSummary[]>('mergeTags', {
        sourceTagId: mergeSourceId,
        targetTagId: mergeTargetId,
      });
      setTags(updated);
      setMergeSourceId('');
      setMergeTargetId('');
      setNotice('Duplicate tags merged successfully.');
      await loadQuestions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tag merge failed.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleExportCsv = async () => {
    setBusyAction(true);
    try {
      const res = await invoke<{ csv: string }>('exportCsv', { spaceKey: selectedSpace });
      setExportedCsv(res.csv);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CSV export failed.');
    } finally {
      setBusyAction(false);
    }
  };

  if (loading) {
    return (
      <Box padding="space.400">
        <Inline space="space.150" alignBlock="center">
          <Spinner size="medium" />
          <Text>Loading AskSpace Q&amp;A Hub...</Text>
        </Inline>
      </Box>
    );
  }

  if (profile && !profile.licenseActive) {
    return (
      <Box padding="space.300">
        <SectionMessage title="AskSpace Subscription Inactive" appearance="warning">
          <Text>
            Your Confluence site does not currently have an active license for AskSpace - Questions &amp; FAQ.
            Please ask a site administrator to activate or renew the app in Manage Apps.
          </Text>
        </SectionMessage>
      </Box>
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const tagSelectOptions = tags.map((t) => ({ label: `${t.displayName} (${t.questionCount})`, value: t.id }));
  const spaceFilterOptions = [
    { label: 'All Spaces (Global)', value: 'ALL' },
    ...spaces.map((s) => ({ label: `${s.spaceName} (${s.spaceKey})`, value: s.spaceKey })),
  ];

  return (
    <Box padding="space.250">
      <Stack space="space.250">
        {/* Top Header */}
        <Inline spread="space-between" alignBlock="center" shouldWrap>
          <Stack space="space.050">
            <Inline space="space.100" alignBlock="center">
              <Heading as="h2">
                {isSpaceScoped ? `AskSpace Q&A — ${profile?.spaceKey}` : 'AskSpace — Company Q&A & Verified FAQ'}
              </Heading>
              <Lozenge appearance="inprogress">Runs on Atlassian</Lozenge>
            </Inline>
            <Text>
              Search verified answers, ask questions, and promote accepted solutions directly into Confluence pages.
            </Text>
          </Stack>
          <Inline space="space.100" alignBlock="center">
            <Button
              appearance="subtle"
              onClick={() => setNotifOpen(true)}
            >
              Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}
            </Button>
            <Button appearance="primary" onClick={() => setAskOpen(true)}>
              Ask a Question
            </Button>
          </Inline>
        </Inline>

        {error && (
          <SectionMessage appearance="error" title="Action could not be completed">
            <Text>{error}</Text>
          </SectionMessage>
        )}

        {notice && (
          <SectionMessage appearance="success" title="Success">
            <Text>{notice}</Text>
          </SectionMessage>
        )}

        {/* KPI Strip */}
        <Inline space="space.150" shouldWrap>
          <Box xcss={statBoxStyle}>
            <Stack space="space.050">
              <Text>Total Questions</Text>
              <Heading as="h3">{stats.totalQuestions}</Heading>
            </Stack>
          </Box>
          <Box xcss={statBoxStyle}>
            <Stack space="space.050">
              <Text>Verified Solutions</Text>
              <Heading as="h3">{stats.acceptedQuestions}</Heading>
            </Stack>
          </Box>
          <Box xcss={statBoxStyle}>
            <Stack space="space.050">
              <Text>Unanswered</Text>
              <Heading as="h3">{stats.unansweredQuestions}</Heading>
            </Stack>
          </Box>
          <Box xcss={statBoxStyle}>
            <Stack space="space.050">
              <Text>Resolution Rate</Text>
              <Heading as="h3">{stats.resolutionRatePercent}%</Heading>
            </Stack>
          </Box>
        </Inline>

        {/* Main Content: Question Detail OR Hub Tabs */}
        {activeQuestion ? (
          <Stack space="space.200">
            <Inline spread="space-between" alignBlock="center">
              <Button appearance="subtle" onClick={() => setActiveQuestion(null)}>
                ← Back to All Questions
              </Button>
              <ButtonGroup>
                <Button appearance="subtle" onClick={handleToggleWatch}>
                  {activeQuestion.isWatching ? 'Watching ✓' : 'Watch Question'}
                </Button>
                {activeQuestion.acceptedAnswerId && !activeQuestion.promotedPageUrl && (
                  <Button
                    appearance="primary"
                    isDisabled={busyAction}
                    onClick={handlePromoteToPage}
                  >
                    Publish to Confluence Page
                  </Button>
                )}
                {(activeQuestion.authorAccountId === profile?.accountId || profile?.isAdmin) && (
                  <Button appearance="danger" isDisabled={busyAction} onClick={handleDeleteQuestion}>
                    Delete
                  </Button>
                )}
              </ButtonGroup>
            </Inline>

            {/* Question Card */}
            <Box xcss={cardStyle}>
              <Stack space="space.150">
                <Inline spread="space-between" alignBlock="start" shouldWrap>
                  <Stack space="space.050">
                    <Inline space="space.100" alignBlock="center">
                      <Lozenge appearance={activeQuestion.acceptedAnswerId ? 'success' : 'moved'}>
                        {activeQuestion.acceptedAnswerId ? 'Verified FAQ' : 'Open'}
                      </Lozenge>
                      <Lozenge appearance="default">{activeQuestion.spaceKey}</Lozenge>
                      <Text>
                        Asked by {activeQuestion.authorName} on {formatShortDate(activeQuestion.createdAt)} ·{' '}
                        {activeQuestion.viewsCount} views
                      </Text>
                    </Inline>
                    <Heading as="h3">{activeQuestion.title}</Heading>
                  </Stack>
                  <Inline space="space.050" alignBlock="center">
                    <Button
                      appearance={activeQuestion.userVote === 1 ? 'primary' : 'subtle'}
                      onClick={() => handleVote('question', activeQuestion.id, 1)}
                    >
                      ▲
                    </Button>
                    <Badge>{activeQuestion.voteScore}</Badge>
                    <Button
                      appearance={activeQuestion.userVote === -1 ? 'danger' : 'subtle'}
                      onClick={() => handleVote('question', activeQuestion.id, -1)}
                    >
                      ▼
                    </Button>
                  </Inline>
                </Inline>

                <Text>{activeQuestion.body}</Text>

                {activeQuestion.tags.length > 0 && (
                  <TagGroup>
                    {activeQuestion.tags.map((t) => (
                      <Tag key={t} text={t} color="blueLight" />
                    ))}
                  </TagGroup>
                )}

                {activeQuestion.promotedPageUrl && (
                  <SectionMessage appearance="information" title="Published to Confluence Documentation">
                    <Text>
                      This verified Q&amp;A has been promoted to a permanent page:{' '}
                      <Link href={activeQuestion.promotedPageUrl}>Open Confluence Page</Link>
                    </Text>
                  </SectionMessage>
                )}

                {/* Question Comments */}
                {activeQuestion.comments.length > 0 && (
                  <Stack space="space.075">
                    {activeQuestion.comments.map((c) => (
                      <Box key={c.id} xcss={commentBoxStyle}>
                        <Text>
                          {c.body} — {c.authorName} ({formatShortDate(c.createdAt)})
                        </Text>
                      </Box>
                    ))}
                  </Stack>
                )}

                <Inline>
                  <Button
                    appearance="subtle"
                    onClick={() => setCommentTarget({ type: 'question', id: activeQuestion.id })}
                  >
                    Add Comment
                  </Button>
                </Inline>

                {commentTarget?.type === 'question' && commentTarget.id === activeQuestion.id && (
                  <Stack space="space.100">
                    <Textfield
                      placeholder="Write a clarifying comment..."
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                    />
                    <Inline space="space.100">
                      <Button appearance="primary" isDisabled={busyAction} onClick={handleAddComment}>
                        Post Comment
                      </Button>
                      <Button appearance="subtle" onClick={() => setCommentTarget(null)}>
                        Cancel
                      </Button>
                    </Inline>
                  </Stack>
                )}
              </Stack>
            </Box>

            {/* Answers Section */}
            <Heading as="h4">Answers ({activeQuestion.answers.length})</Heading>

            {activeQuestion.answers.length === 0 ? (
              <EmptyState
                header="No answers yet"
                description="Share the verified solution below to help your team and enable Rovo AI discovery."
              />
            ) : (
              <Stack space="space.150">
                {activeQuestion.answers.map((ans) => {
                  const canAccept =
                    activeQuestion.authorAccountId === profile?.accountId || Boolean(profile?.isAdmin);
                  return (
                    <Box key={ans.id} xcss={ans.isAccepted ? acceptedCardStyle : cardStyle}>
                      <Stack space="space.150">
                        <Inline spread="space-between" alignBlock="center" shouldWrap>
                          <Inline space="space.100" alignBlock="center">
                            {ans.isAccepted && (
                              <Lozenge appearance="success">
                                ✓ Verified Solution{ans.acceptedByName ? ` (by ${ans.acceptedByName})` : ''}
                              </Lozenge>
                            )}
                            <Text>
                              Answered by {ans.authorName} on {formatShortDate(ans.createdAt)}
                            </Text>
                          </Inline>
                          <Inline space="space.075" alignBlock="center">
                            <Button
                              appearance={ans.userVote === 1 ? 'primary' : 'subtle'}
                              onClick={() => handleVote('answer', ans.id, 1)}
                            >
                              ▲
                            </Button>
                            <Badge>{ans.voteScore}</Badge>
                            <Button
                              appearance={ans.userVote === -1 ? 'danger' : 'subtle'}
                              onClick={() => handleVote('answer', ans.id, -1)}
                            >
                              ▼
                            </Button>
                            {canAccept && (
                              <Button
                                appearance={ans.isAccepted ? 'subtle' : 'primary'}
                                isDisabled={busyAction}
                                onClick={() => handleAcceptAnswer(ans.id)}
                              >
                                {ans.isAccepted ? 'Unmark Accepted' : 'Mark Accepted Solution'}
                              </Button>
                            )}
                          </Inline>
                        </Inline>

                        <Text>{ans.body}</Text>

                        {ans.comments.length > 0 && (
                          <Stack space="space.075">
                            {ans.comments.map((c) => (
                              <Box key={c.id} xcss={commentBoxStyle}>
                                <Text>
                                  {c.body} — {c.authorName} ({formatShortDate(c.createdAt)})
                                </Text>
                              </Box>
                            ))}
                          </Stack>
                        )}

                        <Inline>
                          <Button
                            appearance="subtle"
                            onClick={() => setCommentTarget({ type: 'answer', id: ans.id })}
                          >
                            Comment on Answer
                          </Button>
                        </Inline>

                        {commentTarget?.type === 'answer' && commentTarget.id === ans.id && (
                          <Stack space="space.100">
                            <Textfield
                              placeholder="Add a comment on this answer..."
                              value={commentDraft}
                              onChange={(e) => setCommentDraft(e.target.value)}
                            />
                            <Inline space="space.100">
                              <Button appearance="primary" isDisabled={busyAction} onClick={handleAddComment}>
                                Post Comment
                              </Button>
                              <Button appearance="subtle" onClick={() => setCommentTarget(null)}>
                                Cancel
                              </Button>
                            </Inline>
                          </Stack>
                        )}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}

            {/* Answer Composer */}
            <Box xcss={cardStyle}>
              <Stack space="space.150">
                <Heading as="h4">Your Answer</Heading>
                <TextArea
                  placeholder="Write a clear, actionable solution (supports multi-paragraph steps and ```code``` blocks when promoted to Confluence pages)..."
                  minimumRows={5}
                  value={answerDraft}
                  onChange={(e) => setAnswerDraft(e.target.value)}
                />
                <Inline>
                  <Button
                    appearance="primary"
                    isDisabled={busyAction || answerDraft.trim().length < 5}
                    onClick={handlePostAnswer}
                  >
                    Post Answer
                  </Button>
                </Inline>
              </Stack>
            </Box>
          </Stack>
        ) : (
          <Tabs id="askspace-main-tabs">
            <TabList>
              <Tab>Questions ({stats.totalQuestions})</Tab>
              <Tab>Tags &amp; Governance ({tags.length})</Tab>
              <Tab>Leaderboard</Tab>
              <Tab>Audit Log &amp; Export</Tab>
            </TabList>

            {/* TAB 1: QUESTIONS */}
            <TabPanel>
              <Box paddingBlockStart="space.200">
                <Stack space="space.200">
                  <Inline space="space.150" alignBlock="end" shouldWrap>
                    <Box>
                      <Label labelFor="search-q">Search Q&amp;A</Label>
                      <Textfield
                        id="search-q"
                        placeholder="Search questions or answers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </Box>
                    <Button
                      appearance="default"
                      onClick={() => {
                        setAppliedSearch(searchQuery);
                        loadQuestions({ search: searchQuery });
                      }}
                    >
                      Search
                    </Button>
                    {!isSpaceScoped && (
                      <Box>
                        <Label labelFor="space-filter">Space</Label>
                        <Select
                          inputId="space-filter"
                          options={spaceFilterOptions}
                          value={spaceFilterOptions.find((o) => o.value === selectedSpace)}
                          onChange={(opt) => {
                            const val = (opt as { value?: string })?.value || 'ALL';
                            setSelectedSpace(val);
                            loadQuestions({ space: val });
                            loadGovernanceTabs(val);
                          }}
                        />
                      </Box>
                    )}
                    <Box>
                      <Label labelFor="sort-filter">Sort / Filter</Label>
                      <Select
                        inputId="sort-filter"
                        options={SORT_OPTIONS}
                        value={SORT_OPTIONS.find((o) => o.value === sortBy)}
                        onChange={(opt) => {
                          const val = ((opt as { value?: SortOption })?.value || 'newest') as SortOption;
                          setSortBy(val);
                          loadQuestions({ sort: val });
                        }}
                      />
                    </Box>
                    {(selectedTag || appliedSearch) && (
                      <Button
                        appearance="subtle"
                        onClick={() => {
                          setSelectedTag('');
                          setSearchQuery('');
                          setAppliedSearch('');
                          loadQuestions({ tag: '', search: '' });
                        }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </Inline>

                  {selectedTag && (
                    <Inline space="space.100" alignBlock="center">
                      <Text>Filtered by tag:</Text>
                      <Lozenge appearance="inprogress">{selectedTag}</Lozenge>
                    </Inline>
                  )}

                  {loadingList ? (
                    <Spinner size="medium" />
                  ) : questions.length === 0 ? (
                    <EmptyState
                      header="No questions found"
                      description="Be the first to ask a question in this space and start building your team's verified FAQ."
                      primaryAction={
                        <Button appearance="primary" onClick={() => setAskOpen(true)}>
                          Ask a Question
                        </Button>
                      }
                    />
                  ) : (
                    <Stack space="space.150">
                      {questions.map((q) => (
                        <Box key={q.id} xcss={cardStyle}>
                          <Stack space="space.100">
                            <Inline spread="space-between" alignBlock="center" shouldWrap>
                              <Inline space="space.100" alignBlock="center">
                                <Lozenge appearance={q.acceptedAnswerId ? 'success' : 'moved'}>
                                  {q.acceptedAnswerId ? '✓ Verified' : 'Open'}
                                </Lozenge>
                                <Lozenge appearance="default">{q.spaceKey}</Lozenge>
                                <Badge>{q.voteScore} votes</Badge>
                                <Badge>{q.answersCount} answers</Badge>
                              </Inline>
                              <Text>
                                {q.authorName} · {formatShortDate(q.createdAt)}
                              </Text>
                            </Inline>

                            <Heading as="h4">{q.title}</Heading>
                            <Text>
                              {q.body.length > 220 ? `${q.body.slice(0, 220)}...` : q.body}
                            </Text>

                            <Inline spread="space-between" alignBlock="center" shouldWrap>
                              <TagGroup>
                                {q.tags.map((t) => (
                                  <Tag key={t} text={t} color="blueLight" />
                                ))}
                              </TagGroup>
                              <Button appearance="default" onClick={() => openQuestion(q.id)}>
                                Open Thread →
                              </Button>
                            </Inline>
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Box>
            </TabPanel>

            {/* TAB 2: TAGS & GOVERNANCE */}
            <TabPanel>
              <Box paddingBlockStart="space.200">
                <Stack space="space.250">
                  <Heading as="h4">All Topics &amp; Tags</Heading>
                  {tags.length === 0 ? (
                    <EmptyState header="No tags yet" description="Add comma-separated tags when asking questions." />
                  ) : (
                    <Inline space="space.100" shouldWrap>
                      {tags.map((t) => (
                        <Button
                          key={t.id}
                          appearance="subtle"
                          onClick={() => {
                            setSelectedTag(t.name);
                            loadQuestions({ tag: t.name });
                          }}
                        >
                          #{t.displayName} ({t.questionCount})
                        </Button>
                      ))}
                    </Inline>
                  )}

                  {profile?.isAdmin && tags.length > 0 && (
                    <Box xcss={cardStyle}>
                      <Stack space="space.200">
                        <Heading as="h4">Administrator Tag Governance (Rename &amp; Merge Duplicates)</Heading>
                        <Inline space="space.150" alignBlock="end" shouldWrap>
                          <Box>
                            <Label labelFor="rename-select">Select Tag to Rename</Label>
                            <Select
                              inputId="rename-select"
                              options={tagSelectOptions}
                              value={tagSelectOptions.find((o) => o.value === renameTagId) || null}
                              onChange={(opt) => setRenameTagId((opt as { value?: string })?.value || '')}
                            />
                          </Box>
                          <Box>
                            <Label labelFor="rename-new">New Tag Name</Label>
                            <Textfield
                              id="rename-new"
                              placeholder="e.g., onboarding"
                              value={renameTagValue}
                              onChange={(e) => setRenameTagValue(e.target.value)}
                            />
                          </Box>
                          <Button appearance="primary" isDisabled={busyAction} onClick={handleRenameTag}>
                            Rename Tag
                          </Button>
                        </Inline>

                        {tags.length >= 2 && (
                          <Inline space="space.150" alignBlock="end" shouldWrap>
                            <Box>
                              <Label labelFor="merge-src">Duplicate Tag (Remove)</Label>
                              <Select
                                inputId="merge-src"
                                options={tagSelectOptions}
                                value={tagSelectOptions.find((o) => o.value === mergeSourceId) || null}
                                onChange={(opt) => setMergeSourceId((opt as { value?: string })?.value || '')}
                              />
                            </Box>
                            <Box>
                              <Label labelFor="merge-dst">Keep Tag (Merge Into)</Label>
                              <Select
                                inputId="merge-dst"
                                options={tagSelectOptions}
                                value={tagSelectOptions.find((o) => o.value === mergeTargetId) || null}
                                onChange={(opt) => setMergeTargetId((opt as { value?: string })?.value || '')}
                              />
                            </Box>
                            <Button appearance="warning" isDisabled={busyAction} onClick={handleMergeTags}>
                              Merge Tags
                            </Button>
                          </Inline>
                        )}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              </Box>
            </TabPanel>

            {/* TAB 3: LEADERBOARD */}
            <TabPanel>
              <Box paddingBlockStart="space.200">
                <Stack space="space.150">
                  <Heading as="h4">Top Knowledge Contributors</Heading>
                  {leaderboard.length === 0 ? (
                    <EmptyState
                      header="No contributors yet"
                      description="Answer questions and earn verified solutions to appear on the leaderboard."
                    />
                  ) : (
                    <DynamicTable
                      head={{
                        cells: [
                          { key: 'rank', content: '#' },
                          { key: 'user', content: 'Contributor' },
                          { key: 'accepted', content: 'Verified Solutions' },
                          { key: 'answers', content: 'Total Answers' },
                          { key: 'votes', content: 'Upvotes' },
                          { key: 'rep', content: 'Reputation' },
                        ],
                      }}
                      rows={leaderboard.map((entry, idx) => ({
                        key: entry.accountId,
                        cells: [
                          { key: 'rank', content: String(idx + 1) },
                          { key: 'user', content: entry.displayName },
                          { key: 'accepted', content: String(entry.acceptedCount) },
                          { key: 'answers', content: String(entry.answersCount) },
                          { key: 'votes', content: String(entry.totalVotes) },
                          { key: 'rep', content: String(entry.reputationScore) },
                        ],
                      }))}
                    />
                  )}
                </Stack>
              </Box>
            </TabPanel>

            {/* TAB 4: AUDIT LOG & EXPORT */}
            <TabPanel>
              <Box paddingBlockStart="space.200">
                <Stack space="space.200">
                  <Inline spread="space-between" alignBlock="center">
                    <Heading as="h4">Governance Audit Trail</Heading>
                    <Button appearance="default" isDisabled={busyAction} onClick={handleExportCsv}>
                      Generate Q&amp;A CSV Export
                    </Button>
                  </Inline>

                  {exportedCsv !== null && (
                    <Box xcss={cardStyle}>
                      <Stack space="space.100">
                        <Inline spread="space-between" alignBlock="center">
                          <Heading as="h5">CSV Export (Copy &amp; Save as .csv)</Heading>
                          <Button appearance="subtle" onClick={() => setExportedCsv(null)}>
                            Close
                          </Button>
                        </Inline>
                        <TextArea isReadOnly minimumRows={6} value={exportedCsv} />
                      </Stack>
                    </Box>
                  )}

                  {auditEntries.length === 0 ? (
                    <EmptyState
                      header="Audit trail is empty"
                      description="All questions, answers, admin acceptances, tag merges, and Confluence page promotions are recorded automatically."
                    />
                  ) : (
                    <DynamicTable
                      rowsPerPage={15}
                      head={{
                        cells: [
                          { key: 'date', content: 'Date' },
                          { key: 'actor', content: 'User' },
                          { key: 'action', content: 'Action' },
                          { key: 'details', content: 'Details' },
                        ],
                      }}
                      rows={auditEntries.map((ev) => ({
                        key: ev.id,
                        cells: [
                          { key: 'date', content: formatShortDate(ev.createdAt) },
                          { key: 'actor', content: ev.actorName },
                          { key: 'action', content: <Lozenge>{ev.actionType}</Lozenge> },
                          { key: 'details', content: ev.details },
                        ],
                      }))}
                    />
                  )}
                </Stack>
              </Box>
            </TabPanel>
          </Tabs>
        )}

        {/* ASK QUESTION MODAL */}
        <ModalTransition>
          {askOpen && (
            <Modal onClose={() => setAskOpen(false)} width="large">
              <ModalHeader>
                <ModalTitle>Ask a Question in AskSpace</ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Stack space="space.150">
                  {!isSpaceScoped && spaces.length > 0 && (
                    <Box>
                      <Label labelFor="ask-space">Target Confluence Space</Label>
                      <Select
                        inputId="ask-space"
                        options={spaces.map((s) => ({
                          label: `${s.spaceName} (${s.spaceKey})`,
                          value: s.spaceKey,
                        }))}
                        value={
                          spaces
                            .map((s) => ({ label: `${s.spaceName} (${s.spaceKey})`, value: s.spaceKey }))
                            .find((o) => o.value === askSpaceKey) || null
                        }
                        onChange={(opt) => setAskSpaceKey((opt as { value?: string })?.value || 'GLOBAL')}
                      />
                    </Box>
                  )}
                  <Box>
                    <Label labelFor="ask-title">Question Title</Label>
                    <Textfield
                      id="ask-title"
                      placeholder="e.g., How do we request staging AWS access?"
                      value={askTitle}
                      onChange={(e) => setAskTitle(e.target.value)}
                    />
                  </Box>
                  <Box>
                    <Label labelFor="ask-body">Context &amp; Details</Label>
                    <TextArea
                      id="ask-body"
                      minimumRows={5}
                      placeholder="Include relevant links, error messages, or what you already tried..."
                      value={askBody}
                      onChange={(e) => setAskBody(e.target.value)}
                    />
                  </Box>
                  <Box>
                    <Label labelFor="ask-tags">Tags (comma-separated)</Label>
                    <Textfield
                      id="ask-tags"
                      placeholder="e.g., onboarding, aws, security"
                      value={askTags}
                      onChange={(e) => setAskTags(e.target.value)}
                    />
                  </Box>
                </Stack>
              </ModalBody>
              <ModalFooter>
                <Button appearance="subtle" onClick={() => setAskOpen(false)}>
                  Cancel
                </Button>
                <Button
                  appearance="primary"
                  isDisabled={busyAction || askTitle.trim().length < 5 || askBody.trim().length < 10}
                  onClick={handleCreateQuestion}
                >
                  Publish Question
                </Button>
              </ModalFooter>
            </Modal>
          )}
        </ModalTransition>

        {/* NOTIFICATIONS MODAL */}
        <ModalTransition>
          {notifOpen && (
            <Modal onClose={() => setNotifOpen(false)}>
              <ModalHeader>
                <ModalTitle>Notifications</ModalTitle>
              </ModalHeader>
              <ModalBody>
                {notifications.length === 0 ? (
                  <Text>You are all caught up! Watch questions to get alerts on new answers.</Text>
                ) : (
                  <Stack space="space.100">
                    {notifications.map((n) => (
                      <Box key={n.id} xcss={cardStyle}>
                        <Stack space="space.050">
                          <Inline spread="space-between" alignBlock="center">
                            <Lozenge appearance={n.isRead ? 'default' : 'inprogress'}>
                              {n.eventType}
                            </Lozenge>
                            <Text>{formatShortDate(n.createdAt)}</Text>
                          </Inline>
                          <Text>{n.message}</Text>
                          <Button
                            appearance="subtle"
                            onClick={() => {
                              setNotifOpen(false);
                              openQuestion(n.questionId);
                            }}
                          >
                            View Thread →
                          </Button>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                )}
              </ModalBody>
              <ModalFooter>
                {unreadCount > 0 && (
                  <Button appearance="default" onClick={handleMarkNotificationsRead}>
                    Mark All Read
                  </Button>
                )}
                <Button appearance="primary" onClick={() => setNotifOpen(false)}>
                  Close
                </Button>
              </ModalFooter>
            </Modal>
          )}
        </ModalTransition>
      </Stack>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <HubApp />
  </React.StrictMode>
);
