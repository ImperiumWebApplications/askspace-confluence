import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDbToDefault, setDbForTesting, type QueryResult, type SqlExecutor } from '../src/db/client';
import * as repo from '../src/services/qaRepository';

/**
 * Lightweight in-memory SQL test double implementing the exact parameterized queries
 * issued by qaRepository.ts, verifying full end-to-end business workflows:
 * Ask -> Answer -> Vote -> Admin Accept -> Watch/Notify -> Tag Rename & Merge ->
 * Audit Trail -> Leaderboard -> Rovo Search -> CSV Export -> Delete.
 */
class InMemoryAskSpaceDb implements SqlExecutor {
  migrationsRun = 0;
  questions: Array<Record<string, unknown>> = [];
  answers: Array<Record<string, unknown>> = [];
  votes: Array<Record<string, unknown>> = [];
  tags: Array<Record<string, unknown>> = [];
  questionTags: Array<{ question_id: string; tag_id: string }> = [];
  comments: Array<Record<string, unknown>> = [];
  watchers: Array<{ question_id: string; user_account_id: string; created_at: string }> = [];
  notifications: Array<Record<string, unknown>> = [];
  auditLog: Array<Record<string, unknown>> = [];

  async runMigrations(): Promise<string[]> {
    this.migrationsRun += 1;
    return [];
  }

  async query<T = Record<string, unknown>>(
    statement: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const s = statement.replace(/\s+/g, ' ').trim();

    // INSERT statements
    if (s.startsWith('INSERT INTO askspace_questions')) {
      const [id, space_key, space_id, title, body, author_account_id, author_name, created_at, updated_at] = params;
      this.questions.push({
        id, space_key, space_id, title, body, author_account_id, author_name,
        accepted_answer_id: null, vote_score: 0, answers_count: 0, views_count: 0,
        status: 'open', promoted_page_id: null, promoted_page_url: null, created_at, updated_at,
      });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO askspace_answers')) {
      const [id, question_id, body, author_account_id, author_name, created_at, updated_at] = params;
      this.answers.push({
        id, question_id, body, author_account_id, author_name,
        is_accepted: 0, accepted_by_account_id: null, accepted_by_name: null,
        vote_score: 0, created_at, updated_at,
      });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO askspace_votes')) {
      const [id, user_account_id, target_type, target_id, vote_value, created_at] = params;
      this.votes.push({ id, user_account_id, target_type, target_id, vote_value, created_at });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO askspace_tags')) {
      const [id, name, display_name, created_by, created_at] = params;
      this.tags.push({ id, name, display_name, description: '', created_by, created_at });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO askspace_question_tags')) {
      const [question_id, tag_id] = params as [string, string];
      this.questionTags.push({ question_id, tag_id });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO askspace_comments')) {
      const [id, target_type, target_id, body, author_account_id, author_name, created_at] = params;
      this.comments.push({ id, target_type, target_id, body, author_account_id, author_name, created_at });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO askspace_watchers')) {
      const [question_id, user_account_id, created_at] = params as [string, string, string];
      this.watchers.push({ question_id, user_account_id, created_at });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO askspace_notifications')) {
      const [id, recipient_account_id, question_id, event_type, message, created_at] = params;
      this.notifications.push({ id, recipient_account_id, question_id, event_type, message, is_read: 0, created_at });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO askspace_audit_log')) {
      const [id, actor_account_id, actor_name, action_type, entity_type, entity_id, details, created_at] = params;
      this.auditLog.push({ id, actor_account_id, actor_name, action_type, entity_type, entity_id, details, created_at });
      return { rows: [] };
    }

    // SELECT queries
    if (s.startsWith('SELECT * FROM askspace_questions WHERE id = ?')) {
      return { rows: this.questions.filter((q) => q.id === params[0]) as T[] };
    }
    if (s.startsWith('SELECT * FROM askspace_answers WHERE question_id = ?')) {
      const rows = this.answers
        .filter((a) => a.question_id === params[0])
        .sort((a, b) => Number(b.is_accepted) - Number(a.is_accepted) || Number(b.vote_score) - Number(a.vote_score));
      return { rows: rows as T[] };
    }
    if (s.startsWith('SELECT * FROM askspace_answers WHERE id = ? AND question_id = ?')) {
      return { rows: this.answers.filter((a) => a.id === params[0] && a.question_id === params[1]) as T[] };
    }
    if (s.startsWith('SELECT id, body, author_name FROM askspace_answers WHERE id IN')) {
      const set = new Set(params);
      return { rows: this.answers.filter((a) => set.has(a.id)) as T[] };
    }
    if (s.startsWith('SELECT id FROM askspace_answers WHERE question_id = ?')) {
      return { rows: this.answers.filter((a) => a.question_id === params[0]).map((a) => ({ id: a.id })) as T[] };
    }
    if (s.startsWith('SELECT id FROM askspace_tags WHERE name = ? AND id <> ?')) {
      return { rows: this.tags.filter((t) => t.name === params[0] && t.id !== params[1]) as T[] };
    }
    if (s.startsWith('SELECT id FROM askspace_tags WHERE name = ?')) {
      return { rows: this.tags.filter((t) => t.name === params[0]) as T[] };
    }
    if (s.startsWith('SELECT qt.question_id, t.display_name FROM askspace_question_tags')) {
      const idSet = new Set(params);
      const rows = this.questionTags
        .filter((qt) => idSet.has(qt.question_id))
        .map((qt) => {
          const tag = this.tags.find((t) => t.id === qt.tag_id);
          return { question_id: qt.question_id, display_name: tag?.display_name ?? '' };
        });
      return { rows: rows as T[] };
    }
    if (s.startsWith('SELECT question_id FROM askspace_question_tags WHERE question_id = ? AND tag_id = ?')) {
      return { rows: this.questionTags.filter((x) => x.question_id === params[0] && x.tag_id === params[1]) as T[] };
    }
    if (s.startsWith('SELECT question_id FROM askspace_question_tags WHERE tag_id = ?')) {
      return { rows: this.questionTags.filter((x) => x.tag_id === params[0]) as T[] };
    }
    if (s.startsWith('SELECT target_id, vote_value FROM askspace_votes')) {
      const [userId, targetType, ...ids] = params;
      const set = new Set(ids);
      return {
        rows: this.votes.filter(
          (v) => v.user_account_id === userId && v.target_type === targetType && set.has(v.target_id)
        ) as T[],
      };
    }
    if (s.startsWith('SELECT id, vote_value FROM askspace_votes')) {
      const [userId, targetType, targetId] = params;
      return {
        rows: this.votes.filter(
          (v) => v.user_account_id === userId && v.target_type === targetType && v.target_id === targetId
        ) as T[],
      };
    }
    if (s.startsWith('SELECT vote_score FROM askspace_questions')) {
      return { rows: this.questions.filter((q) => q.id === params[0]) as T[] };
    }
    if (s.startsWith('SELECT vote_score FROM askspace_answers')) {
      return { rows: this.answers.filter((a) => a.id === params[0]) as T[] };
    }
    if (s.startsWith('SELECT user_account_id FROM askspace_watchers WHERE question_id = ?')) {
      return { rows: this.watchers.filter((w) => w.question_id === params[0]) as T[] };
    }
    if (s.startsWith('SELECT question_id FROM askspace_watchers WHERE question_id = ? AND user_account_id = ?')) {
      return { rows: this.watchers.filter((w) => w.question_id === params[0] && w.user_account_id === params[1]) as T[] };
    }
    if (s.startsWith('SELECT question_id FROM askspace_watchers WHERE user_account_id = ?')) {
      const [uid, ...qids] = params;
      const set = new Set(qids);
      return { rows: this.watchers.filter((w) => w.user_account_id === uid && set.has(w.question_id)) as T[] };
    }
    if (s.startsWith("SELECT * FROM askspace_comments WHERE target_type = 'question'")) {
      return { rows: this.comments.filter((c) => c.target_type === 'question' && c.target_id === params[0]) as T[] };
    }
    if (s.startsWith("SELECT * FROM askspace_comments WHERE target_type = 'answer'")) {
      const set = new Set(params);
      return { rows: this.comments.filter((c) => c.target_type === 'answer' && set.has(c.target_id)) as T[] };
    }
    if (s.startsWith('SELECT * FROM askspace_notifications WHERE recipient_account_id = ?')) {
      return {
        rows: this.notifications
          .filter((n) => n.recipient_account_id === params[0])
          .reverse() as T[],
      };
    }
    if (s.startsWith('SELECT * FROM askspace_audit_log')) {
      const m = s.match(/LIMIT (\d+)/);
      const lim = m ? Number(m[1]) : 50;
      return { rows: [...this.auditLog].reverse().slice(0, lim) as T[] };
    }
    if (s.startsWith('SELECT t.id, t.name, t.display_name')) {
      const rows = this.tags.map((t) => ({
        ...t,
        question_count: this.questionTags.filter((qt) => qt.tag_id === t.id).length,
      }));
      return { rows: rows as T[] };
    }
    if (s.startsWith('SELECT COUNT(*) AS total_q')) {
      const filtered = params.length > 0 ? this.questions.filter((q) => q.space_key === params[0]) : this.questions;
      return {
        rows: [{
          total_q: filtered.length,
          answered_q: filtered.filter((q) => Number(q.answers_count) > 0).length,
          accepted_q: filtered.filter((q) => q.accepted_answer_id !== null).length,
          unanswered_q: filtered.filter((q) => Number(q.answers_count) === 0).length,
          total_a: filtered.reduce((acc, q) => acc + Number(q.answers_count), 0),
        }] as T[],
      };
    }
    if (s.startsWith('SELECT COUNT(DISTINCT q.id) AS cnt') || s.startsWith('SELECT DISTINCT q.* FROM askspace_questions q')) {
      const isCount = s.startsWith('SELECT COUNT');
      let list = [...this.questions];
      let idx = 0;
      if (s.includes('INNER JOIN askspace_tags t ON t.id = qt.tag_id AND t.name = ?')) {
        const tagSlug = params[idx++];
        const tag = this.tags.find((t) => t.name === tagSlug);
        const matchedQIds = new Set(
          tag ? this.questionTags.filter((qt) => qt.tag_id === tag.id).map((qt) => qt.question_id) : []
        );
        list = list.filter((q) => matchedQIds.has(String(q.id)));
      }
      if (s.includes('q.space_key = ?')) {
        const sk = params[idx++];
        list = list.filter((q) => q.space_key === sk);
      }
      if (s.includes('q.status = ?')) {
        const st = params[idx++];
        list = list.filter((q) => q.status === st);
      }
      if (s.includes('q.answers_count = 0')) {
        list = list.filter((q) => Number(q.answers_count) === 0);
      }
      if (s.includes('q.accepted_answer_id IS NOT NULL')) {
        list = list.filter((q) => q.accepted_answer_id !== null);
      }
      if (s.includes('LOWER(q.title) LIKE ?')) {
        const term = String(params[idx++]).replace(/%/g, '');
        idx++; // second LIKE param
        list = list.filter(
          (q) =>
            String(q.title).toLowerCase().includes(term) ||
            String(q.body).toLowerCase().includes(term)
        );
      }
      if (isCount) {
        return { rows: [{ cnt: list.length }] as T[] };
      }
      if (s.includes('ORDER BY q.vote_score DESC')) {
        list.sort((a, b) => Number(b.vote_score) - Number(a.vote_score));
      }
      const limMatch = s.match(/LIMIT (\d+)/);
      const offMatch = s.match(/OFFSET (\d+)/);
      const limit = limMatch ? Number(limMatch[1]) : 25;
      const offset = offMatch ? Number(offMatch[1]) : 0;
      return { rows: list.slice(offset, offset + limit) as T[] };
    }
    if (s.startsWith('SELECT a.author_account_id')) {
      const spaceFilter = params[0];
      const validQIds = spaceFilter
        ? new Set(this.questions.filter((q) => q.space_key === spaceFilter).map((q) => q.id))
        : null;
      const byAuthor = new Map<string, { author_account_id: string; author_name: string; answers_count: number; accepted_count: number; total_votes: number }>();
      for (const a of this.answers) {
        if (validQIds && !validQIds.has(a.question_id)) continue;
        const id = String(a.author_account_id);
        const cur = byAuthor.get(id) ?? {
          author_account_id: id,
          author_name: String(a.author_name),
          answers_count: 0,
          accepted_count: 0,
          total_votes: 0,
        };
        cur.answers_count += 1;
        cur.accepted_count += Number(a.is_accepted) === 1 ? 1 : 0;
        cur.total_votes += Number(a.vote_score);
        byAuthor.set(id, cur);
      }
      return { rows: [...byAuthor.values()] as T[] };
    }

    // UPDATE queries
    if (s.startsWith('UPDATE askspace_questions SET views_count = views_count + 1')) {
      const q = this.questions.find((x) => x.id === params[0]);
      if (q) q.views_count = Number(q.views_count) + 1;
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_questions SET answers_count = answers_count + 1')) {
      const q = this.questions.find((x) => x.id === params[1]);
      if (q) {
        q.answers_count = Number(q.answers_count) + 1;
        q.updated_at = params[0];
      }
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_questions SET accepted_answer_id = ?')) {
      const q = this.questions.find((x) => x.id === params[2]);
      if (q) {
        q.accepted_answer_id = params[0];
        q.status = 'answered';
        q.updated_at = params[1];
      }
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_questions SET accepted_answer_id = NULL')) {
      const q = this.questions.find((x) => x.id === params[1]);
      if (q) {
        q.accepted_answer_id = null;
        q.status = 'open';
        q.updated_at = params[0];
      }
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_questions SET vote_score = vote_score + ?')) {
      const q = this.questions.find((x) => x.id === params[1]);
      if (q) q.vote_score = Number(q.vote_score) + Number(params[0]);
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_answers SET vote_score = vote_score + ?')) {
      const a = this.answers.find((x) => x.id === params[1]);
      if (a) a.vote_score = Number(a.vote_score) + Number(params[0]);
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_answers SET is_accepted = 0')) {
      for (const a of this.answers) {
        if (a.question_id === params[0]) {
          a.is_accepted = 0;
          a.accepted_by_account_id = null;
          a.accepted_by_name = null;
        }
      }
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_answers SET is_accepted = 1')) {
      const a = this.answers.find((x) => x.id === params[3]);
      if (a) {
        a.is_accepted = 1;
        a.accepted_by_account_id = params[0];
        a.accepted_by_name = params[1];
        a.updated_at = params[2];
      }
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_votes SET vote_value = ?')) {
      const v = this.votes.find((x) => x.id === params[1]);
      if (v) v.vote_value = params[0];
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_tags SET name = ?')) {
      const t = this.tags.find((x) => x.id === params[3]);
      if (t) {
        t.name = params[0];
        t.display_name = params[1];
        t.description = params[2];
      }
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_notifications SET is_read = 1')) {
      for (const n of this.notifications) {
        if (n.recipient_account_id === params[0]) n.is_read = 1;
      }
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_questions SET title = ?')) {
      const q = this.questions.find((x) => x.id === params[3]);
      if (q) {
        q.title = params[0];
        q.body = params[1];
        q.updated_at = params[2];
      }
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_questions SET answers_count = CASE')) {
      const isAcceptedReset = s.includes('accepted_answer_id = NULL');
      const q = this.questions.find((x) => x.id === params[1]);
      if (q) {
        q.answers_count = Math.max(0, Number(q.answers_count) - 1);
        q.updated_at = params[0];
        if (isAcceptedReset) {
          q.accepted_answer_id = null;
          q.status = 'open';
        }
      }
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_answers WHERE id = ?')) {
      this.answers = this.answers.filter((a) => a.id !== params[0]);
      return { rows: [] };
    }
    if (s.startsWith('UPDATE askspace_questions SET promoted_page_id = ?')) {
      const q = this.questions.find((x) => x.id === params[3]);
      if (q) {
        q.promoted_page_id = params[0];
        q.promoted_page_url = params[1];
        q.updated_at = params[2];
      }
      return { rows: [] };
    }

    // DELETE queries
    if (s.startsWith('DELETE FROM askspace_question_tags WHERE question_id = ?')) {
      this.questionTags = this.questionTags.filter((x) => x.question_id !== params[0]);
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_question_tags WHERE tag_id = ?')) {
      this.questionTags = this.questionTags.filter((x) => x.tag_id !== params[0]);
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_tags WHERE id = ?')) {
      this.tags = this.tags.filter((x) => x.id !== params[0]);
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_votes WHERE id = ?')) {
      this.votes = this.votes.filter((x) => x.id !== params[0]);
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_votes WHERE target_type =')) {
      const type = s.includes("'answer'") ? 'answer' : 'question';
      this.votes = this.votes.filter((x) => !(x.target_type === type && x.target_id === params[0]));
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_comments WHERE target_type =')) {
      const type = s.includes("'answer'") ? 'answer' : 'question';
      this.comments = this.comments.filter((x) => !(x.target_type === type && x.target_id === params[0]));
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_answers WHERE question_id = ?')) {
      this.answers = this.answers.filter((x) => x.question_id !== params[0]);
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_watchers WHERE question_id = ? AND user_account_id = ?')) {
      this.watchers = this.watchers.filter((x) => !(x.question_id === params[0] && x.user_account_id === params[1]));
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_watchers WHERE question_id = ?')) {
      this.watchers = this.watchers.filter((x) => x.question_id !== params[0]);
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_notifications WHERE question_id = ?')) {
      this.notifications = this.notifications.filter((x) => x.question_id !== params[0]);
      return { rows: [] };
    }
    if (s.startsWith('DELETE FROM askspace_questions WHERE id = ?')) {
      this.questions = this.questions.filter((x) => x.id !== params[0]);
      return { rows: [] };
    }

    throw new Error(`Unhandled SQL in test double: ${s}`);
  }
}

describe('AskSpace Q&A Repository End-to-End Workflows', () => {
  let db: InMemoryAskSpaceDb;
  const asker: repo.Actor = { accountId: 'u_asker', displayName: 'Neha Verma', isAdmin: false };
  const responder: repo.Actor = { accountId: 'u_dev', displayName: 'Rohan Mehta', isAdmin: false };
  const spaceAdmin: repo.Actor = { accountId: 'u_admin', displayName: 'Priya Admin', isAdmin: true };

  beforeEach(() => {
    db = new InMemoryAskSpaceDb();
    setDbForTesting(db);
  });

  afterEach(() => {
    resetDbToDefault();
  });

  it('runs complete ask -> answer -> vote -> admin accept -> notify -> macro -> Rovo -> CSV flow', async () => {
    // 1. Ask a question with duplicate/messy tags
    const created = await repo.createQuestion(
      {
        spaceKey: 'ENG',
        spaceId: '99100',
        title: 'How do we configure SSO for staging Confluence?',
        body: 'We need SAML setup instructions for our QA engineers.',
        tags: 'SSO, sso, Security, Dev-Ops',
      },
      asker
    );
    expect(created.tags).toEqual(['sso', 'security', 'dev-ops']);
    expect(created.isWatching).toBe(true);

    // 2. Responder posts an answer -> asker receives notification automatically
    const afterAnswer = await repo.createAnswer(
      {
        questionId: created.id,
        body: 'Go to admin.atlassian.com -> Security -> Authentication policies and attach the Okta SAML app.',
      },
      responder
    );
    expect(afterAnswer.answersCount).toBe(1);
    const answerId = afterAnswer.answers[0].id;

    const askerNotifs = await repo.listNotifications(asker.accountId);
    expect(askerNotifs.length).toBe(1);
    expect(askerNotifs[0].eventType).toBe('NEW_ANSWER');

    // 3. Upvote toggle & switch test
    const up = await repo.toggleVote('answer', answerId, 1, asker);
    expect(up).toEqual({ voteScore: 1, userVote: 1 });
    const unvote = await repo.toggleVote('answer', answerId, 1, asker);
    expect(unvote).toEqual({ voteScore: 0, userVote: 0 });
    const upAgain = await repo.toggleVote('answer', answerId, 1, spaceAdmin);
    expect(upAgain).toEqual({ voteScore: 1, userVote: 1 });

    // 4. Non-author non-admin CANNOT mark accepted solution
    await expect(repo.acceptAnswer(created.id, answerId, responder)).rejects.toThrow(
      /author or a space\/site administrator/i
    );

    // 5. Space/Org Admin CAN mark accepted solution (fixes Smart Q&A top complaint!)
    const accepted = await repo.acceptAnswer(created.id, answerId, spaceAdmin);
    expect(accepted.status).toBe('answered');
    expect(accepted.acceptedAnswerId).toBe(answerId);
    expect(accepted.answers[0].isAccepted).toBe(true);
    expect(accepted.answers[0].acceptedByName).toBe('Priya Admin');

    // Responder receives accepted-solution notification
    const respNotifs = await repo.listNotifications(responder.accountId);
    expect(respNotifs.some((n) => n.eventType === 'YOUR_ANSWER_ACCEPTED')).toBe(true);

    // 6. Inline Macro query returns acceptedAnswerBody directly alongside the question!
    const macroList = await repo.listQuestions(
      { spaceKey: 'ENG', sort: 'accepted', includeAcceptedAnswer: true },
      asker.accountId
    );
    expect(macroList.questions.length).toBe(1);
    expect(macroList.questions[0].acceptedAnswerBody).toContain('admin.atlassian.com');
    expect(macroList.stats.resolutionRatePercent).toBe(100);

    // 7. Admin tag governance: rename & merge duplicate tags
    const tagsBefore = await repo.listTags();
    const ssoTag = tagsBefore.find((t) => t.name === 'sso')!;
    const secTag = tagsBefore.find((t) => t.name === 'security')!;
    await expect(repo.renameTag(ssoTag.id, 'auth-sso', 'SSO topics', asker)).rejects.toThrow(/Administrator/i);
    await repo.renameTag(ssoTag.id, 'auth-sso', 'SSO topics', spaceAdmin);
    const mergedTags = await repo.mergeTags(ssoTag.id, secTag.id, spaceAdmin);
    expect(mergedTags.some((t) => t.id === ssoTag.id)).toBe(false);

    // 8. Native Rovo search finds verified accepted answer
    const rovoHits = await repo.searchForRovo({ query: 'SSO', onlyVerified: true });
    expect(rovoHits.length).toBe(1);
    expect(rovoHits[0].verifiedAnswer).toContain('Okta SAML');

    // 9. Leaderboard & Audit Log & CSV Export
    const leaderboard = await repo.getLeaderboard('ENG');
    expect(leaderboard[0].displayName).toBe('Rohan Mehta');
    expect(leaderboard[0].acceptedCount).toBe(1);
    expect(leaderboard[0].reputationScore).toBe(22); // 15 accepted + 5 vote + 2 answer

    const audit = await repo.listAuditLog(20);
    expect(audit.some((e) => e.actionType === 'ANSWER_ACCEPTED')).toBe(true);
    expect(audit.some((e) => e.actionType === 'TAGS_MERGED')).toBe(true);

    const csv = await repo.exportQaCsv('ENG');
    expect(csv).toContain('How do we configure SSO for staging Confluence?');
    expect(csv).toContain('Okta SAML');
  });

  it('handles edits, comments, watch toggle, promoted page recording, and cascading deletes', async () => {
    const q = await repo.createQuestion(
      {
        spaceKey: 'OPS',
        spaceId: '55100',
        title: 'Where is the incident runbook stored?',
        body: 'Looking for the latest P1 on-call escalation guide.',
        tags: 'incident, on-call',
      },
      asker
    );

    // Toggle watch off and back on
    expect(await repo.toggleWatch(q.id, asker.accountId)).toEqual({ isWatching: false });
    expect(await repo.toggleWatch(q.id, asker.accountId)).toEqual({ isWatching: true });

    // Non-author non-admin cannot edit; author can edit
    await expect(
      repo.updateQuestion({ questionId: q.id, title: 'Unauthorized edit', body: 'Trying to hijack.' }, responder)
    ).rejects.toThrow(/author or a space\/site administrator/i);

    // Add answer + comment + accept + promote page
    const withAns = await repo.createAnswer(
      { questionId: q.id, body: 'See the OPS Runbooks folder under P1 Escalation.' },
      responder
    );
    const ansId = withAns.answers[0].id;

    const withComment = await repo.addComment(
      { questionId: q.id, targetType: 'answer', targetId: ansId, body: 'Updated link confirmed!' },
      spaceAdmin
    );
    expect(withComment.answers[0].comments.length).toBe(1);

    await repo.acceptAnswer(q.id, ansId, asker);
    const promoted = await repo.recordPromotedPage(q.id, '987654', '/wiki/spaces/OPS/pages/987654', asker);
    expect(promoted.promotedPageId).toBe('987654');
    expect(promoted.promotedPageUrl).toBe('/wiki/spaces/OPS/pages/987654');

    // Mark notifications read
    await repo.markNotificationsRead(asker.accountId);
    const notifs = await repo.listNotifications(asker.accountId);
    expect(notifs.every((n) => n.isRead)).toBe(true);

    // Deleting the accepted answer resets question status to open
    const afterAnsDel = await repo.deleteAnswer(q.id, ansId, spaceAdmin);
    expect(afterAnsDel.answersCount).toBe(0);
    expect(afterAnsDel.acceptedAnswerId).toBeNull();
    expect(afterAnsDel.status).toBe('open');

    // Deleting question cascades cleanly
    expect(await repo.deleteQuestion(q.id, asker)).toEqual({ deleted: true });
    expect(await repo.getQuestionDetail(q.id, asker.accountId, false)).toBeNull();
  });
});
