// A small CSV reader for the file previews. It keeps the first rows and counts the rest.

function sniff(text) {
  const line = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  let best = ",";
  let most = 0;
  for (const d of [",", ";", "\t", "|"]) {
    const n = line.split(d).length - 1;
    if (n > most) {
      most = n;
      best = d;
    }
  }
  return best;
}

export function parseCSV(text, keep = 100) {
  const delim = sniff(text);
  const rows = [];
  let total = 0;
  let row = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const n = text.length;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.length > 1 || row[0] !== "") {
      total++;
      if (rows.length <= keep) rows.push(row);
    }
    row = [];
  };
  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") endRow();
    else if (ch !== "\r") cell += ch;
    i++;
  }
  if (cell !== "" || row.length) endRow();
  const header = rows.shift() || [];
  return { header, rows, total: Math.max(0, total - 1), delim };
}
