/* Shared photo decode: extension or MIME, EXIF orientation, HEIC when possible. */
(function (global) {
  var IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i;

  function fileLabel(file) {
    var name = file && file.name ? String(file.name) : '';
    var slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
    if (slash >= 0) name = name.slice(slash + 1);
    name = name.trim();
    return name || 'photo';
  }
  function isImage(file) {
    if (!file) return false;
    var name = fileLabel(file);
    if (!name || name === '.' || name === '..') return false;
    var type = String(file.type || '').toLowerCase();
    if (type === 'image/svg+xml' || /\.svg$/i.test(name)) return false;
    if (type.indexOf('image/') === 0) return true;
    return IMAGE_EXT.test(name);
  }
  function isHeic(file) {
    var name = fileLabel(file).toLowerCase();
    return /\.heic$|\.heif$/.test(name) || /heic|heif/i.test(file.type || '');
  }
  function readOrientation(buffer) {
    try {
      var view = new DataView(buffer);
      if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
      var offset = 2;
      while (offset + 4 < view.byteLength) {
        var marker = view.getUint16(offset);
        if (marker === 0xffda || marker === 0xffd9) break;
        var size = view.getUint16(offset + 2);
        if (marker === 0xffe1 && offset + 10 < view.byteLength && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
          return tiffOrientation(view, offset + 10);
        }
        if (size < 2) break;
        offset += 2 + size;
      }
    } catch (e) {}
    return 1;
  }
  function tiffOrientation(view, tiff) {
    var le = view.getUint16(tiff) === 0x4949;
    function get16(o) { return view.getUint16(tiff + o, le); }
    function get32(o) { return view.getUint32(tiff + o, le); }
    if (get16(2) !== 42) return 1;
    var ifd = get32(4);
    if (tiff + ifd + 2 > view.byteLength) return 1;
    var count = get16(ifd);
    for (var i = 0; i < count; i++) {
      var entry = ifd + 2 + i * 12;
      if (tiff + entry + 10 > view.byteLength) break;
      if (get16(entry) === 0x0112) return get16(entry + 8);
    }
    return 1;
  }
  function jpegSize(buffer) {
    var view = new DataView(buffer);
    var offset = 2;
    while (offset + 9 < view.byteLength) {
      var marker = view.getUint16(offset);
      var size = view.getUint16(offset + 2);
      if (marker === 0xffc0 || marker === 0xffc1 || marker === 0xffc2) {
        return { w: view.getUint16(offset + 7), h: view.getUint16(offset + 5) };
      }
      if (marker === 0xffda || size < 2) break;
      offset += 2 + size;
    }
    return null;
  }
  function drawOriented(bitmap, orientation) {
    var w = bitmap.width, h = bitmap.height;
    var swap = orientation > 4;
    var canvas = document.createElement('canvas');
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    var ctx = canvas.getContext('2d');
    switch (orientation) {
      case 2: ctx.translate(canvas.width, 0); ctx.scale(-1, 1); break;
      case 3: ctx.translate(canvas.width, canvas.height); ctx.rotate(Math.PI); break;
      case 4: ctx.translate(0, canvas.height); ctx.scale(1, -1); break;
      case 5: ctx.rotate(Math.PI / 2); ctx.scale(1, -1); break;
      case 6: ctx.rotate(Math.PI / 2); ctx.translate(0, -h); break;
      case 7: ctx.rotate(Math.PI / 2); ctx.translate(w, -h); ctx.scale(-1, 1); break;
      case 8: ctx.rotate(-Math.PI / 2); ctx.translate(-w, 0); break;
      default: break;
    }
    ctx.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    return canvas;
  }
  function loadHeic() {
    if (window.heic2any) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('HEIC support could not be loaded')); };
      document.head.appendChild(s);
    });
  }
  function heicError(file) {
    var err = new Error(fileLabel(file) + ' is HEIC and this browser couldn’t decode it. Save it as JPG.');
    err.code = 'heic';
    return err;
  }
  async function decode(file) {
    var name = fileLabel(file).toLowerCase();
    var type = String(file.type || '').toLowerCase();
    var heic = isHeic(file);
    if (/\.jpe?g$/.test(name) || /jpe?g/.test(type)) {
      try {
        var buf = await file.arrayBuffer();
        var orientation = readOrientation(buf);
        var bmp = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' }));
        var stored = jpegSize(buf);
        var swap = orientation > 4;
        var stillRaw = stored && swap && bmp.width === stored.w && bmp.height === stored.h;
        return drawOriented(bmp, stillRaw ? orientation : 1);
      } catch (err) {}
    }
    try {
      var bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return drawOriented(bitmap, 1);
    } catch (err) {
      if (!heic) throw err;
    }
    try {
      await loadHeic();
      var converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      var blob = Array.isArray(converted) ? converted[0] : converted;
      return drawOriented(await createImageBitmap(blob), 1);
    } catch (err) {
      throw heicError(file);
    }
  }
  global.DeskImages = { isImage: isImage, fileLabel: fileLabel, isHeic: isHeic, decode: decode };
})(window);
