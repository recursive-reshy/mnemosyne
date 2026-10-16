// Packages
import {
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
} from '@mdxeditor/editor'
import type { MDXEditorProps, ToMarkdownOptions } from '@mdxeditor/editor'
// App
import { wikilinkTextHandler } from './wikilinkMarkdown'

export const noteEditorPlugins = (): NonNullable< MDXEditorProps[ 'plugins' ] > => [
  headingsPlugin(),
  listsPlugin(),
  quotePlugin(),
  linkPlugin(),
  thematicBreakPlugin(),
  codeBlockPlugin( { defaultCodeBlockLanguage: '' } ),
  codeMirrorPlugin( { codeBlockLanguages: { '': 'Text', rust: 'Rust' } } ),
  frontmatterPlugin(),
  markdownShortcutPlugin(),
  diffSourcePlugin( { viewMode: 'rich-text' } ),
]

export const noteMarkdownOptions: ToMarkdownOptions = {
  bullet: '-',
  rule: '-',
  handlers: { text: wikilinkTextHandler },
}
