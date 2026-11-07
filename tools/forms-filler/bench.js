/* Browser extraction for the visual benchmark.
   Callers pass PDF bytes and a frozen gate. They do not pass gold text. */
(function (global) {
  function bytesOf(buffer) {
    return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  }

  async function positions(bytes) {
    var pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    var page = await pdf.getPage(1);
    var content = await page.getTextContent();
    return content.items.filter(function (item) { return item.str && String(item.str).trim(); }).map(function (item) {
      return {
        text: String(item.str),
        x: item.transform[4],
        y: item.transform[5],
        w: item.width || 0
      };
    });
  }

  async function paint(kind, raw, fields, values) {
    if (kind === 'acro') return FormFields.fill(raw, fields, values, { flatten: true });
    var doc = await PDFLib.PDFDocument.load(raw.slice(0));
    var font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    var page = doc.getPages()[0];
    fields.forEach(function (field) {
      var value = values[field.id];
      if (!value || !field.rect) return;
      page.drawText(String(value).slice(0, 80), {
        x: field.rect.x + 2,
        y: field.rect.y + 4,
        size: 11,
        font: font
      });
    });
    return new Uint8Array(await doc.save());
  }

  function slimField(field) {
    return {
      id: field.id,
      label: field.label,
      type: field.type,
      untrusted: !!field.untrusted,
      rect: field.rect || null,
      page: field.page || 0
    };
  }

  async function run(formBuffer, refBuffer, frozen, paintMode) {
    var formBytes = bytesOf(formBuffer);
    var refBytes = bytesOf(refBuffer);
    var form = await FormFields.read(formBytes);
    var spatial = await FormExtract.spatial(refBytes, 'application/pdf');
    var candidate = FormSelect.decideAll(form.fields, spatial.text, frozen || {}, { channel: spatial.channel });
    var parsed = FormFacts.fromText(spatial.text);
    var mapped = FormFacts.mapFactsToFields(parsed, form.fields);
    var baseline = form.fields.map(function (field) {
      var value = mapped[field.id] ? String(mapped[field.id]) : '';
      return { fieldId: field.id, label: field.label, decision: value ? 'autofill' : 'abstain', value: value, reason: value ? 'legacy_map' : 'legacy_blank' };
    });
    var values = {};
    candidate.forEach(function (row) {
      var take = paintMode === 'probe' ? (row.decision === 'autofill' || row.decision === 'review') : row.decision === 'autofill';
      if (take && row.value) values[row.fieldId] = row.value;
    });
    var painted = await paint(form.kind, form.bytes || formBytes, form.fields, values);
    var placed = await positions(painted);
    return {
      kind: form.kind,
      channel: spatial.channel,
      text: spatial.text,
      words: spatial.words,
      transform: spatial.transform,
      fields: form.fields.map(slimField),
      candidate: candidate,
      baseline: baseline,
      placed: placed,
      painted: Array.from(painted)
    };
  }

  global.FormBench = { run: run };
})(window);
