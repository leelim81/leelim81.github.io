(function () {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var bytes = null;
  var fileName = '';

  function isPdf(file) {
    return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  }

  async function useFile(file) {
    document.getElementById('sizeOptions').innerHTML = '';
    if (!isPdf(file)) {
      ToolsUI.toast('Choose a PDF file.');
      return;
    }
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length < 5 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '%PDF') {
        throw new Error('not pdf');
      }
    } catch (err) {
      ToolsUI.toast('That file could not be read as a PDF.');
      return;
    }
    fileName = file.name || 'document.pdf';
    document.getElementById('fileName').textContent = fileName;
    document.getElementById('origSize').textContent = PdfCompress.formatMB(bytes.byteLength);
    document.getElementById('drop').hidden = true;
    document.getElementById('result').hidden = false;
    var stem = fileName.replace(/\.pdf$/i, '');
    var source = bytes;
    PdfSizes.mount(document.getElementById('sizeOptions'), {
      getBytes: async function () { return source.slice(0); },
      baselineSize: source.byteLength,
      baselineLabel: 'original',
      nameFor: function (level) { return stem + '-' + level + '.pdf'; }
    });
  }

  document.getElementById('drop').addEventListener('click', function () {
    document.getElementById('fileInput').click();
  });
  document.getElementById('replace').addEventListener('click', function () {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', function () {
    var file = document.getElementById('fileInput').files[0];
    document.getElementById('fileInput').value = '';
    if (file) useFile(file);
  });

  ['dragenter', 'dragover'].forEach(function (name) {
    document.addEventListener(name, function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
      document.getElementById('drop').classList.add('hot');
    });
  });
  document.addEventListener('dragleave', function () {
    document.getElementById('drop').classList.remove('hot');
  });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    document.getElementById('drop').classList.remove('hot');
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) useFile(file);
  });
})();
