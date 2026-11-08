/* Source image, deskew, crop, sheet, and export, in one direction.
   Pixels are top-left, y down. A positive angle is the canvas clockwise
   turn used by the photo reader. The crop is applied after that turn.
   sourceW and sourceH, when present, are the oriented image pixels before
   the working-size reduction. A photo sheet’s angle is 0: the line score is
   not painted into those pixels. This does not detect lines and does not change a threshold. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FormFrame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function turnToInput(tx, ty, frame) {
    var angle = frame.angle || 0;
    if (!angle) return { x: tx, y: ty };
    var rad = angle * Math.PI / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    var dx = tx - frame.turnW / 2;
    var dy = ty - frame.turnH / 2;
    return {
      x: cos * dx + sin * dy + frame.inW / 2,
      y: -sin * dx + cos * dy + frame.inH / 2
    };
  }

  function sheetBoxToSource(box, frame, scaleX, scaleY) {
    var crop = frame.crop || { x: 0, y: 0 };
    var sx = scaleX == null ? (frame.sourceW && frame.inW ? frame.sourceW / frame.inW : 1) : scaleX;
    var sy = scaleY == null ? (frame.sourceH && frame.inH ? frame.sourceH / frame.inH : sx) : scaleY;
    var corners = [
      [box[0], box[1]],
      [box[2], box[1]],
      [box[2], box[3]],
      [box[0], box[3]]
    ];
    var xs = [];
    var ys = [];
    corners.forEach(function (corner) {
      var back = turnToInput(corner[0] + crop.x, corner[1] + crop.y, frame);
      xs.push(back.x * sx);
      ys.push(back.y * sy);
    });
    return [
      Math.min.apply(null, xs),
      Math.min.apply(null, ys),
      Math.max.apply(null, xs),
      Math.max.apply(null, ys)
    ];
  }

  function outputRectToSheet(field, frame) {
    var outW = frame.outW;
    var outH = frame.outH;
    var x = field.x / field.pw * outW;
    var w = field.w / field.pw * outW;
    var h = field.h / field.ph * outH;
    var y = (1 - (field.y + field.h) / field.ph) * outH;
    return [x, y, x + w, y + h];
  }

  /* Glyph ink is inside the writable box, expanded by the already stated
     rule-edge uncertainty. A point between two labels is not a hit. */
  function contained(ink, target, pad) {
    var slop = pad == null ? 8 : pad;
    return ink[0] >= target[0] - slop && ink[1] >= target[1] - slop
      && ink[2] <= target[2] + slop && ink[3] <= target[3] + slop;
  }

  return {
    turnToInput: turnToInput,
    sheetBoxToSource: sheetBoxToSource,
    outputRectToSheet: outputRectToSheet,
    contained: contained,
    PAD: 8
  };
});
