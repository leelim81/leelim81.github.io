"""Helpers shared by the content sources in dev/."""
import io
import textwrap

import pandas as pd


def csv_text(df, **kw):
    buf = io.StringIO()
    df.to_csv(buf, index=False, **kw)
    return buf.getvalue()


def code(text):
    """Dedent a triple-quoted code block and make sure it ends with one newline."""
    return textwrap.dedent(text).strip("\n") + "\n"


def cols(*names):
    return ", ".join(f"<code>{n}</code>" for n in names)


def file_list(*items):
    """items: (file name, [columns], optional note)."""
    out = []
    for it in items:
        name, columns = it[0], it[1]
        note = f" {it[2]}" if len(it) > 2 and it[2] else ""
        out.append(f"<li><code>{name}</code>: {cols(*columns)}.{note}</li>")
    return '<ul class="files">' + "".join(out) + "</ul>"


def schema(rows):
    """rows: (column, type, meaning)."""
    body = "".join(f"<tr><td><code>{n}</code></td><td>{t}</td><td>{m}</td></tr>" for n, t, m in rows)
    return ('<table class="schema"><thead><tr><th>Column</th><th>Type</th><th>Meaning</th></tr></thead>'
            f"<tbody>{body}</tbody></table>")


def html(text):
    return textwrap.dedent(text).strip()


def read_csv_text(text, **kw):
    return pd.read_csv(io.StringIO(text), **kw)
