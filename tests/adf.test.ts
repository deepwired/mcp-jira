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

describe('real-world fixture (TRAP-5466 structure)', () => {
  // Trimmed from a genuine BrowserStack Jira description: the exact combination
  // of block types that the previous flatten-everything converter destroyed.
  const REAL = [
    '**Population A of TRAP-5448.** Ship first — cheapest, largest measured footprint.',
    '',
    '> **UNBLOCKED 2026-09-18.** A deep re-scan has enumerated it: 74 methods.',
    '',
    '## Definition',
    '',
    'ES searches resolving against a `test_runs*` wildcard. Fix is `ESIndexUtil.getESIndexBetweenDates(Date, Date)`.',
    '',
    '| Repo | Method | Fit |',
    '| --- | --- | --- |',
    '| api | `TestingTrendsService` | As-is |',
    '| pipeline | `WeeklySummaryService` | Perfect fit |',
    '',
    '## Acceptance criteria',
    '',
    '- [ ] Every listed member resolves via `getESIndexBetweenDates`.',
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
