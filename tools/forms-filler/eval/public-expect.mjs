/* What belongs in a field, from its label and the synthetic person.
   This does not call the filler and does not copy a run. */
import { people } from './public-people.mjs';

export { people };

function clean(text) {
  return String(text || '').replace(/\([^)]*\)/g, ' ').replace(/[:.*_/]+$/g, '').replace(/\s+/g, ' ').trim();
}

function blob(field) {
  return [field.label, field.group, field.section, field.heading].filter(Boolean).join('\n');
}

/* Another person, a signature, a bank-use box, or an account number stays empty. */
export function mustBeEmpty(field) {
  const label = String(field.label || '');
  const sec = [field.group, field.section, field.heading].filter(Boolean).join(' ');
  const all = label + '\n' + sec;
  if (/signature/i.test(all)) return 'signature';
  if (/for bank use|bank use only|for official use|official use only|office use only/i.test(all)) return 'bank-use';
  if (/account\s*(?:no\.?|number)\b|to be credited/i.test(label)) return 'account';
  const id = String(field.id || '').replace(/[_./]+/g, ' ');
  if (/\b(2nd|second|nominee|witness|nomination)\b/i.test(id)) return 'other-person';
  if (/\boffice\b|\bbusiness address\b/i.test(label)) return 'office';
  if (/\b(nominees?|witness(?:es)?|spouses?|guardians?|designees?|requesters?|siblings?|patients?|fathers?|mothers?|children|child|joint|preparers?|translators?)\b/i.test(label)) return 'other-person';
  if (/\bauth(?:orized|orised)?\s+rep/i.test(label)) return 'other-person';
  if (/\bemployers?\b/i.test(label)) return 'employer';
  if (/\bif\s+different\b/i.test(label)) return 'different-address';
  if (/\bprevious\b/i.test(label) && /\bname\b/i.test(label)) return 'previous-name';
  if (/\bfamily members\b/i.test(label)) return 'other-person';
  const sectionIsTitle = /beneficial owner|employer identification|payee code/i.test(sec);
  if (!sectionIsTitle && /\b(nominees?|witness(?:es)?|spouses?|guardians?|designees?|siblings?|patients?|fathers?|mothers?|children|child|joint|agents?)\b/i.test(sec)) return 'other-section';
  if (/\bemployers?\b/i.test(sec) && !/employer identification/i.test(sec)) return 'employer';
  return '';
}

export function isUsZip(field, fields) {
  const hint = [field.label, field.tooltip, field.name].filter(Boolean).join(' ');
  if (!/\bzip\b/i.test(hint) || /\bpost(?:al)?\s*code\b|\bpostal\b/i.test(hint)) return false;
  /* A box whose own label is Zip or Zip Code is a US ZIP, including ZIP Code 2. */
  if (/^(?:zip(?:\s+code)?)(?:\s+\d+)?$/i.test(clean(field.label))) return true;
  const len = Number(field.maxLen || field.maxLength) || (field.cells && field.cells.length) || 0;
  if (len === 5 || len === 9 || len === 10) return true;
  if (/\bzip\s*\+\s*4\b|\b5\s*-?\s*digits?\b/i.test(hint)) return true;
  let city = false;
  let state = false;
  (fields || []).forEach(function (other) {
    if (!other || other === field) return;
    if ((other.page || 0) !== (field.page || 0)) return;
    if (String(other.section || '') !== String(field.section || '')) return;
    if (String(other.group || '') !== String(field.group || '')) return;
    const s = clean(other.label).toLowerCase();
    if (/^(city(?: or town)?|town)$/.test(s)) city = true;
    if (/^(state(?: or province)?)$/.test(s)) state = true;
  });
  return city && state;
}

function postalLabel(field) {
  const s = clean(field.label).toLowerCase();
  return /^(?:postal(?: code)?|post\s*code|postcode)$/.test(s);
}

function addressLabel(field) {
  const s = clean(field.label).toLowerCase();
  if (/e-?mail|ip\b/.test(s)) return false;
  return /\baddress\b/.test(s) || /^(?:residential|present|permanent|mailing|current) address\b/.test(s);
}

export function addressLine(person, withSingapore) {
  if (!person.street) return '';
  const bits = [];
  if (person.blk) bits.push(person.blk);
  bits.push(person.street);
  if (person.unit) bits.push('#' + person.unit);
  if (withSingapore && person.postal) bits.push('SINGAPORE ' + person.postal);
  return bits.join(' ');
}

/* One answer per field and person. The input mode does not change it. */
export function expectValue(field, person, fields) {
  if (!field || !person || mustBeEmpty(field)) return { value: '', kind: '' };
  if (isUsZip(field, fields)) return { value: '', kind: 'zip' };
  const head = clean(field.label).toLowerCase();
  if (/\s\d+$/.test(head)) return { value: '', kind: '' };
  if (/bangla|chinese|中文/.test(head)) return { value: '', kind: '' };
  if (postalLabel(field)) {
    const peers = (fields || []).filter(function (other) {
      return postalLabel(other) && !mustBeEmpty(other) && !isUsZip(other, fields) && (other.page || 0) === (field.page || 0);
    });
    if (peers.length !== 1 || !person.postal) return { value: '', kind: '' };
    return { value: person.postal, kind: 'postal' };
  }
  if (addressLabel(field)) {
    const besideZip = (fields || []).some(function (other) {
      return other !== field && (other.page || 0) === (field.page || 0) && isUsZip(other, fields);
    });
    const line = addressLine(person, besideZip);
    return { value: line, kind: line ? 'address' : '' };
  }
  if (/\b(first|given)\b/.test(head) && /\bname\b/.test(head)) return { value: person.firstName || '', kind: person.firstName ? 'name' : '' };
  if (/\b(last|family|surname)\b/.test(head) && /\bname\b/.test(head)) return { value: person.lastName || '', kind: person.lastName ? 'name' : '' };
  if (/\bname\b/.test(head) && !/\b(user|college|company|bank)\b/.test(head)) return { value: person.name || '', kind: 'name' };
  if (/\bnric\b|\bfin\b/.test(head) && !/\bname\b/.test(head)) return { value: person.nric || '', kind: 'nric' };
  if (/date of birth|\bdob\b/.test(head)) return { value: person.dob || '', kind: 'dob' };
  if (/^(male|female)$/.test(head) && person.sex) {
    return { value: head === person.sex.toLowerCase() ? person.sex : '', kind: 'sex' };
  }
  if (/^(sex|gender)$/.test(head) && person.sex) return { value: person.sex, kind: 'sex' };
  if (/^nationality$/.test(head) && person.nationality) return { value: person.nationality, kind: 'name' };
  if (/^e-?mail\b/.test(head) && person.email) return { value: person.email, kind: 'email' };
  if (/^(?:phone|mobile|tel|handphone)(?: number| no\.?)?$/.test(head) && person.phone) return { value: person.phone, kind: 'phone' };
  return { value: '', kind: '' };
}

export function answersFor(formId, fields) {
  const out = {};
  people.forEach(function (person) {
    fields.forEach(function (field) {
      const answer = expectValue(field, person, fields);
      if (!answer.value) return;
      out[formId + '|' + field.id + '|' + person.id] = { value: answer.value, kind: answer.kind, label: field.label || '' };
    });
  });
  return out;
}

export function sameAnswer(kind, expected, actual, person) {
  const got = String(actual || '').trim();
  const want = String(expected || '').trim();
  if (!want) return !got;
  if (!got) return false;
  if (kind === 'postal') return got.replace(/\D/g, '') === want.replace(/\D/g, '');
  if (kind === 'nric') return got.replace(/\s/g, '').toUpperCase() === want.replace(/\s/g, '').toUpperCase();
  if (kind === 'email') return got.toLowerCase() === want.toLowerCase();
  if (kind === 'phone') return got.replace(/\D/g, '') === want.replace(/\D/g, '');
  if (kind === 'sex') {
    const g = got.toUpperCase();
    const w = want.toUpperCase();
    if (w === 'MALE') return g === 'M' || g === 'MALE';
    if (w === 'FEMALE') return g === 'F' || g === 'FEMALE';
    return g === w;
  }
  if (kind === 'dob') {
    const digits = got.replace(/\D/g, '');
    const wantDigits = want.replace(/\D/g, '');
    if (digits === wantDigits) return true;
    if (digits.length === 8 && wantDigits.length === 8) {
      const monthFirst = wantDigits.slice(2, 4) + wantDigits.slice(0, 2) + wantDigits.slice(4);
      const yearFirst = wantDigits.slice(4) + wantDigits.slice(2, 4) + wantDigits.slice(0, 2);
      return digits === monthFirst || digits === yearFirst;
    }
    return false;
  }
  if (kind === 'name') return got.replace(/\s+/g, ' ').trim().toUpperCase() === want.replace(/\s+/g, ' ').trim().toUpperCase();
  if (kind === 'address') {
    const n = got.replace(/\s+/g, ' ').trim().toUpperCase();
    if (!person.street || !n.includes(person.street.toUpperCase())) return false;
    const codes = got.match(/\d{6}/g) || [];
    if (person.postal && codes.some((code) => code !== person.postal)) return false;
    if (want.toUpperCase().includes('SINGAPORE') && (!n.includes('SINGAPORE') || !n.includes(person.postal))) return false;
    return true;
  }
  return got.replace(/\s+/g, ' ').trim().toUpperCase() === want.replace(/\s+/g, ' ').trim().toUpperCase();
}
