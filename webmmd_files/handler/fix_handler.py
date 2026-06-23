"""Fix compound-assignment / optional-chaining / nullish-coalescing
that format_js.py incorrectly splits with spaces."""
import re, pathlib

HANDLER_JS = pathlib.Path(r'c:\Users\realryo1\Desktop\mmd\webmmd_files\handler.js')
src = HANDLER_JS.read_text(encoding='utf-8')

# compound assignments: ' + = ' -> ' += '
for op_char in ['+', '-', '*', '/', '%', '&', '|', '^']:
    src = src.replace(f' {op_char} = ', f' {op_char}= ')

# **= was likely left as ' * *= ' or '* *=' - fix robustly
src = re.sub(r'\*\s*\*\s*=', '**=', src)

# optional chaining: '? .' -> '?.'
src = src.replace('? .', '?.')

# nullish coalescing: ' ? ? ' -> ' ?? '
src = re.sub(r' \? \? ', ' ?? ', src)
# also at end of line before literal
src = re.sub(r'\? \?(?=\s*[`\'"])', '??', src)

# Fix regex literals with flags split by spaces:
#   '/ skin / i'  -> '/skin/i'
#   '/ \u8155 / ' -> '/\u8155/'  (semantics fix too)
# Strategy: inside array [...] or after common punctuation,
# collapse '/ content / flags' back into '/content/flags'
def fix_regex(m):
    content = m.group(1).strip()
    flags = m.group(2) or ''
    return '/' + content + '/' + flags

# Matches: / <anything without unescaped slash> / <optional flags>
# Must be preceded by [ , ( = ! ? : | & to be in regex context
src = re.sub(
    r'(?<=[,\[(!?:|&=])\s*/\s+([^/\n]+?)\s+/\s*([gimsuy]*)',
    fix_regex,
    src
)

HANDLER_JS.write_text(src, encoding='utf-8')
print('handler.js fixed.')
