import { getDb } from '../db/client';
import type {
  AnswerItem,
  AuditLogEntry,
  CommentItem,
  HubStats,
  LeaderboardEntry,
  ListQuestionsRequest,
  ListQuestionsResponse,
  NotificationItem,
  QuestionDetail,
  QuestionStatus,
  QuestionSummary,
  RovoSearchRequest,
  RovoSearchResultItem,
  TagSummary,
  VoteTargetType,
} from '../types/models';
import { clampInt, generateId, normalizeTagSlug, nowIso, parseTagInput, toCsv } from '../utils/formatting';

export interface Actor {
  accountId: string;
  displayName: string;
  isAdmin: boolean;
}

interface QuestionRow {
  id: string;
  space_key: string;
  space_id: string;
  title: string;
  body: string;
  author_account_id: string;
  author_name: string;
  accepted_answer_id: string | null;
  vote_score: number;
  answers_count: number;
  views_count: number;
  status: string;
  promoted_page_id: string | null;
  promoted_page_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AnswerRow {
  id: string;
  question_id: string;
  body: string;
  author_account_id: string;
  author_name: string;
  is_accepted: number;
  accepted_by_account_id: string | null;
  accepted_by_name: string | null;
  vote_score: number;
  created_at: string;
  updated_at: string;
}

interface CommentRow {
  id: string;
  target_type: string;
  target_id: string;
  body: string;
  author_account_id: string;
  author_name: string;
  created_at: string;
}

interface TagRow {
  id: string;
  name: string;
  display_name: string;
  description: string;
  question_count: number;
  created_at: string;
}

export async function ensureMigrated(): Promise<void> {
  await getDb().runMigrations();
}

async function logAudit(
  actor: Actor,
  actionType: string,
  entityType: string,
  entityId: string,
  details: string
): Promise<void> {
  const db = getDb();
  await db.query(
    `INSERT INTO askspace_audit_log (id, actor_account_id, actor_name, action_type, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId('aud'),
      actor.accountId,
      actor.displayName.slice(0, 200),
      actionType,
      entityType,
      entityId,
      details.slice(0, 1000),
      nowIso(),
    ]
  );
}

async function notifyWatchers(
  questionId: string,
  excludeAccountId: string,
  eventType: string,
  message: string
): Promise<void> {
  const db = getDb();
  const watchers = await db.query<{ user_account_id: string }>(
    `SELECT user_account_id FROM askspace_watchers WHERE question_id = ?`,
    [questionId]
  );
  const ts = nowIso();
  for (const w of watchers.rows) {
    if (w.user_account_id === excludeAccountId) continue;
    await db.query(
      `INSERT INTO askspace_notifications (id, recipient_account_id, question_id, event_type, message, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [generateId('ntf'), w.user_account_id, questionId, eventType, message.slice(0, 500), ts]
    );
  }
}

async function upsertAndLinkTags(
  questionId: string,
  rawTags: string | string[],
  actorAccountId: string
): Promise<string[]> {
  const db = getDb();
  const slugs = parseTagInput(rawTags);
  await db.query(`DELETE FROM askspace_question_tags WHERE question_id = ?`, [questionId]);
  const ts = nowIso();
  for (const slug of slugs) {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM askspace_tags WHERE name = ?`,
      [slug]
    );
    let tagId = existing.rows[0]?.id;
    if (!tagId) {
      tagId = generateId('tag');
      await db.query(
        `INSERT INTO askspace_tags (id, name, display_name, description, created_by, created_at)
         VALUES (?, ?, ?, '', ?, ?)`,
        [tagId, slug, slug, actorAccountId, ts]
      );
    }
    await db.query(
      `INSERT INTO askspace_question_tags (question_id, tag_id) VALUES (?, ?)`,
      [questionId, tagId]
    );
  }
  return slugs;
}

async function getTagsForQuestionIds(questionIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (questionIds.length === 0) return map;
  const db = getDb();
  const placeholders = questionIds.map(() => '?').join(', ');
  const res = await db.query<{ question_id: string; display_name: string }>(
    `SELECT qt.question_id, t.display_name
     FROM askspace_question_tags qt
     INNER JOIN askspace_tags t ON t.id = qt.tag_id
     WHERE qt.question_id IN (${placeholders})
     ORDER BY t.display_name ASC`,
    questionIds
  );
  for (const row of res.rows) {
    const list = map.get(row.question_id) ?? [];
    list.push(row.display_name);
    map.set(row.question_id, list);
  }
  return map;
}

async function getUserVotesMap(
  userAccountId: string,
  targetType: VoteTargetType,
  targetIds: string[]
): Promise<Map<string, -1 | 0 | 1>> {
  const map = new Map<string, -1 | 0 | 1>();
  if (!userAccountId || targetIds.length === 0) return map;
  const db = getDb();
  const placeholders = targetIds.map(() => '?').join(', ');
  const res = await db.query<{ target_id: string; vote_value: number }>(
    `SELECT target_id, vote_value FROM askspace_votes
     WHERE user_account_id = ? AND target_type = ? AND target_id IN (${placeholders})`,
    [userAccountId, targetType, ...targetIds]
  );
  for (const row of res.rows) {
    map.set(row.target_id, row.vote_value > 0 ? 1 : row.vote_value < 0 ? -1 : 0);
  }
  return map;
}

async function getWatchingSet(userAccountId: string, questionIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (!userAccountId || questionIds.length === 0) return set;
  const db = getDb();
  const placeholders = questionIds.map(() => '?').join(', ');
  const res = await db.query<{ question_id: string }>(
    `SELECT question_id FROM askspace_watchers
     WHERE user_account_id = ? AND question_id IN (${placeholders})`,
    [userAccountId, ...questionIds]
  );
  for (const row of res.rows) set.add(row.question_id);
  return set;
}

export async function getHubStats(spaceKey?: string | null): Promise<HubStats> {
  await ensureMigrated();
  const db = getDb();
  const hasSpace = Boolean(spaceKey && spaceKey !== 'ALL');
  const qWhere = hasSpace ? `WHERE space_key = ?` : '';
  const qParams = hasSpace ? [spaceKey] : [];

  const qRows = await db.query<{
    total_q: number;
    answered_q: number;
    accepted_q: number;
    unanswered_q: number;
    total_a: number;
  }>(
    `SELECT
       COUNT(*) AS total_q,
       SUM(CASE WHEN answers_count > 0 THEN 1 ELSE 0 END) AS answered_q,
       SUM(CASE WHEN accepted_answer_id IS NOT NULL THEN 1 ELSE 0 END) AS accepted_q,
       SUM(CASE WHEN answers_count = 0 THEN 1 ELSE 0 END) AS unanswered_q,
       COALESCE(SUM(answers_count), 0) AS total_a
     FROM askspace_questions ${qWhere}`,
    qParams
  );

  const r = qRows.rows[0];
  const totalQuestions = Number(r?.total_q ?? 0);
  const answeredQuestions = Number(r?.answered_q ?? 0);
  const acceptedQuestions = Number(r?.accepted_q ?? 0);
  const unansweredQuestions = Number(r?.unanswered_q ?? 0);
  const totalAnswers = Number(r?.total_a ?? 0);
  const resolutionRatePercent =
    totalQuestions > 0 ? Math.round((acceptedQuestions / totalQuestions) * 100) : 0;

  return {
    totalQuestions,
    answeredQuestions,
    acceptedQuestions,
    unansweredQuestions,
    totalAnswers,
    resolutionRatePercent,
  };
}

export async function listQuestions(
  req: ListQuestionsRequest,
  viewerAccountId: string
): Promise<ListQuestionsResponse> {
  await ensureMigrated();
  const db = getDb();

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (req.spaceKey && req.spaceKey !== 'ALL') {
    whereClauses.push('q.space_key = ?');
    params.push(req.spaceKey);
  }

  if (req.status && req.status !== 'all') {
    whereClauses.push('q.status = ?');
    params.push(req.status);
  }

  if (req.sort === 'unanswered') {
    whereClauses.push('q.answers_count = 0');
  } else if (req.sort === 'accepted') {
    whereClauses.push('q.accepted_answer_id IS NOT NULL');
  }

  if (req.search && req.search.trim().length > 0) {
    const like = `%${req.search.trim().toLowerCase()}%`;
    whereClauses.push('(LOWER(q.title) LIKE ? OR LOWER(q.body) LIKE ?)');
    params.push(like, like);
  }

  let tagJoin = '';
  if (req.tag && req.tag.trim().length > 0) {
    const slug = normalizeTagSlug(req.tag);
    tagJoin = `INNER JOIN askspace_question_tags qt ON qt.question_id = q.id
               INNER JOIN askspace_tags t ON t.id = qt.tag_id AND t.name = ?`;
    params.unshift(slug);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  let orderSql = 'ORDER BY q.created_at DESC';
  switch (req.sort) {
    case 'votes':
      orderSql = 'ORDER BY q.vote_score DESC, q.created_at DESC';
      break;
    case 'active':
      orderSql = 'ORDER BY q.updated_at DESC';
      break;
    case 'unanswered':
      orderSql = 'ORDER BY q.vote_score DESC, q.created_at DESC';
      break;
    case 'accepted':
      orderSql = 'ORDER BY q.vote_score DESC, q.updated_at DESC';
      break;
    default:
      orderSql = 'ORDER BY q.created_at DESC';
  }

  const limit = clampInt(req.limit, 25, 1, 100);
  const offset = clampInt(req.offset, 0, 0, 10000);

  const countRes = await db.query<{ cnt: number }>(
    `SELECT COUNT(DISTINCT q.id) AS cnt FROM askspace_questions q ${tagJoin} ${whereSql}`,
    params
  );
  const total = Number(countRes.rows[0]?.cnt ?? 0);

  const rowsRes = await db.query<QuestionRow>(
    `SELECT DISTINCT q.* FROM askspace_questions q ${tagJoin} ${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const qIds = rowsRes.rows.map((r) => r.id);
  const [tagsMap, votesMap, watchSet, stats] = await Promise.all([
    getTagsForQuestionIds(qIds),
    getUserVotesMap(viewerAccountId, 'question', qIds),
    getWatchingSet(viewerAccountId, qIds),
    getHubStats(req.spaceKey),
  ]);

  // Optionally load accepted answer previews (critical for the Inline Q&A & FAQ Macro!)
  const acceptedMap = new Map<string, { body: string; authorName: string }>();
  if (req.includeAcceptedAnswer) {
    const acceptedIds = rowsRes.rows
      .map((r) => r.accepted_answer_id)
      .filter((id): id is string => Boolean(id));
    if (acceptedIds.length > 0) {
      const ph = acceptedIds.map(() => '?').join(', ');
      const aRes = await db.query<{ id: string; body: string; author_name: string }>(
        `SELECT id, body, author_name FROM askspace_answers WHERE id IN (${ph})`,
        acceptedIds
      );
      for (const a of aRes.rows) {
        acceptedMap.set(a.id, { body: a.body, authorName: a.author_name });
      }
    }
  }

  const questions: QuestionSummary[] = rowsRes.rows.map((r) => {
    const acc = r.accepted_answer_id ? acceptedMap.get(r.accepted_answer_id) : undefined;
    return {
      id: r.id,
      spaceKey: r.space_key,
      spaceId: r.space_id,
      title: r.title,
      body: r.body,
      authorAccountId: r.author_account_id,
      authorName: r.author_name,
      acceptedAnswerId: r.accepted_answer_id,
      acceptedAnswerBody: acc?.body ?? null,
      acceptedAnswerAuthor: acc?.authorName ?? null,
      voteScore: Number(r.vote_score),
      answersCount: Number(r.answers_count),
      viewsCount: Number(r.views_count),
      status: r.status as QuestionStatus,
      tags: tagsMap.get(r.id) ?? [],
      promotedPageId: r.promoted_page_id,
      promotedPageUrl: r.promoted_page_url,
      userVote: votesMap.get(r.id) ?? 0,
      isWatching: watchSet.has(r.id),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  return { questions, total, stats };
}

export async function getQuestionDetail(
  questionId: string,
  viewerAccountId: string,
  incrementView = true
): Promise<QuestionDetail | null> {
  await ensureMigrated();
  const db = getDb();

  const qRes = await db.query<QuestionRow>(
    `SELECT * FROM askspace_questions WHERE id = ?`,
    [questionId]
  );
  const r = qRes.rows[0];
  if (!r) return null;

  if (incrementView) {
    await db.query(`UPDATE askspace_questions SET views_count = views_count + 1 WHERE id = ?`, [
      questionId,
    ]);
  }

  const aRes = await db.query<AnswerRow>(
    `SELECT * FROM askspace_answers WHERE question_id = ?
     ORDER BY is_accepted DESC, vote_score DESC, created_at ASC`,
    [questionId]
  );

  const answerIds = aRes.rows.map((a) => a.id);
  const [tagsMap, qVotes, aVotes, watchSet, qCommentsRes] = await Promise.all([
    getTagsForQuestionIds([questionId]),
    getUserVotesMap(viewerAccountId, 'question', [questionId]),
    getUserVotesMap(viewerAccountId, 'answer', answerIds),
    getWatchingSet(viewerAccountId, [questionId]),
    db.query<CommentRow>(
      `SELECT * FROM askspace_comments WHERE target_type = 'question' AND target_id = ? ORDER BY created_at ASC`,
      [questionId]
    ),
  ]);

  const aCommentsMap = new Map<string, CommentItem[]>();
  if (answerIds.length > 0) {
    const ph = answerIds.map(() => '?').join(', ');
    const acRes = await db.query<CommentRow>(
      `SELECT * FROM askspace_comments WHERE target_type = 'answer' AND target_id IN (${ph}) ORDER BY created_at ASC`,
      answerIds
    );
    for (const c of acRes.rows) {
      const list = aCommentsMap.get(c.target_id) ?? [];
      list.push({
        id: c.id,
        targetType: 'answer',
        targetId: c.target_id,
        body: c.body,
        authorAccountId: c.author_account_id,
        authorName: c.author_name,
        createdAt: c.created_at,
      });
      aCommentsMap.set(c.target_id, list);
    }
  }

  const answers: AnswerItem[] = aRes.rows.map((a) => ({
    id: a.id,
    questionId: a.question_id,
    body: a.body,
    authorAccountId: a.author_account_id,
    authorName: a.author_name,
    isAccepted: Number(a.is_accepted) === 1,
    acceptedByAccountId: a.accepted_by_account_id,
    acceptedByName: a.accepted_by_name,
    voteScore: Number(a.vote_score),
    userVote: aVotes.get(a.id) ?? 0,
    comments: aCommentsMap.get(a.id) ?? [],
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  }));

  return {
    id: r.id,
    spaceKey: r.space_key,
    spaceId: r.space_id,
    title: r.title,
    body: r.body,
    authorAccountId: r.author_account_id,
    authorName: r.author_name,
    acceptedAnswerId: r.accepted_answer_id,
    voteScore: Number(r.vote_score),
    answersCount: Number(r.answers_count),
    viewsCount: Number(r.views_count) + (incrementView ? 1 : 0),
    status: r.status as QuestionStatus,
    tags: tagsMap.get(r.id) ?? [],
    promotedPageId: r.promoted_page_id,
    promotedPageUrl: r.promoted_page_url,
    userVote: qVotes.get(r.id) ?? 0,
    isWatching: watchSet.has(r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    answers,
    comments: qCommentsRes.rows.map((c) => ({
      id: c.id,
      targetType: 'question',
      targetId: c.target_id,
      body: c.body,
      authorAccountId: c.author_account_id,
      authorName: c.author_name,
      createdAt: c.created_at,
    })),
  };
}

export async function createQuestion(
  input: {
    spaceKey: string;
    spaceId?: string;
    title: string;
    body: string;
    tags?: string | string[];
  },
  actor: Actor
): Promise<QuestionDetail> {
  await ensureMigrated();
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 5 || title.length > 300) {
    throw new Error('Question title must be between 5 and 300 characters.');
  }
  if (body.length < 10) {
    throw new Error('Please provide at least 10 characters of context for your question.');
  }

  const db = getDb();
  const id = generateId('q');
  const ts = nowIso();
  const spaceKey = (input.spaceKey || 'GLOBAL').trim().slice(0, 128);
  const spaceId = (input.spaceId || '').trim().slice(0, 64);

  await db.query(
    `INSERT INTO askspace_questions
     (id, space_key, space_id, title, body, author_account_id, author_name, accepted_answer_id, vote_score, answers_count, views_count, status, promoted_page_id, promoted_page_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, 0, 'open', NULL, NULL, ?, ?)`,
    [id, spaceKey, spaceId, title, body, actor.accountId, actor.displayName.slice(0, 200), ts, ts]
  );

  if (input.tags) {
    await upsertAndLinkTags(id, input.tags, actor.accountId);
  }

  // Auto-watch own question so author gets answer notifications immediately
  await db.query(
    `INSERT INTO askspace_watchers (question_id, user_account_id, created_at) VALUES (?, ?, ?)`,
    [id, actor.accountId, ts]
  );

  await logAudit(actor, 'QUESTION_CREATED', 'question', id, `Asked "${title}" in space ${spaceKey}`);

  const detail = await getQuestionDetail(id, actor.accountId, false);
  if (!detail) throw new Error('Failed to load created question.');
  return detail;
}

export async function updateQuestion(
  input: {
    questionId: string;
    title: string;
    body: string;
    tags?: string | string[];
  },
  actor: Actor
): Promise<QuestionDetail> {
  await ensureMigrated();
  const db = getDb();
  const existing = await db.query<QuestionRow>(
    `SELECT * FROM askspace_questions WHERE id = ?`,
    [input.questionId]
  );
  const q = existing.rows[0];
  if (!q) throw new Error('Question not found.');
  if (q.author_account_id !== actor.accountId && !actor.isAdmin) {
    throw new Error('Only the question author or a space/site administrator can edit this question.');
  }

  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 5 || title.length > 300) {
    throw new Error('Question title must be between 5 and 300 characters.');
  }
  if (body.length < 10) {
    throw new Error('Question details must be at least 10 characters.');
  }

  await db.query(
    `UPDATE askspace_questions SET title = ?, body = ?, updated_at = ? WHERE id = ?`,
    [title, body, nowIso(), input.questionId]
  );
  if (input.tags !== undefined) {
    await upsertAndLinkTags(input.questionId, input.tags, actor.accountId);
  }
  await logAudit(actor, 'QUESTION_UPDATED', 'question', input.questionId, `Updated "${title}"`);
  const detail = await getQuestionDetail(input.questionId, actor.accountId, false);
  if (!detail) throw new Error('Failed to reload question.');
  return detail;
}

export async function deleteQuestion(questionId: string, actor: Actor): Promise<{ deleted: true }> {
  await ensureMigrated();
  const db = getDb();
  const existing = await db.query<QuestionRow>(
    `SELECT * FROM askspace_questions WHERE id = ?`,
    [questionId]
  );
  const q = existing.rows[0];
  if (!q) throw new Error('Question not found.');
  if (q.author_account_id !== actor.accountId && !actor.isAdmin) {
    throw new Error('Only the question author or an administrator can delete this question.');
  }

  const ansRows = await db.query<{ id: string }>(
    `SELECT id FROM askspace_answers WHERE question_id = ?`,
    [questionId]
  );
  for (const a of ansRows.rows) {
    await db.query(`DELETE FROM askspace_comments WHERE target_type = 'answer' AND target_id = ?`, [a.id]);
    await db.query(`DELETE FROM askspace_votes WHERE target_type = 'answer' AND target_id = ?`, [a.id]);
  }
  await db.query(`DELETE FROM askspace_answers WHERE question_id = ?`, [questionId]);
  await db.query(`DELETE FROM askspace_comments WHERE target_type = 'question' AND target_id = ?`, [questionId]);
  await db.query(`DELETE FROM askspace_votes WHERE target_type = 'question' AND target_id = ?`, [questionId]);
  await db.query(`DELETE FROM askspace_question_tags WHERE question_id = ?`, [questionId]);
  await db.query(`DELETE FROM askspace_watchers WHERE question_id = ?`, [questionId]);
  await db.query(`DELETE FROM askspace_notifications WHERE question_id = ?`, [questionId]);
  await db.query(`DELETE FROM askspace_questions WHERE id = ?`, [questionId]);

  await logAudit(actor, 'QUESTION_DELETED', 'question', questionId, `Deleted "${q.title}"`);
  return { deleted: true };
}

export async function createAnswer(
  input: { questionId: string; body: string },
  actor: Actor
): Promise<QuestionDetail> {
  await ensureMigrated();
  const body = input.body.trim();
  if (body.length < 5) {
    throw new Error('Answer must be at least 5 characters.');
  }

  const db = getDb();
  const qRes = await db.query<QuestionRow>(
    `SELECT * FROM askspace_questions WHERE id = ?`,
    [input.questionId]
  );
  const q = qRes.rows[0];
  if (!q) throw new Error('Question not found.');

  const id = generateId('ans');
  const ts = nowIso();
  await db.query(
    `INSERT INTO askspace_answers
     (id, question_id, body, author_account_id, author_name, is_accepted, accepted_by_account_id, accepted_by_name, vote_score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, 0, ?, ?)`,
    [id, input.questionId, body, actor.accountId, actor.displayName.slice(0, 200), ts, ts]
  );

  await db.query(
    `UPDATE askspace_questions SET answers_count = answers_count + 1, updated_at = ? WHERE id = ?`,
    [ts, input.questionId]
  );

  await notifyWatchers(
    input.questionId,
    actor.accountId,
    'NEW_ANSWER',
    `${actor.displayName} answered "${q.title}"`
  );
  await logAudit(actor, 'ANSWER_CREATED', 'answer', id, `Answered question ${input.questionId}`);

  const detail = await getQuestionDetail(input.questionId, actor.accountId, false);
  if (!detail) throw new Error('Failed to load updated question.');
  return detail;
}

export async function deleteAnswer(
  questionId: string,
  answerId: string,
  actor: Actor
): Promise<QuestionDetail> {
  await ensureMigrated();
  const db = getDb();
  const aRes = await db.query<AnswerRow>(
    `SELECT * FROM askspace_answers WHERE id = ? AND question_id = ?`,
    [answerId, questionId]
  );
  const a = aRes.rows[0];
  if (!a) throw new Error('Answer not found.');
  if (a.author_account_id !== actor.accountId && !actor.isAdmin) {
    throw new Error('Only the answer author or an administrator can delete this answer.');
  }

  await db.query(`DELETE FROM askspace_comments WHERE target_type = 'answer' AND target_id = ?`, [answerId]);
  await db.query(`DELETE FROM askspace_votes WHERE target_type = 'answer' AND target_id = ?`, [answerId]);
  await db.query(`DELETE FROM askspace_answers WHERE id = ?`, [answerId]);

  const ts = nowIso();
  if (Number(a.is_accepted) === 1) {
    await db.query(
      `UPDATE askspace_questions
       SET answers_count = CASE WHEN answers_count > 0 THEN answers_count - 1 ELSE 0 END,
           accepted_answer_id = NULL,
           status = 'open',
           updated_at = ?
       WHERE id = ?`,
      [ts, questionId]
    );
  } else {
    await db.query(
      `UPDATE askspace_questions
       SET answers_count = CASE WHEN answers_count > 0 THEN answers_count - 1 ELSE 0 END,
           updated_at = ?
       WHERE id = ?`,
      [ts, questionId]
    );
  }

  await logAudit(actor, 'ANSWER_DELETED', 'answer', answerId, `Deleted answer on ${questionId}`);
  const detail = await getQuestionDetail(questionId, actor.accountId, false);
  if (!detail) throw new Error('Question not found.');
  return detail;
}

/**
 * Allows EITHER the question author OR a Space/Site Administrator to mark/unmark
 * an Accepted Solution — directly fixing Smart Q&A's top customer complaint.
 */
export async function acceptAnswer(
  questionId: string,
  answerId: string,
  actor: Actor
): Promise<QuestionDetail> {
  await ensureMigrated();
  const db = getDb();
  const qRes = await db.query<QuestionRow>(
    `SELECT * FROM askspace_questions WHERE id = ?`,
    [questionId]
  );
  const q = qRes.rows[0];
  if (!q) throw new Error('Question not found.');

  if (q.author_account_id !== actor.accountId && !actor.isAdmin) {
    throw new Error('Only the question author or a space/site administrator can verify an accepted solution.');
  }

  const aRes = await db.query<AnswerRow>(
    `SELECT * FROM askspace_answers WHERE id = ? AND question_id = ?`,
    [answerId, questionId]
  );
  const ans = aRes.rows[0];
  if (!ans) throw new Error('Answer not found for this question.');

  const ts = nowIso();
  const isAlreadyAccepted = q.accepted_answer_id === answerId;

  // Reset all answers on this question first
  await db.query(
    `UPDATE askspace_answers SET is_accepted = 0, accepted_by_account_id = NULL, accepted_by_name = NULL WHERE question_id = ?`,
    [questionId]
  );

  if (isAlreadyAccepted) {
    await db.query(
      `UPDATE askspace_questions SET accepted_answer_id = NULL, status = 'open', updated_at = ? WHERE id = ?`,
      [ts, questionId]
    );
    await logAudit(actor, 'ANSWER_UNACCEPTED', 'answer', answerId, `Unmarked accepted solution on "${q.title}"`);
  } else {
    await db.query(
      `UPDATE askspace_answers SET is_accepted = 1, accepted_by_account_id = ?, accepted_by_name = ?, updated_at = ? WHERE id = ?`,
      [actor.accountId, actor.displayName.slice(0, 200), ts, answerId]
    );
    await db.query(
      `UPDATE askspace_questions SET accepted_answer_id = ?, status = 'answered', updated_at = ? WHERE id = ?`,
      [answerId, ts, questionId]
    );
    await notifyWatchers(
      questionId,
      actor.accountId,
      'ANSWER_ACCEPTED',
      `${actor.displayName} marked a verified solution on "${q.title}"`
    );
    if (ans.author_account_id !== actor.accountId) {
      await db.query(
        `INSERT INTO askspace_notifications (id, recipient_account_id, question_id, event_type, message, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [
          generateId('ntf'),
          ans.author_account_id,
          questionId,
          'YOUR_ANSWER_ACCEPTED',
          `Your answer on "${q.title}" was marked as the Accepted Solution by ${actor.displayName}!`,
          ts,
        ]
      );
    }
    const roleLabel = q.author_account_id === actor.accountId ? 'author' : 'admin';
    await logAudit(
      actor,
      'ANSWER_ACCEPTED',
      'answer',
      answerId,
      `Marked accepted solution (${roleLabel}) on "${q.title}"`
    );
  }

  const detail = await getQuestionDetail(questionId, actor.accountId, false);
  if (!detail) throw new Error('Question not found.');
  return detail;
}

export async function toggleVote(
  targetType: VoteTargetType,
  targetId: string,
  requestedValue: 1 | -1,
  actor: Actor
): Promise<{ voteScore: number; userVote: -1 | 0 | 1 }> {
  await ensureMigrated();
  if (requestedValue !== 1 && requestedValue !== -1) {
    throw new Error('Vote value must be 1 or -1.');
  }

  const db = getDb();
  const table = targetType === 'question' ? 'askspace_questions' : 'askspace_answers';

  const existingVoteRes = await db.query<{ id: string; vote_value: number }>(
    `SELECT id, vote_value FROM askspace_votes WHERE user_account_id = ? AND target_type = ? AND target_id = ?`,
    [actor.accountId, targetType, targetId]
  );
  const existing = existingVoteRes.rows[0];
  let delta = 0;
  let newUserVote: -1 | 0 | 1 = requestedValue;

  if (!existing) {
    await db.query(
      `INSERT INTO askspace_votes (id, user_account_id, target_type, target_id, vote_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [generateId('vot'), actor.accountId, targetType, targetId, requestedValue, nowIso()]
    );
    delta = requestedValue;
  } else if (Number(existing.vote_value) === requestedValue) {
    // Clicking the same vote toggles it off
    await db.query(`DELETE FROM askspace_votes WHERE id = ?`, [existing.id]);
    delta = -requestedValue;
    newUserVote = 0;
  } else {
    // Switching from +1 to -1 or vice versa
    await db.query(`UPDATE askspace_votes SET vote_value = ? WHERE id = ?`, [
      requestedValue,
      existing.id,
    ]);
    delta = requestedValue - Number(existing.vote_value);
  }

  await db.query(`UPDATE ${table} SET vote_score = vote_score + ? WHERE id = ?`, [delta, targetId]);

  const updated = await db.query<{ vote_score: number }>(
    `SELECT vote_score FROM ${table} WHERE id = ?`,
    [targetId]
  );
  return {
    voteScore: Number(updated.rows[0]?.vote_score ?? 0),
    userVote: newUserVote,
  };
}

export async function addComment(
  input: { questionId: string; targetType: VoteTargetType; targetId: string; body: string },
  actor: Actor
): Promise<QuestionDetail> {
  await ensureMigrated();
  const body = input.body.trim();
  if (body.length < 2 || body.length > 2000) {
    throw new Error('Comment must be between 2 and 2000 characters.');
  }

  const db = getDb();
  const id = generateId('cmt');
  const ts = nowIso();
  await db.query(
    `INSERT INTO askspace_comments (id, target_type, target_id, body, author_account_id, author_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.targetType, input.targetId, body, actor.accountId, actor.displayName.slice(0, 200), ts]
  );

  await notifyWatchers(
    input.questionId,
    actor.accountId,
    'NEW_COMMENT',
    `${actor.displayName} commented on a watched question`
  );
  const detail = await getQuestionDetail(input.questionId, actor.accountId, false);
  if (!detail) throw new Error('Question not found.');
  return detail;
}

export async function toggleWatch(
  questionId: string,
  userAccountId: string
): Promise<{ isWatching: boolean }> {
  await ensureMigrated();
  const db = getDb();
  const existing = await db.query<{ question_id: string }>(
    `SELECT question_id FROM askspace_watchers WHERE question_id = ? AND user_account_id = ?`,
    [questionId, userAccountId]
  );
  if (existing.rows.length > 0) {
    await db.query(`DELETE FROM askspace_watchers WHERE question_id = ? AND user_account_id = ?`, [
      questionId,
      userAccountId,
    ]);
    return { isWatching: false };
  }
  await db.query(
    `INSERT INTO askspace_watchers (question_id, user_account_id, created_at) VALUES (?, ?, ?)`,
    [questionId, userAccountId, nowIso()]
  );
  return { isWatching: true };
}

export async function recordPromotedPage(
  questionId: string,
  pageId: string,
  pageUrl: string,
  actor: Actor
): Promise<QuestionDetail> {
  await ensureMigrated();
  const db = getDb();
  await db.query(
    `UPDATE askspace_questions SET promoted_page_id = ?, promoted_page_url = ?, updated_at = ? WHERE id = ?`,
    [pageId, pageUrl, nowIso(), questionId]
  );
  await logAudit(
    actor,
    'PROMOTED_TO_PAGE',
    'question',
    questionId,
    `Published verified Q&A to Confluence page ${pageId} (${pageUrl})`
  );
  const detail = await getQuestionDetail(questionId, actor.accountId, false);
  if (!detail) throw new Error('Question not found.');
  return detail;
}

export async function listTags(): Promise<TagSummary[]> {
  await ensureMigrated();
  const db = getDb();
  const res = await db.query<TagRow>(
    `SELECT t.id, t.name, t.display_name, t.description, t.created_at,
            COUNT(qt.question_id) AS question_count
     FROM askspace_tags t
     LEFT JOIN askspace_question_tags qt ON qt.tag_id = t.id
     GROUP BY t.id, t.name, t.display_name, t.description, t.created_at
     ORDER BY question_count DESC, t.display_name ASC`
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    displayName: r.display_name,
    description: r.description,
    questionCount: Number(r.question_count ?? 0),
    createdAt: r.created_at,
  }));
}

export async function renameTag(
  tagId: string,
  newName: string,
  description: string,
  actor: Actor
): Promise<TagSummary[]> {
  await ensureMigrated();
  if (!actor.isAdmin) {
    throw new Error('Administrator permission is required to rename tags.');
  }
  const slug = normalizeTagSlug(newName);
  if (!slug) throw new Error('Please provide a valid tag name.');

  const db = getDb();
  const collision = await db.query<{ id: string }>(
    `SELECT id FROM askspace_tags WHERE name = ? AND id <> ?`,
    [slug, tagId]
  );
  if (collision.rows.length > 0) {
    throw new Error(`Tag "${slug}" already exists. Use Merge Tags instead.`);
  }

  await db.query(
    `UPDATE askspace_tags SET name = ?, display_name = ?, description = ? WHERE id = ?`,
    [slug, newName.trim().slice(0, 80), description.trim().slice(0, 300), tagId]
  );
  await logAudit(actor, 'TAG_RENAMED', 'tag', tagId, `Renamed tag to "${slug}"`);
  return listTags();
}

export async function mergeTags(
  sourceTagId: string,
  targetTagId: string,
  actor: Actor
): Promise<TagSummary[]> {
  await ensureMigrated();
  if (!actor.isAdmin) {
    throw new Error('Administrator permission is required to merge tags.');
  }
  if (sourceTagId === targetTagId) {
    throw new Error('Source and target tags must be different.');
  }

  const db = getDb();
  const linked = await db.query<{ question_id: string }>(
    `SELECT question_id FROM askspace_question_tags WHERE tag_id = ?`,
    [sourceTagId]
  );
  for (const row of linked.rows) {
    const already = await db.query<{ question_id: string }>(
      `SELECT question_id FROM askspace_question_tags WHERE question_id = ? AND tag_id = ?`,
      [row.question_id, targetTagId]
    );
    if (already.rows.length === 0) {
      await db.query(
        `INSERT INTO askspace_question_tags (question_id, tag_id) VALUES (?, ?)`,
        [row.question_id, targetTagId]
      );
    }
  }
  await db.query(`DELETE FROM askspace_question_tags WHERE tag_id = ?`, [sourceTagId]);
  await db.query(`DELETE FROM askspace_tags WHERE id = ?`, [sourceTagId]);
  await logAudit(actor, 'TAGS_MERGED', 'tag', targetTagId, `Merged tag ${sourceTagId} into ${targetTagId}`);
  return listTags();
}

export async function listNotifications(userAccountId: string): Promise<NotificationItem[]> {
  await ensureMigrated();
  const db = getDb();
  const res = await db.query<{
    id: string;
    recipient_account_id: string;
    question_id: string;
    event_type: string;
    message: string;
    is_read: number;
    created_at: string;
  }>(
    `SELECT * FROM askspace_notifications WHERE recipient_account_id = ? ORDER BY created_at DESC LIMIT 30`,
    [userAccountId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    recipientAccountId: r.recipient_account_id,
    questionId: r.question_id,
    eventType: r.event_type,
    message: r.message,
    isRead: Number(r.is_read) === 1,
    createdAt: r.created_at,
  }));
}

export async function markNotificationsRead(userAccountId: string): Promise<{ ok: true }> {
  await ensureMigrated();
  await getDb().query(
    `UPDATE askspace_notifications SET is_read = 1 WHERE recipient_account_id = ? AND is_read = 0`,
    [userAccountId]
  );
  return { ok: true };
}

export async function getLeaderboard(spaceKey?: string | null): Promise<LeaderboardEntry[]> {
  await ensureMigrated();
  const db = getDb();
  const hasSpace = Boolean(spaceKey && spaceKey !== 'ALL');
  const joinWhere = hasSpace ? `INNER JOIN askspace_questions q ON q.id = a.question_id AND q.space_key = ?` : '';
  const params = hasSpace ? [spaceKey] : [];

  const res = await db.query<{
    author_account_id: string;
    author_name: string;
    answers_count: number;
    accepted_count: number;
    total_votes: number;
  }>(
    `SELECT a.author_account_id,
            MAX(a.author_name) AS author_name,
            COUNT(*) AS answers_count,
            SUM(CASE WHEN a.is_accepted = 1 THEN 1 ELSE 0 END) AS accepted_count,
            COALESCE(SUM(a.vote_score), 0) AS total_votes
     FROM askspace_answers a
     ${joinWhere}
     GROUP BY a.author_account_id
     ORDER BY accepted_count DESC, total_votes DESC, answers_count DESC
     LIMIT 25`,
    params
  );

  return res.rows.map((r) => {
    const answersCount = Number(r.answers_count ?? 0);
    const acceptedCount = Number(r.accepted_count ?? 0);
    const totalVotes = Number(r.total_votes ?? 0);
    return {
      accountId: r.author_account_id,
      displayName: r.author_name,
      answersCount,
      acceptedCount,
      totalVotes,
      reputationScore: acceptedCount * 15 + totalVotes * 5 + answersCount * 2,
    };
  });
}

export async function listAuditLog(limit = 50): Promise<AuditLogEntry[]> {
  await ensureMigrated();
  const db = getDb();
  const safeLimit = clampInt(limit, 50, 1, 200);
  const res = await db.query<{
    id: string;
    actor_account_id: string;
    actor_name: string;
    action_type: string;
    entity_type: string;
    entity_id: string;
    details: string;
    created_at: string;
  }>(
    `SELECT * FROM askspace_audit_log ORDER BY created_at DESC LIMIT ${safeLimit}`
  );
  return res.rows.map((r) => ({
    id: r.id,
    actorAccountId: r.actor_account_id,
    actorName: r.actor_name,
    actionType: r.action_type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    details: r.details,
    createdAt: r.created_at,
  }));
}

export async function exportQaCsv(spaceKey?: string | null): Promise<string> {
  const { questions } = await listQuestions(
    {
      spaceKey,
      status: 'all',
      sort: 'newest',
      limit: 100,
      offset: 0,
      includeAcceptedAnswer: true,
    },
    ''
  );
  const headers = [
    'Question ID',
    'Space',
    'Title',
    'Status',
    'Votes',
    'Answers',
    'Author',
    'Tags',
    'Accepted Answer',
    'Promoted Page URL',
    'Created At',
  ];
  const rows = questions.map((q) => [
    q.id,
    q.spaceKey,
    q.title,
    q.status,
    q.voteScore,
    q.answersCount,
    q.authorName,
    q.tags.join('; '),
    q.acceptedAnswerBody ?? '',
    q.promotedPageUrl ?? '',
    q.createdAt,
  ]);
  return toCsv(headers, rows);
}

export async function searchForRovo(req: RovoSearchRequest): Promise<RovoSearchResultItem[]> {
  await ensureMigrated();
  const query = (req.query || '').trim();
  const result = await listQuestions(
    {
      spaceKey: req.spaceKey || undefined,
      search: query,
      sort: req.onlyVerified ? 'accepted' : 'votes',
      limit: 8,
      offset: 0,
      includeAcceptedAnswer: true,
    },
    ''
  );

  return result.questions.map((q) => ({
    questionId: q.id,
    spaceKey: q.spaceKey,
    questionTitle: q.title,
    questionBody: q.body.slice(0, 600),
    verifiedAnswer: q.acceptedAnswerBody ? q.acceptedAnswerBody.slice(0, 1200) : null,
    acceptedBy: q.acceptedAnswerAuthor ?? null,
    tags: q.tags,
    voteScore: q.voteScore,
    promotedPageUrl: q.promotedPageUrl,
  }));
}
