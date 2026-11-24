import { describe, expect, it } from 'vitest';
import {
  buildPromotedPageStorageHtml,
  clampInt,
  escapeCsvCell,
  normalizeTagSlug,
  parseTagInput,
  toCsv,
} from '../src/utils/formatting';
import { evaluateLicense } from '../src/services/confluenceService';
import type { AnswerItem, QuestionDetail } from '../src/types/models';

describe('formatting & sanitization utilities', () => {
  it('normalizes tags cleanly and deduplicates up to 10 tags', () => {
    expect(normalizeTagSlug('  Jira Cloud & API!! ')).toBe('jira-cloud-api');
    expect(parseTagInput('DevOps, devops, CI/CD, Onboarding; onboarding\nSecurity')).toEqual([
      'devops',
      'cicd',
      'onboarding',
      'security',
    ]);
  });

  it('clamps integer bounds safely', () => {
    expect(clampInt('500', 25, 1, 100)).toBe(100);
    expect(clampInt(-5, 25, 1, 100)).toBe(1);
    expect(clampInt('not-a-number', 25, 1, 100)).toBe(25);
  });

  it('escapes XML and builds valid Confluence Storage Format for promoted pages', () => {
    const question: QuestionDetail = {
      id: 'q_1',
      spaceKey: 'ENG',
      spaceId: '12345',
      title: 'How do we rotate <prod> & staging keys?',
      body: 'Step context:\n\n```bash\nrotate-keys --env prod\n```',
      authorAccountId: 'u1',
      authorName: 'Aarav & Team',
      acceptedAnswerId: 'ans_1',
      voteScore: 4,
      answersCount: 1,
      viewsCount: 12,
      status: 'answered',
      tags: ['security', 'prod-ops'],
      promotedPageId: null,
      promotedPageUrl: null,
      userVote: 0,
      isWatching: true,
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T00:00:00.000Z',
      answers: [],
      comments: [],
    };
    const answer: AnswerItem = {
      id: 'ans_1',
      questionId: 'q_1',
      body: 'Run the Vault CLI rotation job.\nThen verify in AWS Secrets Manager.',
      authorAccountId: 'u2',
      authorName: 'Priya Sharma',
      isAccepted: true,
      acceptedByAccountId: 'admin_1',
      acceptedByName: 'Site Admin',
      voteScore: 7,
      userVote: 1,
      comments: [],
      createdAt: '2026-11-24T01:00:00.000Z',
      updatedAt: '2026-11-24T01:00:00.000Z',
    };

    const html = buildPromotedPageStorageHtml(question, answer);
    expect(html).toContain('ac:structured-macro ac:name="info"');
    expect(html).toContain('Verified by Site Admin');
    expect(html).toContain('How do we rotate &lt;prod&gt; &amp; staging keys?');
    expect(html).toContain('ac:structured-macro ac:name="code"');
    expect(html).toContain('rotate-keys --env prod');
    expect(html).toContain('Run the Vault CLI rotation job.<br />Then verify in AWS Secrets Manager.');
  });

  it('escapes CSV values with quotes, commas, and newlines', () => {
    expect(escapeCsvCell('Hello, "World"')).toBe('"Hello, ""World"""');
    const csv = toCsv(['Title', 'Answer'], [['Q1, test', 'Line1\nLine2']]);
    expect(csv).toBe('Title,Answer\n"Q1, test","Line1\nLine2"');
  });
});

describe('Paid-via-Atlassian licensing gate', () => {
  it('allows development and staging environments without explicit license payload', () => {
    expect(evaluateLicense({ environmentType: 'DEVELOPMENT' })).toEqual({
      active: true,
      environment: 'DEVELOPMENT',
    });
    expect(evaluateLicense({ environmentType: 'STAGING' })).toEqual({
      active: true,
      environment: 'STAGING',
    });
  });

  it('strictly enforces active license in production', () => {
    expect(evaluateLicense({ environmentType: 'PRODUCTION' })).toEqual({
      active: false,
      environment: 'PRODUCTION',
    });
    expect(evaluateLicense({ environmentType: 'PRODUCTION', license: { active: false } })).toEqual({
      active: false,
      environment: 'PRODUCTION',
    });
    expect(evaluateLicense({ environmentType: 'PRODUCTION', license: { active: true } })).toEqual({
      active: true,
      environment: 'PRODUCTION',
    });
  });
});
