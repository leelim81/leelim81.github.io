/* Store-only ZIP. Enough for already-compressed PDFs and photos. */
(function (global) {
  var table = null;
  function crc32(bytes) {
    if (!table) {
      table = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function u16(view, o, v) { view.setUint16(o, v, true); }
  function u32(view, o, v) { view.setUint32(o, v, true); }
  function concat(parts) {
    var len = 0;
    parts.forEach(function (p) { len += p.length; });
    var out = new Uint8Array(len);
    var o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }
  function zipStore(files) {
    var now = new Date();
    var time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    var date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    var parts = [];
    var central = [];
    var offset = 0;
    files.forEach(function (file) {
      var name = new TextEncoder().encode(file.name);
      var data = file.bytes;
      var crc = crc32(data);
      var local = new DataView(new ArrayBuffer(30));
      u32(local, 0, 0x04034b50);
      u16(local, 4, 20);
      u16(local, 8, 0);
      u16(local, 10, time);
      u16(local, 12, date);
      u32(local, 14, crc);
      u32(local, 18, data.length);
      u32(local, 22, data.length);
      u16(local, 26, name.length);
      var cen = new DataView(new ArrayBuffer(46));
      u32(cen, 0, 0x02014b50);
      u16(cen, 4, 20);
      u16(cen, 6, 20);
      u16(cen, 10, 0);
      u16(cen, 12, time);
      u16(cen, 14, date);
      u32(cen, 16, crc);
      u32(cen, 20, data.length);
      u32(cen, 24, data.length);
      u16(cen, 28, name.length);
      u32(cen, 42, offset);
      parts.push(new Uint8Array(local.buffer), name, data);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var centralBytes = concat(central);
    var end = new DataView(new ArrayBuffer(22));
    u32(end, 0, 0x06054b50);
    u16(end, 8, files.length);
    u16(end, 10, files.length);
    u32(end, 12, centralBytes.length);
    u32(end, 16, offset);
    parts.push(centralBytes, new Uint8Array(end.buffer));
    return concat(parts);
  }
  global.DeskZip = { store: zipStore };
})(window);
