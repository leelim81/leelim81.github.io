/** Sheet identity for blank maps. Old maps without a sheet stay exact-file maps. */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const maps = require('../../../tools/forms-filler/maps.js');

let failed = 0;
function check(name, ok) {
  if (!ok) failed++;
  console.log((ok ? 'ok ' : 'FAIL ') + name);
}

const sheet = {
  version: maps.SHEET_VERSION,
  sourceW: 3442, sourceH: 5601, inW: 983, inH: 1600, angle: 0,
  cropX: 16, cropY: 40, cropW: 913, cropH: 1516, outW: 913, outH: 1516
};
const page = {
  width: 595, height: 800, rotation: 0, userUnit: 1,
  cropX: 0, cropY: 0, cropWidth: 595, cropHeight: 800,
  slots: [{ key: 'name', role: 'applicant', x: 0.2, y: 0.2, w: 0.4, h: 0.05, fontSize: 14 }]
};

const saved = maps.saveMap(maps.empty(), {
  name: 'Food lines',
  fileSha256: 'a'.repeat(64),
  sheet: sheet,
  pages: [page],
  person: 'Ada Lane',
  profileId: 'secret',
  filename: 'wellcome-food-order.jpg',
  value: 'Ada Lane'
});
check('photo map saves', saved.ok);
check('map has the sheet version', saved.map.sheet.version === 1);
check('map keeps no person, profile, filename, or value', !JSON.stringify(saved.map).match(/Ada|secret|wellcome|profileId|filename/));
check('same sheet matches', maps.matchesSheet(saved.map.sheet, sheet));
check('changed crop is refused', !maps.matchesSheet(saved.map.sheet, Object.assign({}, sheet, { cropY: 41 })));
check('changed orientation is refused', !maps.matchesSheet(saved.map.sheet, Object.assign({}, sheet, { angle: 90 })));
check('changed output size is refused', !maps.matchesSheet(saved.map.sheet, Object.assign({}, sheet, { outW: 900 })));
check('another algorithm version is refused', !maps.matchesSheet(saved.map.sheet, Object.assign({}, sheet, { version: 2 })));
check('a missing live sheet is refused', !maps.matchesSheet(saved.map.sheet, null));

const legacy = maps.saveMap(maps.empty(), {
  name: 'Exact pdf',
  fileSha256: 'b'.repeat(64),
  pages: [page]
});
check('a pdf map without a sheet still saves', legacy.ok && !legacy.map.sheet);

const future = maps.migrate({
  schema: 1,
  maps: [{
    name: 'Later',
    fileSha256: 'c'.repeat(64),
    sheet: Object.assign({}, sheet, { version: 9 }),
    pages: [page]
  }]
});
check('a newer sheet version is kept and not applied as the current one', future.ok && future.vault.maps.length === 1 && !maps.matchesSheet(future.vault.maps[0].sheet, sheet));

const broken = maps.migrate({ schema: 2, maps: [] });
check('a newer map file is refused', !broken.ok && broken.reason === 'version');

const hostile = maps.mapOf ? null : null;
void hostile;
const dropped = maps.migrate({
  schema: 1,
  maps: [{ name: 'Bad', fileSha256: 'd'.repeat(64), sheet: { version: 1 }, pages: [page] }]
});
check('a partial sheet is not kept', dropped.ok && dropped.vault.maps.length === 0);

if (failed) process.exit(1);
console.log('map-sheet', failed, 'failed');
