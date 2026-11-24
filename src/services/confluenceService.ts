import api, { route } from '@forge/api';
import type { AnswerItem, QuestionDetail } from '../types/models';
import { buildPromotedPageStorageHtml } from '../utils/formatting';

export interface ConfluenceUserInfo {
  accountId: string;
  displayName: string;
  isSiteAdmin: boolean;
}

export interface SpaceResolution {
  spaceKey: string;
  spaceId: string;
  spaceName: string;
}

export interface LicenseCheckResult {
  active: boolean;
  environment: string;
}

export interface ConfluenceContextLike {
  accountId?: string;
  environmentType?: string;
  license?: {
    active?: boolean;
    isActive?: boolean;
  };
  extension?: {
    space?: {
      id?: string;
      key?: string;
    };
    content?: {
      id?: string;
    };
  };
}

/**
 * Evaluates Paid-via-Atlassian licensing state safely.
 * Production enforces active commercial/evaluation license;
 * Development and Staging allow seamless testing before listing.
 */
export function evaluateLicense(context?: ConfluenceContextLike): LicenseCheckResult {
  const env = (context?.environmentType ?? 'DEVELOPMENT').toUpperCase();
  const lic = context?.license;
  if (lic && typeof lic.active === 'boolean') {
    return { active: lic.active, environment: env };
  }
  if (lic && typeof lic.isActive === 'boolean') {
    return { active: lic.isActive, environment: env };
  }
  // In DEVELOPMENT / STAGING, license payload is omitted unless simulated via CLI override
  return { active: env !== 'PRODUCTION', environment: env };
}

export function assertLicensed(context?: ConfluenceContextLike): void {
  const check = evaluateLicense(context);
  if (!check.active) {
    throw new Error(
      'AskSpace requires an active Confluence subscription license. Please contact your site administrator.'
    );
  }
}

export async function fetchCurrentConfluenceUser(
  fallbackAccountId: string
): Promise<ConfluenceUserInfo> {
  try {
    const res = await api.asUser().requestConfluence(route`/wiki/rest/api/user/current?expand=operations`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { accountId: fallbackAccountId, displayName: 'Confluence User', isSiteAdmin: false };
    }
    const data = (await res.json()) as {
      accountId?: string;
      displayName?: string;
      publicName?: string;
      operations?: Array<{ operation?: string; targetType?: string }>;
    };
    const isSiteAdmin = Array.isArray(data.operations)
      ? data.operations.some(
          (op) => op.operation === 'administer' && (op.targetType === 'application' || op.targetType === 'site')
        )
      : false;
    return {
      accountId: data.accountId || fallbackAccountId,
      displayName: data.displayName || data.publicName || 'Confluence User',
      isSiteAdmin,
    };
  } catch {
    return { accountId: fallbackAccountId, displayName: 'Confluence User', isSiteAdmin: false };
  }
}

export async function resolveConfluenceSpace(
  spaceKeyOrId?: string | null
): Promise<SpaceResolution | null> {
  if (!spaceKeyOrId) return null;
  try {
    const isNumeric = /^\d+$/.test(spaceKeyOrId);
    const reqRoute = isNumeric
      ? route`/wiki/api/v2/spaces/${spaceKeyOrId}`
      : route`/wiki/api/v2/spaces?keys=${spaceKeyOrId}&limit=1`;
    const res = await api.asUser().requestConfluence(reqRoute, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      id?: string;
      key?: string;
      name?: string;
      results?: Array<{ id?: string; key?: string; name?: string }>;
    };
    const space = isNumeric ? data : data.results?.[0];
    if (!space?.id || !space?.key) return null;
    return {
      spaceId: String(space.id),
      spaceKey: String(space.key),
      spaceName: String(space.name || space.key),
    };
  } catch {
    return null;
  }
}

export async function listAccessibleSpaces(): Promise<SpaceResolution[]> {
  try {
    const res = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?limit=50&status=current`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ id?: string; key?: string; name?: string }>;
    };
    return (data.results ?? [])
      .filter((s) => s.id && s.key)
      .map((s) => ({
        spaceId: String(s.id),
        spaceKey: String(s.key),
        spaceName: String(s.name || s.key),
      }));
  } catch {
    return [];
  }
}

export async function checkIsSpaceAdmin(
  spaceId: string | null | undefined,
  accountId: string,
  isSiteAdmin: boolean
): Promise<boolean> {
  if (isSiteAdmin) return true;
  if (!spaceId) return false;
  try {
    const res = await api
      .asUser()
      .requestConfluence(route`/wiki/api/v2/spaces/${spaceId}/permissions?limit=100`, {
        headers: { Accept: 'application/json' },
      });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      results?: Array<{
        principal?: { type?: string; id?: string };
        operation?: { key?: string; targetType?: string };
      }>;
    };
    return (data.results ?? []).some(
      (entry) =>
        entry.principal?.type === 'user' &&
        entry.principal?.id === accountId &&
        entry.operation?.key === 'administer' &&
        entry.operation?.targetType === 'space'
    );
  } catch {
    return false;
  }
}

/**
 * Promotes a verified AskSpace Q&A thread directly into a native Confluence page
 * using Confluence REST API v2 (asUser — respects user's real write permissions).
 */
export async function publishQuestionToConfluencePage(
  question: QuestionDetail,
  acceptedAnswer: AnswerItem,
  targetSpaceId?: string
): Promise<{ pageId: string; pageUrl: string }> {
  let spaceId = targetSpaceId || question.spaceId;
  if (!spaceId && question.spaceKey && question.spaceKey !== 'GLOBAL') {
    const resolved = await resolveConfluenceSpace(question.spaceKey);
    if (resolved) spaceId = resolved.spaceId;
  }
  if (!spaceId) {
    throw new Error('Please choose a valid Confluence Space before publishing this answer as a page.');
  }

  const storageHtml = buildPromotedPageStorageHtml(question, acceptedAnswer);
  const pageTitle = `FAQ: ${question.title}`.slice(0, 240);

  const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      spaceId,
      status: 'current',
      title: pageTitle,
      body: {
        representation: 'storage',
        value: storageHtml,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Confluence page creation failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const created = (await res.json()) as {
    id?: string;
    _links?: { webui?: string; base?: string };
  };
  const pageId = String(created.id || '');
  const webui = created._links?.webui || '';
  const pageUrl = webui.startsWith('http') ? webui : `/wiki${webui}`;
  return { pageId, pageUrl };
}
