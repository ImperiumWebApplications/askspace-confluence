import Resolver from '@forge/resolver';
import {
  assertLicensed,
  checkIsSpaceAdmin,
  evaluateLicense,
  fetchCurrentConfluenceUser,
  listAccessibleSpaces,
  publishQuestionToConfluencePage,
  resolveConfluenceSpace,
  type ConfluenceContextLike,
} from '../services/confluenceService';
import * as repo from '../services/qaRepository';
import type {
  ListQuestionsRequest,
  RovoSearchRequest,
  ViewerProfile,
  VoteTargetType,
} from '../types/models';

const resolver = new Resolver();

async function buildActorAndContext(
  context: ConfluenceContextLike,
  explicitSpaceKey?: string | null
): Promise<{ actor: repo.Actor; spaceKey: string | null; spaceId: string | null }> {
  const accountId = context.accountId || 'anonymous';
  const userInfo = await fetchCurrentConfluenceUser(accountId);

  const rawSpaceId = context.extension?.space?.id ?? null;
  const rawSpaceKey = explicitSpaceKey || context.extension?.space?.key || null;

  let spaceId = rawSpaceId ? String(rawSpaceId) : null;
  let spaceKey = rawSpaceKey ? String(rawSpaceKey) : null;

  if (!spaceId && spaceKey && spaceKey !== 'GLOBAL' && spaceKey !== 'ALL') {
    const resolved = await resolveConfluenceSpace(spaceKey);
    if (resolved) {
      spaceId = resolved.spaceId;
      spaceKey = resolved.spaceKey;
    }
  }

  const isAdmin = await checkIsSpaceAdmin(spaceId, userInfo.accountId, userInfo.isSiteAdmin);
  return {
    actor: {
      accountId: userInfo.accountId,
      displayName: userInfo.displayName,
      isAdmin,
    },
    spaceKey,
    spaceId,
  };
}

resolver.define('getBootstrap', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  const license = evaluateLicense(ctx);
  const { actor, spaceKey, spaceId } = await buildActorAndContext(
    ctx,
    (payload as { spaceKey?: string })?.spaceKey
  );

  const profile: ViewerProfile = {
    accountId: actor.accountId,
    displayName: actor.displayName,
    isAdmin: actor.isAdmin,
    spaceKey,
    spaceId,
    licenseActive: license.active,
    licenseEnvironment: license.environment,
  };

  if (!license.active) {
    return { profile, spaces: [], tags: [], notifications: [] };
  }

  await repo.ensureMigrated();
  const [spaces, tags, notifications] = await Promise.all([
    listAccessibleSpaces(),
    repo.listTags(),
    repo.listNotifications(actor.accountId),
  ]);

  return { profile, spaces, tags, notifications };
});

resolver.define('listQuestions', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const req = (payload || {}) as ListQuestionsRequest;
  return repo.listQuestions(req, ctx.accountId || '');
});

resolver.define('getQuestionDetail', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const { questionId } = (payload || {}) as { questionId: string };
  return repo.getQuestionDetail(questionId, ctx.accountId || '', true);
});

resolver.define('createQuestion', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const input = (payload || {}) as {
    spaceKey?: string;
    spaceId?: string;
    title: string;
    body: string;
    tags?: string | string[];
  };
  const { actor, spaceKey, spaceId } = await buildActorAndContext(ctx, input.spaceKey);
  return repo.createQuestion(
    {
      spaceKey: input.spaceKey || spaceKey || 'GLOBAL',
      spaceId: input.spaceId || spaceId || '',
      title: input.title,
      body: input.body,
      tags: input.tags,
    },
    actor
  );
});

resolver.define('updateQuestion', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const input = (payload || {}) as {
    questionId: string;
    title: string;
    body: string;
    tags?: string | string[];
  };
  const { actor } = await buildActorAndContext(ctx);
  return repo.updateQuestion(input, actor);
});

resolver.define('deleteQuestion', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const { questionId } = (payload || {}) as { questionId: string };
  const { actor } = await buildActorAndContext(ctx);
  return repo.deleteQuestion(questionId, actor);
});

resolver.define('createAnswer', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const input = (payload || {}) as { questionId: string; body: string };
  const { actor } = await buildActorAndContext(ctx);
  return repo.createAnswer(input, actor);
});

resolver.define('deleteAnswer', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const { questionId, answerId } = (payload || {}) as { questionId: string; answerId: string };
  const { actor } = await buildActorAndContext(ctx);
  return repo.deleteAnswer(questionId, answerId, actor);
});

resolver.define('acceptAnswer', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const { questionId, answerId, spaceKey } = (payload || {}) as {
    questionId: string;
    answerId: string;
    spaceKey?: string;
  };
  const { actor } = await buildActorAndContext(ctx, spaceKey);
  return repo.acceptAnswer(questionId, answerId, actor);
});

resolver.define('toggleVote', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const { targetType, targetId, value } = (payload || {}) as {
    targetType: VoteTargetType;
    targetId: string;
    value: 1 | -1;
  };
  const { actor } = await buildActorAndContext(ctx);
  return repo.toggleVote(targetType, targetId, value, actor);
});

resolver.define('addComment', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const input = (payload || {}) as {
    questionId: string;
    targetType: VoteTargetType;
    targetId: string;
    body: string;
  };
  const { actor } = await buildActorAndContext(ctx);
  return repo.addComment(input, actor);
});

resolver.define('toggleWatch', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const { questionId } = (payload || {}) as { questionId: string };
  return repo.toggleWatch(questionId, ctx.accountId || 'anonymous');
});

resolver.define('promoteToConfluencePage', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const { questionId, targetSpaceId } = (payload || {}) as {
    questionId: string;
    targetSpaceId?: string;
  };
  const { actor } = await buildActorAndContext(ctx);
  const detail = await repo.getQuestionDetail(questionId, actor.accountId, false);
  if (!detail) throw new Error('Question not found.');

  const accepted = detail.answers.find((a) => a.isAccepted);
  if (!accepted) {
    throw new Error('Mark an Accepted Solution first before publishing this thread as a Confluence page.');
  }

  const { pageId, pageUrl } = await publishQuestionToConfluencePage(detail, accepted, targetSpaceId);
  return repo.recordPromotedPage(questionId, pageId, pageUrl, actor);
});

resolver.define('listTags', async ({ context }) => {
  assertLicensed(context as unknown as ConfluenceContextLike);
  return repo.listTags();
});

resolver.define('renameTag', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const { tagId, newName, description } = (payload || {}) as {
    tagId: string;
    newName: string;
    description?: string;
  };
  const { actor } = await buildActorAndContext(ctx);
  return repo.renameTag(tagId, newName, description || '', actor);
});

resolver.define('mergeTags', async ({ payload, context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  const { sourceTagId, targetTagId } = (payload || {}) as {
    sourceTagId: string;
    targetTagId: string;
  };
  const { actor } = await buildActorAndContext(ctx);
  return repo.mergeTags(sourceTagId, targetTagId, actor);
});

resolver.define('markNotificationsRead', async ({ context }) => {
  const ctx = context as unknown as ConfluenceContextLike;
  assertLicensed(ctx);
  return repo.markNotificationsRead(ctx.accountId || 'anonymous');
});

resolver.define('getLeaderboard', async ({ payload, context }) => {
  assertLicensed(context as unknown as ConfluenceContextLike);
  const { spaceKey } = (payload || {}) as { spaceKey?: string | null };
  return repo.getLeaderboard(spaceKey);
});

resolver.define('listAuditLog', async ({ payload, context }) => {
  assertLicensed(context as unknown as ConfluenceContextLike);
  const { limit } = (payload || {}) as { limit?: number };
  return repo.listAuditLog(limit ?? 50);
});

resolver.define('exportCsv', async ({ payload, context }) => {
  assertLicensed(context as unknown as ConfluenceContextLike);
  const { spaceKey } = (payload || {}) as { spaceKey?: string | null };
  const csv = await repo.exportQaCsv(spaceKey);
  return { csv };
});

export const handler = resolver.getDefinitions();

export async function lifecycleHandler(): Promise<void> {
  await repo.ensureMigrated();
}

export async function rovoSearchHandler(payload: RovoSearchRequest) {
  await repo.ensureMigrated();
  const items = await repo.searchForRovo({
    query: payload?.query || '',
    spaceKey: payload?.spaceKey,
    onlyVerified: payload?.onlyVerified,
  });
  return {
    count: items.length,
    results: items,
  };
}
