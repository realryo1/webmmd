import argparse
import re
from pathlib import Path

INDENT = '    '

TOKEN_RE = re.compile(
    r'''("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|//.*?$|/\*.*?\*/|\b(?:return|throw|case|default|if|else|for|while|do|switch|try|catch|finally|class|function|async|await|new|const|let|var|import|export)\b|=>|\?\?=|&&=|\|\|=|\*\*=|>>>=|>>=|<<=|\+=|-=|\*=|/=|%=|&=|\|=|\^=|\?\.|===|!==|==|!=|<=|>=|\*\*|>>>|>>|<<|&&|\|\||\?\?|\+\+|--|[{}()[\],;:]|\.|\?|[+\-*/%<>=!&|^~]|\s+|[^\s{}()[\],;:.?+\-*/%<>=!&|^~]+)
    ''',
    re.MULTILINE | re.DOTALL | re.VERBOSE,
)

KEYWORDS_SPACE_AFTER = {
    'if', 'for', 'while', 'switch', 'catch', 'function'
}

KEYWORDS_LINEBREAK_AFTER = {'return', 'throw'}


def tokenize(src: str):
    return [m.group(0) for m in TOKEN_RE.finditer(src)]


def format_js(src: str) -> str:
    tokens = tokenize(src)
    out = []
    indent = 0
    newline = True
    prev = ''

    def write(text: str):
        nonlocal newline
        if not out:
            out.append(text)
            newline = text.endswith('\n')
            return
        out.append(text)
        newline = text.endswith('\n')

    def write_indent():
        nonlocal newline
        if newline:
            out.append(INDENT * max(indent, 0))
            newline = False

    def ensure_space():
        if out and not out[-1].endswith((' ', '\n')):
            out.append(' ')

    def ensure_newline(extra=0):
        nonlocal newline
        if out and not out[-1].endswith('\n'):
            out.append('\n')
        for _ in range(extra):
            out.append('\n')
        newline = True

    for raw in tokens:
        tok = raw
        if tok.isspace():
            continue
        if tok.startswith('//') or tok.startswith('/*'):
            ensure_newline()
            write_indent()
            write(tok)
            ensure_newline()
            prev = tok
            continue
        if tok == '{':
            if prev not in ('', ' ', '\n', '(', '[', '{'):
                ensure_space()
            write('{')
            indent += 1
            ensure_newline()
        elif tok == '}':
            indent -= 1
            ensure_newline()
            write_indent()
            write('}')
        elif tok == ';':
            write(';')
            ensure_newline()
        elif tok == ',':
            write(',')
            ensure_space()
        elif tok == ':':
            write(': ')
        elif tok == '(':
            if prev in KEYWORDS_SPACE_AFTER:
                ensure_space()
            write('(')
        elif tok == ')':
            write(')')
        elif tok == '[':
            write('[')
        elif tok == ']':
            write(']')
        elif tok == '.':
            write('.')
        elif tok == '?.':
            write('?.')
        elif tok == '=>':
            ensure_space()
            write('=> ')
        elif tok in {'=', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '+', '-', '*', '/', '%', '&&', '||', '??', '&', '|', '^', '**', '>>', '<<', '>>>',
                     '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**=', '>>=', '<<=', '>>>=', '&&=', '||=', '??='}:
            ensure_space()
            write(tok)
            write(' ')
        elif tok == '?':
            ensure_space()
            write('? ')
        else:
            if newline:
                write_indent()
            elif prev not in {'', '(', '[', '{', '.', '!', '~', '?', ':', '\n'} and tok not in {')', ']', '}', ';', ',', '.'}:
                ensure_space()
            write(tok)
            if tok in KEYWORDS_LINEBREAK_AFTER:
                ensure_space()
        prev = tok

    text = ''.join(out)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+\n', '\n', text)
    return text.strip() + '\n'


def main():
    parser = argparse.ArgumentParser(description='Simple local JS formatter for minified-ish files.')
    parser.add_argument('input', type=Path)
    parser.add_argument('-o', '--output', type=Path)
    args = parser.parse_args()

    src = args.input.read_text(encoding='utf-8', errors='replace')
    formatted = format_js(src)

    if args.output:
        args.output.write_text(formatted, encoding='utf-8')
    else:
        print(formatted)


if __name__ == '__main__':
    main()
