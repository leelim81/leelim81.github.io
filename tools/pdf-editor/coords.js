/* Visual fractions to PDF user space for marks a person placed.
   Scan line detection does not use this file.

   Ledger, scale 1, origin of the rendered view at the top left, y downward.
   The view is the CropBox. pdf-lib getSize() is the MediaBox and is not the view.
   Rotation is clockwise and must be 0, 90, 180, or 270. Viewport size swaps
   width and height at 90 and 270. A viewport point (vx, vy) maps to user space:
     0:   x = crop.x + vx                  y = crop.y + crop.height - vy
     90:  x = crop.x + vy                  y = crop.y + vx
     180: x = crop.x + crop.width - vx     y = crop.y + vy
     270: x = crop.x + crop.width - vy     y = crop.y + crop.height - vx
   pdf-lib then rotates type, rules, and images so they stay upright in that
   view: 0 → 0°, 90 → 90°, 180 → 180°, 270 → −90°. The text baseline stays
   0.85×fontSize below the top of the box and 1 unit in from the left, which
   is the upright export this desk already used.
   UserUnit must be a finite number in (0, 75000], and the file’s value must
   match what this pdf.js build reports. A missing UserUnit is 1. Zero or a
   negative value is refused even if the reader substitutes 1. This pdf.js
   build does not scale the viewport by UserUnit. pdf-lib draws in that same
   default user space, so the fraction lands on the click. A reader that
   honors UserUnit scales the whole page, including the new type.
   Anything else is unsupported and is not given a guessed point. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FormCoords = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function finite(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function normRotation(angle) {
    var n = finite(angle);
    if (n == null) return null;
    var r = ((n % 360) + 360) % 360;
    if (r === 0 || r === 90 || r === 180 || r === 270) return r;
    return null;
  }

  function viewSize(crop, rotation) {
    if (rotation === 90 || rotation === 270) return { width: crop.height, height: crop.width };
    return { width: crop.width, height: crop.height };
  }

  function fractionToPdf(fx, fy, crop, rotation) {
    var view = viewSize(crop, rotation);
    var vx = fx * view.width;
    var vy = fy * view.height;
    if (rotation === 90) return { x: crop.x + vy, y: crop.y + vx };
    if (rotation === 180) return { x: crop.x + crop.width - vx, y: crop.y + vy };
    if (rotation === 270) return { x: crop.x + crop.width - vy, y: crop.y + crop.height - vx };
    return { x: crop.x + vx, y: crop.y + crop.height - vy };
  }

  function axes(rotation) {
    if (rotation === 90) return { right: { x: 0, y: 1 }, down: { x: 1, y: 0 }, drawRotate: 90 };
    if (rotation === 180) return { right: { x: -1, y: 0 }, down: { x: 0, y: 1 }, drawRotate: 180 };
    if (rotation === 270) return { right: { x: 0, y: -1 }, down: { x: -1, y: 0 }, drawRotate: -90 };
    return { right: { x: 1, y: 0 }, down: { x: 0, y: -1 }, drawRotate: 0 };
  }

  function boxOf(ann, crop, rotation) {
    var view = viewSize(crop, rotation);
    var spot = axes(rotation);
    var bl = fractionToPdf(ann.x, ann.y + ann.h, crop, rotation);
    return {
      x: bl.x,
      y: bl.y,
      width: ann.w * view.width,
      height: ann.h * view.height,
      rotate: spot.drawRotate,
      right: spot.right,
      down: spot.down,
      view: view
    };
  }

  function textOrigin(ann, crop, rotation, size) {
    var spot = axes(rotation);
    var top = fractionToPdf(ann.x, ann.y, crop, rotation);
    var sink = (finite(size) || 16) * 0.85;
    return {
      x: top.x + spot.right.x * 1 + spot.down.x * sink,
      y: top.y + spot.right.y * 1 + spot.down.y * sink,
      rotate: spot.drawRotate,
      right: spot.right,
      down: spot.down,
      width: ann.w * viewSize(crop, rotation).width
    };
  }

  function fileUserUnit(libPage) {
    try {
      var found = null;
      libPage.node.entries().forEach(function (entry) {
        if (String(entry[0]) === '/UserUnit') found = entry[1];
      });
      if (!found) return 1;
      var n = typeof found.asNumber === 'function' ? found.asNumber() : Number(String(found));
      return isFinite(n) ? n : null;
    } catch (err) {
      return null;
    }
  }

  function frameOf(libPage, jsPage, extraRotation) {
    var media = libPage.getMediaBox();
    var crop = libPage.getCropBox();
    var fileAngle = 0;
    try { fileAngle = libPage.getRotation().angle || 0; }
    catch (err) { fileAngle = NaN; }
    var total = normRotation((finite(fileAngle) || 0) + (finite(extraRotation) || 0));
    if (finite(fileAngle) == null) total = null;
    var fromFile = fileUserUnit(libPage);
    var fromJs = jsPage && typeof jsPage.userUnit === 'number' && isFinite(jsPage.userUnit) ? jsPage.userUnit : null;
    var userUnit = null;
    if (fromFile != null && fromFile > 0 && fromFile <= 75000 && fromJs != null && Math.abs(fromFile - fromJs) <= 0.001) userUnit = fromFile;
    var reasons = [];
    if (total == null) reasons.push('rotation');
    if (!crop || finite(crop.x) == null || finite(crop.y) == null || !(crop.width > 0) || !(crop.height > 0)) reasons.push('crop');
    if (userUnit == null) reasons.push('scale');
    return {
      ok: reasons.length === 0,
      reasons: reasons,
      crop: crop,
      media: media,
      rotation: total,
      userUnit: userUnit
    };
  }

  return {
    normRotation: normRotation,
    viewSize: viewSize,
    fractionToPdf: fractionToPdf,
    boxOf: boxOf,
    textOrigin: textOrigin,
    frameOf: frameOf,
    fileUserUnit: fileUserUnit
  };
});
