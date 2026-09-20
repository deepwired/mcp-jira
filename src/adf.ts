/**
 * Bidirectional Markdown <-> Atlassian Document Format conversion.
 *
 * Hand-rolled rather than pulled from a dependency: this package ships two
 * runtime deps and a lean tree is part of its security posture. The subset here
 * is what Jira issue descriptions and comments actually contain — headings,
 * emphasis, links, lists, task lists, code blocks, quotes, tables and rules.
 *
 * Anything unrecognised degrades to a paragraph rather than being dropped.
 */

export interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface AdfNode {
  type: string;
  text?: string;
  marks?: AdfMark[];
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
}

export interface AdfDoc {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

const WIKI_LINK_RE = /\[([^|\]]+)\|(https?:\/\/[^\]]+)\]/g;
const MD_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
const BARE_URL_RE = /(https?:\/\/[^\s)\]>]+)/g;

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

interface InlineToken {
  text: string;
  marks: AdfMark[];
}

/**
 * Split a line into styled runs. Handles `code`, **strong**, *em*, ~~strike~~,
 * [md](links), [wiki|links] and bare URLs. Code spans win over everything else,
 * matching Markdown, so `**not bold**` inside backticks stays literal.
 */
function parseInline(line: string): AdfNode[] {
  const tokens: InlineToken[] = [];

  // Code spans are extracted first and shielded from all other parsing.
  const codeSpans: string[] = [];
  const shielded = line.replace(/`([^`]+)`/g, (_m, code: string) => {
    codeSpans.push(code);
    return `\uE000CODE${codeSpans.length - 1}\uE000`;
  });

  // Links become placeholders too, so emphasis inside a label doesn't split the mark.
  const links: Array<{ label: string; href: string }> = [];
  const withLinks = shielded
    .replace(MD_LINK_RE, (_m, label: string, href: string) => {
      links.push({ label, href });
      return `\uE000LINK${links.length - 1}\uE000`;
    })
    .replace(WIKI_LINK_RE, (_m, label: string, href: string) => {
      links.push({ label, href });
      return `\uE000LINK${links.length - 1}\uE000`;
    })
    .replace(BARE_URL_RE, (url: string) => {
      links.push({ label: url, href: url });
      return `\uE000LINK${links.length - 1}\uE000`;
    });

  walkEmphasis(withLinks, [], tokens);

  // Expand code placeholders under a set of marks. Link labels go through this
  // too — a label like `Gemfile:184` is a code span *and* a link, and expanding
  // only at the top level left the raw placeholder as the visible text.
  const expandCode = (text: string, marks: AdfMark[]): AdfNode[] => {
    const out: AdfNode[] = [];
    for (const part of text.split(/(\uE000CODE\d+\uE000)/)) {
      if (!part) continue;
      const m = /^\uE000CODE(\d+)\uE000$/.exec(part);
      if (m) {
        out.push({ type: 'text', text: codeSpans[Number(m[1])], marks: [...marks, { type: 'code' }] });
      } else {
        out.push(marks.length > 0 ? { type: 'text', text: part, marks } : { type: 'text', text: part });
      }
    }
    return out;
  };

  const nodes: AdfNode[] = [];
  for (const token of tokens) {
    for (const part of token.text.split(/(\uE000LINK\d+\uE000)/)) {
      if (!part) continue;
      const linkMatch = /^\uE000LINK(\d+)\uE000$/.exec(part);
      if (linkMatch) {
        const { label, href } = links[Number(linkMatch[1])];
        nodes.push(...expandCode(label, [...token.marks, { type: 'link', attrs: { href } }]));
      } else {
        nodes.push(...expandCode(part, token.marks));
      }
    }
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', text: '' }];
}

// Double-delimiter patterns are non-greedy over any content so that nested
// emphasis survives: `**bold and *italic* inside**` must yield strong>em, not
// a literal run. Single-delimiter patterns stay character-class bounded so a
// lone `*` cannot swallow an adjacent pair.
const EMPHASIS_PATTERNS: Array<{ re: RegExp; mark: string }> = [
  { re: /\*\*(.+?)\*\*/, mark: 'strong' },
  { re: /__(.+?)__/, mark: 'strong' },
  { re: /~~(.+?)~~/, mark: 'strike' },
  { re: /(?<![*\w])\*([^*]+)\*(?![*\w])/, mark: 'em' },
  { re: /(?<![_\w])_([^_]+)_(?![_\w])/, mark: 'em' },
];

/** Recursively peel emphasis delimiters, accumulating marks down each branch. */
function walkEmphasis(text: string, marks: AdfMark[], out: InlineToken[]): void {
  if (text === '') return;

  let best: { index: number; length: number; inner: string; mark: string } | null = null;
  for (const { re, mark } of EMPHASIS_PATTERNS) {
    const m = re.exec(text);
    if (m && (best === null || m.index < best.index)) {
      best = { index: m.index, length: m[0].length, inner: m[1], mark };
    }
  }

  if (!best) {
    out.push({ text, marks });
    return;
  }

  if (best.index > 0) out.push({ text: text.slice(0, best.index), marks });
  walkEmphasis(best.inner, [...marks, { type: best.mark }], out);
  walkEmphasis(text.slice(best.index + best.length), marks, out);
}

// ---------------------------------------------------------------------------
// Markdown -> ADF
// ---------------------------------------------------------------------------

function paragraph(line: string): AdfNode {
  return { type: 'paragraph', content: parseInline(line) };
}

function listItemContent(line: string): AdfNode[] {
  return [{ type: 'paragraph', content: parseInline(line) }];
}

const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TASK_ITEM_RE = /^\s*[-*+]\s+\[[ xX]\]\s+/;

/** True if the line opens a block that must not be swallowed into a paragraph. */
function startsBlock(line: string): boolean {
  return (
    /^\s*`{3,}/.test(line) ||
    /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    /^\s*#{1,6}\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    LIST_ITEM_RE.test(line)
  );
}

/**
 * Jira authors routinely type "1." or "-" as literal text in a plain paragraph
 * rather than using a real list. Emitted unescaped, Markdown would read those
 * back as list items — and renumber them, turning "2." into "1." and changing
 * what the text says. Escaping the marker keeps the paragraph a paragraph.
 */
// Only punctuation can carry a Markdown backslash escape, so an ordered marker
// is escaped on its separator ("2\.") rather than on the digit ("\2." would
// render the backslash literally).
const ORDERED_START_RE = /^(\s*)(\d+)([.)])(\s|$)/;
const SYMBOL_START_RE = /^(\s*)([-*+]|#{1,6}|>)(\s|$)/;
const ESCAPED_ORDERED_RE = /^(\s*)(\d+)\\([.)])/;
const ESCAPED_SYMBOL_RE = /^(\s*)\\([-*+]|#{1,6}|>)/;

function escapeBlockStarts(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(ORDERED_START_RE, '$1$2\\$3$4')
        .replace(SYMBOL_START_RE, '$1\\$2$3'),
    )
    .join('\n');
}

function unescapeBlockStart(line: string): string {
  return line.replace(ESCAPED_ORDERED_RE, '$1$2$3').replace(ESCAPED_SYMBOL_RE, '$1$2');
}

/** One paragraph from consecutive lines, separated by hard breaks. */
function paragraphFromLines(lines: string[]): AdfNode {
  if (lines.length === 0) return { type: 'paragraph', content: [{ type: 'text', text: '' }] };
  const content: AdfNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) content.push({ type: 'hardBreak' });
    content.push(...parseInline(line));
  });
  return { type: 'paragraph', content };
}

/**
 * Parse a list and any lists nested under it. Indentation decides nesting: an
 * item indented further than the current level becomes a sublist attached to
 * the preceding item, which is how the renderer emits it.
 */
function parseListBlock(lines: string[], start: number): [AdfNode, number] {
  const first = LIST_ITEM_RE.exec(lines[start])!;
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: AdfNode[] = [];
  let i = start;

  while (i < lines.length) {
    const m = LIST_ITEM_RE.exec(lines[i]);
    if (!m) break;

    const indent = m[1].length;
    if (indent < baseIndent) break;

    if (indent > baseIndent) {
      const [nested, next] = parseListBlock(lines, i);
      if (items.length > 0) {
        items[items.length - 1].content!.push(nested);
      } else {
        items.push({ type: 'listItem', content: [nested] });
      }
      i = next;
      continue;
    }

    // Same level: a change of list type starts a new list.
    if (/\d/.test(m[2]) !== ordered) break;
    // A task item at this level belongs to a taskList, not here.
    if (TASK_ITEM_RE.test(lines[i])) break;

    items.push({ type: 'listItem', content: listItemContent(m[3]) });
    i++;
  }

  const startNum = ordered ? parseInt(first[2], 10) : 1;
  const list: AdfNode = ordered
    ? { type: 'orderedList', attrs: { order: startNum }, content: items }
    : { type: 'bulletList', content: items };
  return [list, i];
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

export function markdownToAdf(markdown: string): AdfDoc {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const content: AdfNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block
    const fence = /^\s*(`{3,})(.*)$/.exec(line);
    if (fence) {
      const width = fence[1].length;
      const closeRe = new RegExp('^\\s*`{' + width + ',}\\s*$');
      const language = fence[2].trim().split(/\s+/)[0] || undefined;
      const body: string[] = [];
      i++;
      while (i < lines.length && !closeRe.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      content.push({
        type: 'codeBlock',
        ...(language ? { attrs: { language } } : {}),
        content: body.length > 0 ? [{ type: 'text', text: body.join('\n') }] : [],
      });
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      content.push({ type: 'rule' });
      i++;
      continue;
    }

    // Heading
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2].trim()),
      });
      i++;
      continue;
    }

    // Table — a header row followed by a divider row
    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const rows: AdfNode[] = [];
      const headerCells = splitTableRow(line);
      rows.push({
        type: 'tableRow',
        content: headerCells.map((c) => ({
          type: 'tableHeader',
          attrs: {},
          content: [paragraph(c)],
        })),
      });
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push({
          type: 'tableRow',
          content: splitTableRow(lines[i]).map((c) => ({
            type: 'tableCell',
            attrs: {},
            content: [paragraph(c)],
          })),
        });
        i++;
      }
      content.push({ type: 'table', attrs: { isNumberColumnEnabled: false }, content: rows });
      continue;
    }

    // Blockquote — consume the contiguous run
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const inner = markdownToAdf(body.join('\n'));
      content.push({ type: 'blockquote', content: inner.content });
      continue;
    }

    // Task list
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[i])) {
        const m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i])!;
        items.push({
          type: 'taskItem',
          attrs: { state: m[1].toLowerCase() === 'x' ? 'DONE' : 'TODO', localId: String(items.length) },
          content: parseInline(m[2]),
        });
        i++;
      }
      content.push({ type: 'taskList', attrs: { localId: 'tasks' }, content: items });
      continue;
    }

    // Bullet or ordered list, including nesting by indentation
    if (LIST_ITEM_RE.test(line)) {
      const [list, next] = parseListBlock(lines, i);
      content.push(list);
      i = next;
      continue;
    }

    // Paragraph. Consecutive plain lines belong to ONE paragraph, joined by
    // hard breaks — that is Markdown's rule, and treating each line as its own
    // paragraph made round-trips unstable (a quoted multi-line paragraph grew
    // a blank quote line on every pass).
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines[i])) {
      para.push(unescapeBlockStart(lines[i]));
      i++;
    }
    if (para.length === 0) {
      // startsBlock() said this opens a block but no handler above consumed it.
      // Treat it as literal text and advance: without this the loop cannot
      // terminate, which is an out-of-memory crash rather than a bad render.
      para.push(unescapeBlockStart(lines[i]));
      i++;
    }
    content.push(paragraphFromLines(para));
  }

  return { type: 'doc', version: 1, content: content.length > 0 ? content : [paragraph('')] };
}

// ---------------------------------------------------------------------------
// ADF -> Markdown
// ---------------------------------------------------------------------------

function inlineToMarkdown(nodes: AdfNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '\n';
      if (n.type === 'mention') return `@${(n.attrs?.text as string)?.replace(/^@/, '') ?? 'unknown'}`;
      if (n.type === 'emoji') return (n.attrs?.shortName as string) ?? '';
      if (n.type === 'inlineCard') return (n.attrs?.url as string) ?? '';
      if (n.type !== 'text') return inlineToMarkdown(n.content);

      let text = n.text ?? '';
      const marks = n.marks ?? [];
      // code first so the backticks sit inside any emphasis
      if (marks.some((m) => m.type === 'code')) text = `\`${text}\``;
      if (marks.some((m) => m.type === 'strong')) text = `**${text}**`;
      if (marks.some((m) => m.type === 'em')) text = `*${text}*`;
      if (marks.some((m) => m.type === 'strike')) text = `~~${text}~~`;
      const link = marks.find((m) => m.type === 'link');
      if (link?.attrs?.href) {
        const href = link.attrs.href as string;
        text = text === href ? href : `[${text}](${href})`;
      }
      return text;
    })
    .join('');
}

function blockToMarkdown(node: AdfNode, depth = 0): string {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map((c) => blockToMarkdown(c, depth)).join('\n\n');

    case 'paragraph':
      return escapeBlockStarts(inlineToMarkdown(node.content));

    case 'heading': {
      const level = Number(node.attrs?.level ?? 1);
      return `${'#'.repeat(Math.min(Math.max(level, 1), 6))} ${inlineToMarkdown(node.content)}`;
    }

    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? '';
      const body = (node.content ?? []).map((c) => c.text ?? '').join('');
      // A body containing its own ``` line would close the fence early and
      // truncate the block, so widen the fence past the longest run inside.
      const longest = Math.max(0, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
      const fence = '`'.repeat(Math.max(3, longest + 1));
      return `${fence}${lang}\n${body}\n${fence}`;
    }

    case 'rule':
      return '---';

    case 'blockquote':
      return (node.content ?? [])
        .map((c) => blockToMarkdown(c, depth))
        .join('\n\n')
        .split('\n')
        .map((l) => `> ${l}`.trimEnd())
        .join('\n');

    case 'bulletList':
      return (node.content ?? [])
        .map((item) => renderListItem(item, depth, '-'))
        .join('\n');

    case 'orderedList': {
      const start = Number(node.attrs?.order ?? 1) || 1;
      return (node.content ?? [])
        .map((item, idx) => renderListItem(item, depth, `${start + idx}.`))
        .join('\n');
    }

    case 'taskList':
      return (node.content ?? [])
        .map((item) => {
          const box = item.attrs?.state === 'DONE' ? '[x]' : '[ ]';
          return `${'  '.repeat(depth)}- ${box} ${inlineToMarkdown(item.content)}`;
        })
        .join('\n');

    case 'table': {
      const rows = node.content ?? [];
      if (rows.length === 0) return '';
      const rendered = rows.map((row) =>
        (row.content ?? []).map((cell) =>
          (cell.content ?? [])
            .map((c) => blockToMarkdown(c, 0))
            .join(' ')
            .replace(/\n/g, ' ')
            .replace(/\|/g, '\\|')
            .trim(),
        ),
      );
      const width = Math.max(...rendered.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
      const [header, ...body] = rendered;
      return [
        `| ${pad(header).join(' | ')} |`,
        `| ${Array(width).fill('---').join(' | ')} |`,
        ...body.map((r) => `| ${pad(r).join(' | ')} |`),
      ].join('\n');
    }

    case 'panel': {
      const kind = (node.attrs?.panelType as string) ?? 'info';
      const inner = (node.content ?? []).map((c) => blockToMarkdown(c, depth)).join('\n\n');
      return inner
        .split('\n')
        .map((l, idx) => (idx === 0 ? `> **${kind.toUpperCase()}:** ${l}` : `> ${l}`))
        .join('\n');
    }

    case 'mediaSingle':
    case 'mediaGroup':
      // Asterisk emphasis, matching what inlineToMarkdown emits, so the
      // placeholder survives a round trip unchanged.
      return (node.content ?? [])
        .map((m) => `*[attachment: ${(m.attrs?.id as string) ?? 'unknown'}]*`)
        .join(' ');

    // Smart links. The URL lives in attrs with no content, so the default
    // branch would return an empty string and silently drop the link.
    case 'blockCard':
    case 'embedCard':
      return (node.attrs?.url as string) ?? '';

    case 'expand':
    case 'nestedExpand': {
      const title = (node.attrs?.title as string) ?? 'Details';
      const inner = (node.content ?? []).map((c) => blockToMarkdown(c, depth)).join('\n\n');
      return `**${title}**\n\n${inner}`;
    }

    default:
      // Unknown block: keep whatever text it carries rather than dropping it.
      if (node.content) return inlineToMarkdown(node.content);
      if (node.text) return node.text;
      // No content and no text — surface any URL rather than returning nothing.
      return (node.attrs?.url as string) ?? '';
  }
}

function renderListItem(item: AdfNode, depth: number, bullet: string): string {
  const indent = '  '.repeat(depth);
  const blocks = item.content ?? [];
  const parts: string[] = [];

  blocks.forEach((block, idx) => {
    if (block.type === 'bulletList' || block.type === 'orderedList' || block.type === 'taskList') {
      parts.push(blockToMarkdown(block, depth + 1));
    } else if (idx === 0) {
      parts.push(`${indent}${bullet} ${blockToMarkdown(block, depth)}`);
    } else {
      parts.push(
        blockToMarkdown(block, depth)
          .split('\n')
          .map((l) => `${indent}  ${l}`)
          .join('\n'),
      );
    }
  });

  return parts.join('\n');
}

export function adfToMarkdown(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  return blockToMarkdown(node as AdfNode).trim();
}

// ---------------------------------------------------------------------------
// Plain-text mode
// ---------------------------------------------------------------------------

/**
 * Link-aware but style-blind. Bare URLs and `[label|url]` wiki markup become
 * links; `**` and friends stay literal. This is the `format: "text"` path, and
 * the pre-2.0 default.
 */
function parseLinksOnly(line: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  const links: Array<{ label: string; href: string }> = [];

  const shielded = line
    .replace(WIKI_LINK_RE, (_m, label: string, href: string) => {
      links.push({ label, href });
      return `\uE000LINK${links.length - 1}\uE000`;
    })
    .replace(BARE_URL_RE, (url: string) => {
      links.push({ label: url, href: url });
      return `\uE000LINK${links.length - 1}\uE000`;
    });

  for (const part of shielded.split(/(\uE000LINK\d+\uE000)/)) {
    if (!part) continue;
    const m = /^\uE000LINK(\d+)\uE000$/.exec(part);
    if (m) {
      const { label, href } = links[Number(m[1])];
      nodes.push({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] });
    } else {
      nodes.push({ type: 'text', text: part });
    }
  }

  return nodes;
}

export function plainTextToAdf(text: string): AdfDoc {
  const paragraphs = text.split('\n').map((line) => ({
    type: 'paragraph' as const,
    content: line ? parseLinksOnly(line) : [{ type: 'text' as const, text: '' }],
  }));
  return { type: 'doc', version: 1, content: paragraphs };
}

/** Flattens ADF to text, preserving links as `[label|url]` wiki markup. */
export function extractTextFromAdf(node: Record<string, unknown>): string {
  if (node.type === 'text' && typeof node.text === 'string') {
    const marks = node.marks as AdfMark[] | undefined;
    const linkMark = marks?.find((m) => m.type === 'link');
    if (linkMark?.attrs?.href) {
      const href = linkMark.attrs.href as string;
      if (node.text === href) return href;
      return `[${node.text}|${href}]`;
    }
    return node.text;
  }
  if (Array.isArray(node.content)) {
    const children = node.content as Record<string, unknown>[];
    const hasBlocks = children.some(
      (c) => c.type === 'paragraph' || c.type === 'bulletList' || c.type === 'orderedList',
    );
    return children.map(extractTextFromAdf).join(hasBlocks ? '\n' : '');
  }
  return '';
}

// ---------------------------------------------------------------------------
// Format dispatch
// ---------------------------------------------------------------------------

export type ContentFormat = 'markdown' | 'text' | 'adf';

/** Convert user-supplied content into an ADF document for writing to Jira. */
export function toAdf(text: string, format: ContentFormat = 'markdown'): unknown {
  if (format === 'adf') {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        'format was "adf" but the supplied content is not valid JSON. ' +
          'Pass an ADF document as a JSON string, or use format "markdown".',
      );
    }
  }
  return format === 'text' ? plainTextToAdf(text) : markdownToAdf(text);
}

/** Render an ADF body from Jira into the requested output format. */
export function fromAdf(body: unknown, format: ContentFormat = 'markdown'): string {
  if (body === null || body === undefined) return '';
  if (format === 'adf') return JSON.stringify(body, null, 2);
  if (typeof body === 'string') return body;
  if (format === 'text') return extractTextFromAdf(body as Record<string, unknown>);
  return adfToMarkdown(body);
}
