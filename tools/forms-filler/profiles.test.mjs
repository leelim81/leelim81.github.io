import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const P = require('./profiles.js');

const one = P.ingest(P.empty(), {
  facts: [
    { kind: 'name', role: 'applicant', value: 'Ada Example', quote: 'Full name: Ada Example' },
    { kind: 'email', role: 'applicant', value: 'ada@example.com', quote: 'Email: ada@example.com' },
    { kind: 'dob', role: 'patient', value: '01/01/1980', quote: 'Date of birth: 01/01/1980' }
  ]
});
assert.equal(one.profileId.length > 0, true);
const ada = one.vault.profiles[0];
assert.equal(ada.name, 'Ada Example');
assert.equal(ada.facts.filter((f) => f.key === 'email')[0].status, 'unconfirmed');
assert.equal(ada.facts.some((f) => f.value === '01/01/1980'), false);
assert.equal(one.vault.pending.some((row) => row.reason === 'other-person'), true);

const confirmed = P.confirmFact(one.vault, ada.id, 'email', 'ada.fixed@example.com');
assert.equal(confirmed.ok, true);
const again = P.ingest(confirmed.vault, {
  facts: [
    { kind: 'name', role: 'applicant', value: 'Ada Example', quote: 'Full name: Ada Example' },
    { kind: 'email', role: 'applicant', value: 'ada.ocr@example.com', quote: 'Email: ada.ocr@example.com' }
  ]
});
const email = again.vault.profiles[0].facts.filter((f) => f.key === 'email')[0];
assert.equal(email.value, 'ada.fixed@example.com');
assert.equal(email.status, 'confirmed');

const conflict = P.ingest(P.empty(), {
  facts: [
    { kind: 'name', role: 'applicant', value: 'Ada Example', quote: 'a' },
    { kind: 'name', role: 'applicant', value: 'Nia Example', quote: 'b' },
    { kind: 'email', role: 'applicant', value: 'ada@example.com', quote: 'e' }
  ]
});
assert.equal(conflict.profileId, '');
assert.equal(conflict.vault.profiles.length, 0);
assert.ok(conflict.vault.pending.length >= 2);
assert.ok(conflict.vault.pending.every((row) => row.quote));

const spouse = P.ingest(P.empty(), {
  facts: [
    { kind: 'name', role: 'applicant', value: 'Ulf Sample', quote: 'Full name: Ulf Sample' },
    { kind: 'phone', role: 'other', value: '+65 80000099', quote: 'Phone: +65 80000099' }
  ]
});
assert.equal(spouse.vault.profiles[0].facts.some((fact) => fact.value === '+65 80000099'), false);
assert.equal(spouse.vault.pending.some((row) => row.reason === 'other-person' && row.role === 'other'), true);

const echo = P.noteFieldEdit(confirmed.vault, {
  profileId: ada.id, key: 'email', value: 'ada.fixed@example.com', seed: 'ada.fixed@example.com'
});
assert.equal(echo.changed, false);
const edited = P.noteFieldEdit(confirmed.vault, {
  profileId: ada.id, key: 'email', value: 'ada.typed@example.com', seed: 'ada.fixed@example.com'
});
assert.equal(edited.ok, true);
assert.equal(edited.vault.profiles[0].facts.filter((f) => f.key === 'email')[0].origin, 'pdf-field');
const sign = P.noteFieldEdit(confirmed.vault, { profileId: ada.id, key: 'name', value: 'Ink', seed: '', kind: 'signature' });
assert.equal(sign.reason, 'not-a-fact');
const loose = P.noteFieldEdit(confirmed.vault, { value: '42', seed: '' });
assert.equal(loose.reason, 'needs-mapping');

const custom = P.addCustom(confirmed.vault, ada.id, 'Desk code', '42');
assert.equal(custom.ok, true);
assert.equal(custom.vault.profiles[0].facts.some((f) => f.key === 'custom' && f.label === 'Desk code'), true);

const bundle = P.exportBundle(edited.vault);
assert.equal(bundle.kind, 'forms-filler-profiles');
assert.equal(bundle.profiles[0].facts.every((f) => f.status === 'confirmed'), true);
assert.equal(JSON.stringify(bundle).includes('01/01/1980'), false);

assert.equal(P.importBundle('{').reason, 'malformed');
assert.equal(P.importBundle({ kind: 'forms-filler-profiles', schema: 1, profiles: [{ name: 'A', facts: [{ key: '__proto__', label: 'x', value: 'y', status: 'confirmed' }] }] }).reason, 'hostile');
assert.equal(P.importBundle({ kind: 'nope', schema: 1, profiles: [] }).reason, 'schema');
const hostile = P.importBundle({ kind: 'forms-filler-profiles', schema: 1, profiles: [{ name: 'A', facts: [{ key: 'email', label: 'Email', value: 'a@example.com', status: 'unconfirmed' }] }] });
assert.equal(hostile.reason, 'unconfirmed');
const okImport = P.importBundle(JSON.stringify(bundle));
assert.equal(okImport.ok, true);
assert.equal(okImport.vault.profiles[0].facts[0].status, 'confirmed');

const migrated = P.migrate({ schema: 0, entries: [{ person: 'Bea Example', key: 'phone', value: '80000000', corrected: true }] });
assert.equal(migrated.schema, 1);
assert.equal(migrated.profiles[0].facts[0].status, 'confirmed');

const removed = P.deleteFact(custom.vault, ada.id, custom.vault.profiles[0].facts.filter((f) => f.label === 'Desk code')[0].id);
assert.equal(removed.vault.profiles[0].facts.some((f) => f.label === 'Desk code'), false);
const gone = P.deleteProfile(removed.vault, ada.id);
assert.equal(gone.vault.profiles.length, 0);

console.log('profiles tests ok');
