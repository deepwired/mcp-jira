import { describe, it, expect } from 'vitest';
import { markdownToAdf, adfToMarkdown, type AdfNode } from '../src/adf.js';

function firstBlock(md: string): AdfNode {
  return markdownToAdf(md).content[0];
}

function roundTrip(md: string): string {
  return adfToMarkdown(markdownToAdf(md));
}

describe('markdownToAdf — block structure', () => {
  it('parses headings at every level', () => {
    for (let level = 1; level <= 6; level++) {
      const node = firstBlock(`${'#'.repeat(level)} Title`);
      expect(node.type).toBe('heading');
      expect(node.attrs?.level).toBe(level);
    }
  });

  it('parses a fenced code block with its language', () => {
    const node = firstBlock('```ts\nconst a = 1;\nconst b = 2;\n```');
    expect(node.type).toBe('codeBlock');
    expect(node.attrs?.language).toBe('ts');
    expect(node.content?.[0].text).toBe('const a = 1;\nconst b = 2;');
  });

  it('does not parse markdown inside a code block', () => {
    const node = firstBlock('```\n# not a heading\n**not bold**\n```');
    expect(node.type).toBe('codeBlock');
    expect(node.content?.[0].text).toContain('# not a heading');
  });

  it('parses bullet and ordered lists', () => {
    expect(firstBlock('- one\n- two').type).toBe('bulletList');
    expect(firstBlock('- one\n- two').content).toHaveLength(2);
    expect(firstBlock('1. one\n2. two').type).toBe('orderedList');
  });

  it('parses task lists with checked state', () => {
    const node = firstBlock('- [ ] todo\n- [x] done');
    expect(node.type).toBe('taskList');
    expect(node.content?.[0].attrs?.state).toBe('TODO');
    expect(node.content?.[1].attrs?.state).toBe('DONE');
  });

  it('parses a blockquote', () => {
    const node = firstBlock('> quoted line\n> second line');
    expect(node.type).toBe('blockquote');
    expect(node.content?.[0].type).toBe('paragraph');
  });

  it('parses a table into header and body rows', () => {
    const node = firstBlock('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');
    expect(node.type).toBe('table');
    expect(node.content).toHaveLength(3);
    expect(node.content?.[0].content?.[0].type).toBe('tableHeader');
    expect(node.content?.[1].content?.[0].type).toBe('tableCell');
  });

  it('parses a horizontal rule', () => {
    expect(firstBlock('---').type).toBe('rule');
  });

  it('treats a bare line as a paragraph', () => {
    expect(firstBlock('just some text').type).toBe('paragraph');
  });
});

describe('markdownToAdf — inline marks', () => {
  function marksOf(md: string): string[][] {
    const para = firstBlock(md);
    return (para.content ?? []).map((n) => (n.marks ?? []).map((m) => m.type));
  }

  it('applies strong, em and strike', () => {
    expect(marksOf('**bold**').flat()).toContain('strong');
    expect(marksOf('*italic*').flat()).toContain('em');
    expect(marksOf('~~gone~~').flat()).toContain('strike');
    expect(marksOf('__also bold__').flat()).toContain('strong');
  });

  it('applies inline code and shields it from emphasis parsing', () => {
    const para = firstBlock('use `**literal**` here');
    const code = (para.content ?? []).find((n) => n.marks?.some((m) => m.type === 'code'));
    expect(code?.text).toBe('**literal**');
    expect(code?.marks?.some((m) => m.type === 'strong')).toBeFalsy();
  });

  it('nests marks', () => {
    const para = firstBlock('**bold and *italic* inside**');
    const nested = (para.content ?? []).find((n) => (n.marks ?? []).length === 2);
    expect(nested?.marks?.map((m) => m.type).sort()).toEqual(['em', 'strong']);
  });

  it('linkifies markdown links, wiki links and bare URLs', () => {
    const md = firstBlock('[label](https://example.com/a)');
    expect(md.content?.[0].marks?.[0].attrs?.href).toBe('https://example.com/a');

    const wiki = firstBlock('[label|https://example.com/b]');
    expect(wiki.content?.[0].marks?.[0].attrs?.href).toBe('https://example.com/b');
    expect(wiki.content?.[0].text).toBe('label');

    const bare = firstBlock('see https://example.com/c now');
    const linked = (bare.content ?? []).find((n) => n.marks?.some((m) => m.type === 'link'));
    expect(linked?.marks?.[0].attrs?.href).toBe('https://example.com/c');
  });

  it('does not treat underscores inside words as emphasis', () => {
    const para = firstBlock('some_var_name and another_one');
    expect((para.content ?? []).every((n) => (n.marks ?? []).length === 0)).toBe(true);
  });
});

describe('adfToMarkdown', () => {
  it('renders a table with a divider row', () => {
    const out = adfToMarkdown(markdownToAdf('| A | B |\n| --- | --- |\n| 1 | 2 |'));
    expect(out.split('\n')[1]).toMatch(/^\|\s*---\s*\|\s*---\s*\|$/);
  });

  it('renders a bare URL without doubling it into a labelled link', () => {
    expect(adfToMarkdown(markdownToAdf('https://example.com/x'))).toBe('https://example.com/x');
  });

  it('keeps text from unknown node types rather than dropping it', () => {
    const weird = {
      type: 'doc',
      version: 1,
      content: [{ type: 'someFutureNode', content: [{ type: 'text', text: 'kept' }] }],
    };
    expect(adfToMarkdown(weird)).toContain('kept');
  });

  it('renders a mention as an @handle', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { id: '123', text: '@Alice' } }],
        },
      ],
    };
    expect(adfToMarkdown(doc)).toBe('@Alice');
  });

  it('renders a panel as an annotated quote', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'panel',
          attrs: { panelType: 'warning' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'careful' }] }],
        },
      ],
    };
    expect(adfToMarkdown(doc)).toBe('> **WARNING:** careful');
  });

  it('passes a plain string through unchanged', () => {
    expect(adfToMarkdown('already text')).toBe('already text');
  });
});

describe('round-trip fidelity', () => {
  const cases: Array<[string, string]> = [
    ['heading', '## A heading'],
    ['paragraph', 'Just a sentence.'],
    ['bold', 'Some **bold** text.'],
    ['italic', 'Some *italic* text.'],
    ['strike', 'Some ~~struck~~ text.'],
    ['inline code', 'Call `doThing()` first.'],
    ['link', 'See [the docs](https://example.com/docs) for more.'],
    ['bullet list', '- one\n- two\n- three'],
    ['ordered list', '1. one\n2. two'],
    ['task list', '- [ ] open\n- [x] closed'],
    ['code block', '```js\nconst x = 1;\n```'],
    ['blockquote', '> a quoted claim'],
    ['rule', '---'],
    ['table', '| A | B |\n| --- | --- |\n| 1 | 2 |'],
  ];

  for (const [name, md] of cases) {
    it(`survives a markdown -> ADF -> markdown round trip: ${name}`, () => {
      expect(roundTrip(md)).toBe(md);
    });
  }

  it('is stable on a second pass', () => {
    const md = '## Title\n\nSome **bold** and a [link](https://example.com).\n\n- a\n- b';
    expect(roundTrip(roundTrip(md))).toBe(roundTrip(md));
  });
});

describe('real-world structure fixture', () => {
  // The block combination that the previous flatten-everything converter
  // destroyed, taken from the shape of a real Jira description rather than its
  // content: lead paragraph, callout quote, headings, a table, and a checklist.
  const REAL = [
    '**Depends on PROJ-100.** Ship first — cheapest change, largest measured effect.',
    '',
    '> **UNBLOCKED 2026-09-18.** A second pass enumerated the call sites: 74 methods.',
    '',
    '## Definition',
    '',
    'Queries resolving against a `records-*` wildcard. Fix is `IndexUtil.betweenDates(Date, Date)`.',
    '',
    '| Component | Entry point | Fit |',
    '| --- | --- | --- |',
    '| api | `ReportService` | as-is |',
    '| worker | `DigestService` | direct |',
    '',
    '## Acceptance criteria',
    '',
    '- [ ] Every listed member resolves via `betweenDates`.',
    '- [x] All four wildcard surfaces are covered.',
  ].join('\n');

  it('preserves every block type through a round trip', () => {
    expect(roundTrip(REAL)).toBe(REAL);
  });

  it('produces the block sequence the old converter collapsed', () => {
    const types = markdownToAdf(REAL).content.map((n) => n.type);
    expect(types).toEqual([
      'paragraph',
      'blockquote',
      'heading',
      'paragraph',
      'table',
      'heading',
      'taskList',
    ]);
  });

  it('keeps table cells addressable instead of concatenating them', () => {
    const table = markdownToAdf(REAL).content.find((n) => n.type === 'table')!;
    expect(table.content).toHaveLength(3);
    const firstBodyRow = table.content![1];
    expect(firstBodyRow.content).toHaveLength(3);
  });
});

describe('regressions found against live Jira data', () => {
  it('does not hang on a fence line with trailing text', () => {
    // startsBlock() accepted any ```-prefixed line but the fence handler
    // required the line to end after the language, so nothing consumed it and
    // markdownToAdf spun until the process ran out of memory.
    const t0 = Date.now();
    expect(() => markdownToAdf('```bash -x\nfoo\n```')).not.toThrow();
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('keeps a nested ordered list nested, and keeps its numbering', () => {
    const md = '1. outer\n  1. inner a\n  2. inner b\n2. outer two';
    const doc = markdownToAdf(md);
    expect(doc.content).toHaveLength(1);
    const nested = doc.content[0].content![0].content!.find((n) => n.type === 'orderedList');
    expect(nested).toBeDefined();
    expect(nested!.content).toHaveLength(2);
    expect(roundTrip(md)).toBe(md);
  });

  it('a paragraph that merely starts with a number stays a paragraph', () => {
    // Real Jira descriptions often type "1." / "2." as literal text. Read back
    // unescaped, Markdown turned them into list items and RENUMBERED them,
    // silently changing "2." to "1.".
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '2. Second step' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '3. Third step' }] },
      ],
    };
    const md = adfToMarkdown(doc);
    expect(md).toContain('2\\.');
    const back = markdownToAdf(md);
    expect(back.content.every((n) => n.type === 'paragraph')).toBe(true);
    expect(adfToMarkdown(back)).toBe(md);
  });

  it('preserves an ordered list that starts at a number other than 1', () => {
    expect(roundTrip('3. three\n4. four')).toBe('3. three\n4. four');
  });

  it('keeps a smart-link URL that lives only in attrs', () => {
    // blockCard carries its URL in attrs with no content, so the default
    // branch returned '' and the link vanished entirely.
    const doc = {
      type: 'doc',
      version: 1,
      content: [{ type: 'blockCard', attrs: { url: 'https://example.com/thread/1' } }],
    };
    expect(adfToMarkdown(doc)).toContain('https://example.com/thread/1');
  });

  it('keeps the label of a link whose text is a code span', () => {
    // [`Gemfile:184`](url) rendered as [CODE0](url) — the placeholder leaked
    // and the real label was lost.
    const md = 'see [`Gemfile:184`](https://example.com/f) here';
    const doc = markdownToAdf(md);
    const node = doc.content[0].content!.find((n) => n.marks?.some((m) => m.type === 'link'));
    expect(node!.text).toBe('Gemfile:184');
    expect(node!.marks!.map((m) => m.type).sort()).toEqual(['code', 'link']);
    expect(adfToMarkdown(doc)).toBe(md);
  });

  it('widens the fence when the code body contains backticks', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'codeBlock', content: [{ type: 'text', text: 'a\n```\nb' }] },
      ],
    };
    const md = adfToMarkdown(doc);
    expect(md.startsWith('````')).toBe(true);
    // and it survives the trip back without truncating at the inner fence
    const back = markdownToAdf(md);
    expect(back.content[0].content![0].text).toBe('a\n```\nb');
  });

  it('folds consecutive plain lines into one paragraph with hard breaks', () => {
    const doc = markdownToAdf('line one\nline two');
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].content!.some((n) => n.type === 'hardBreak')).toBe(true);
  });

  it('a multi-line quoted paragraph does not grow a blank quote line each pass', () => {
    const md = '> first line\n> second line';
    expect(roundTrip(md)).toBe(md);
    expect(roundTrip(roundTrip(md))).toBe(md);
  });
});
