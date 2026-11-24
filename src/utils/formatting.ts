import type { AnswerItem, QuestionDetail } from '../types/models';

export function generateId(prefix: string): string {
  const webCrypto = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto : undefined;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return `${prefix}_${webCrypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand.slice(0, 16)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeTagSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function parseTagInput(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,;\n]+/);
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const part of parts) {
    const slug = normalizeTagSlug(part);
    if (slug && !seen.has(slug) && clean.length < 10) {
      seen.add(slug);
      clean.push(slug);
    }
  }
  return clean;
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textToStorageParagraphs(text: string): string {
  const blocks = text
    .trim()
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return '<p></p>';
  }

  return blocks
    .map((block) => {
      if (block.startsWith('```') && block.endsWith('```') && block.length >= 6) {
        const inner = block.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
        return `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[${inner.replace(/]]>/g, ']]]]><![CDATA[>')}]]></ac:plain-text-body></ac:structured-macro>`;
      }
      const lines = block.split('\n').map((line) => escapeXml(line));
      return `<p>${lines.join('<br />')}</p>`;
    })
    .join('\n');
}

/**
 * Generates clean, valid Confluence XHTML Storage Format for 1-click
 * "Promote Accepted Answer to Confluence Page".
 */
export function buildPromotedPageStorageHtml(
  question: QuestionDetail,
  acceptedAnswer: AnswerItem
): string {
  const tagBadges =
    question.tags.length > 0
      ? `<p><strong>Topics:</strong> ${question.tags.map((t) => `<code>${escapeXml(t)}</code>`).join(' ')}</p>`
      : '';

  const acceptedMeta = acceptedAnswer.acceptedByName
    ? `Verified by ${escapeXml(acceptedAnswer.acceptedByName)}`
    : 'Verified Answer';

  return [
    `<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Promoted from <strong>AskSpace Q&amp;A</strong> (${acceptedMeta}). Original question asked by ${escapeXml(question.authorName)}.</p></ac:rich-text-body></ac:structured-macro>`,
    `<h2>Question</h2>`,
    `<p><strong>${escapeXml(question.title)}</strong></p>`,
    textToStorageParagraphs(question.body),
    tagBadges,
    `<h2>Verified Answer</h2>`,
    `<p><em>Answered by ${escapeXml(acceptedAnswer.authorName)} (${acceptedAnswer.voteScore} votes)</em></p>`,
    textToStorageParagraphs(acceptedAnswer.body),
  ]
    .filter(Boolean)
    .join('\n');
}

export function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const bodyLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...bodyLines].join('\n');
}

export function formatShortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
