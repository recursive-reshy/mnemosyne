const frontmatter = [
  '---',
  'title: "How Transformers Work"',
  'source: "https://www.youtube.com/watch?v=abc123"',
  'channel: "Some Channel"',
  'duration: "1:42:10"',
  'created: 2026-10-15',
  'tags: [mnemosyne, machine-learning, transformers]',
  '---',
  '',
  '',
].join( '\n' )

const note = ( lines: string[] ): string => `${ frontmatter }${ lines.join( '\n' ) }\n`

export const noteFixtures: Record< string, string > = {
  '0.2.0 summary with YouTube timestamp links': note( [
    '## Summary',
    '',
    'First paragraph.',
    '',
    'Second paragraph.',
    '',
    '## Key points',
    '',
    '- Ownership is central ([12:34](https://youtu.be/abc123?t=754))',
    '- Borrowing follows ([1:05:20](https://youtu.be/abc123?t=3920))',
    '',
    '## Notable quotes',
    '',
    '> "Memory safety comes free." ([1:05:20](https://youtu.be/abc123?t=3920))',
  ] ),

  'summary with plain timestamps': note( [
    '## Summary',
    '',
    'Overview.',
    '',
    '## Key points',
    '',
    '- Ownership is central (12:34)',
    '- Borrowing follows (1:05:20)',
    '',
    '## Notable quotes',
    '',
    '> "Memory safety comes free." (1:05:20)',
  ] ),

  'wikilinks and aliases': note( [
    '## Summary',
    '',
    'See [[Rust Ownership]] and [[Borrow Checker|the borrow checker]].',
    '',
    '- Related: [[Lifetimes]]',
    '- Both [[A]] and [[B_c_d]] on one line, **bold [[Inside Bold]]**',
    '',
    '> Quoted [[Note]] here',
  ] ),

  'star bullets': note( [
    '## Key points',
    '',
    '* First',
    '* Second',
  ] ),

  'dash bullets and nesting': note( [
    '## Key points',
    '',
    '- First',
    '  - Nested',
    '- Second',
  ] ),

  'rule, inline code and a code block': note( [
    '## Notes',
    '',
    'Use `cargo build` here.',
    '',
    '---',
    '',
    '```rust',
    'fn main() {}',
    '```',
  ] ),

  'bold, italic, hashtags and a heading hierarchy': note( [
    '# Title',
    '',
    '## Section',
    '',
    '**Bold** and *italic* with #tag text.',
    '',
    '### Subsection',
    '',
    'Done.',
  ] ),
}
