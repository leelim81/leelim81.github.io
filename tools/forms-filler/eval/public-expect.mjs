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
  if (/\b(nominees?|witness(?:es)?|spouses?|guardians?|designees?|requesters?|siblings?|patients?|fathers?|mothers?|children|child|joint|preparers?|translators?|dependants?|dependents?|unions?|pharmacies|pharmacy|schools?|doctors?|payees?|solicitors?|executors?|trustees?|delegates?|deceased)\b/i.test(label)) return 'other-person';
  if (/\bemergency\s+contact\b|\bnext\s+of\s+kin\b|\bcare\s+of\b|\bauthoris(?:e|z)d\s+officer\b|\bresponsible\s+party\b|\bsurviving\b/i.test(label)) return 'other-person';
  if (/\b(dependants?|dependents?|unions?|pharmacies|pharmacy|schools?|emergency|nominee|witness|spouse|guardian|deceased|payee|doctor|solicitor)\b/i.test(id)) return 'other-person';
  if (/\bauth(?:orized|orised)?\s+rep/i.test(label)) return 'other-person';
  if (/\bemployers?\b/i.test(label)) return 'employer';
  if (/\bif\s+different\b/i.test(label)) return 'different-address';
  if (/\bprevious\b/i.test(label) && /\bname\b/i.test(label)) return 'previous-name';
  if (/\bfamily members\b/i.test(label)) return 'other-person';
  const sectionIsTitle = /beneficial owner|employer identification|payee code/i.test(sec);
  if (!sectionIsTitle && /\b(nominees?|witness(?:es)?|spouses?|guardians?|designees?|siblings?|patients?|fathers?|mothers?|children|child|joint|agents?|dependants?|dependents?|pharmacies|pharmacy|schools?|unions?|doctors?|solicitors?|deceased)\b/i.test(sec)) return 'other-section';
  if (/\bgp\b/i.test(sec) && /\b(surgery|practice)\b/i.test(sec)) return 'other-section';
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

/* Fields kept after reading the PDF line around the box. A generic label such as
   "Name", "Address", "NRIC No", or "Male" is the filer only when that line says so.
   Anything not listed here is empty: the reader often attaches the wrong heading. */
const kept = {
  'dev-group-hospitalisation|name_of_member_claimant': ['name', 'Particulars of Member', 'Member who is the claimant'],
  'dev-group-hospitalisation|particulars_of_member_nric_no': ['nric', 'Particulars of Member', 'Member NRIC'],
  'dev-group-hospitalisation|gender_male': ['male', 'Particulars of Member', 'Member gender, the Male box under Particulars of Member'],
  'dev-group-hospitalisation|particulars_of_member_date_of_birth_dd_mm_': ['dob', 'Particulars of Member', 'Member date of birth'],
  'dev-group-hospitalisation|address_of_member': ['address', 'Particulars of Member', 'Address of Member'],
  'dev-group-hospitalisation|particulars_of_member_email': ['email', 'Particulars of Member', 'Member email'],
  'dev-pubeu-membership|name': ['name', 'Application for Membership', 'Applicant name'],
  'dev-pubeu-membership|nric_no': ['nric', 'Application for Membership', 'Applicant NRIC'],
  'dev-pubeu-membership|date_of_birth': ['dob', 'Application for Membership', 'Applicant date of birth'],
  'dev-pubeu-membership|address': ['address', 'Application for Membership', 'Applicant address'],
  'dev-pubeu-membership|postal_code': ['postal', 'Application for Membership', 'Applicant postal code'],
  'dev-irs-w4|topmostSubform[0].Page1[0].Step1a[0].f1_01[0]': ['first', 'Step 1 Employee', 'Employee first name'],
  'dev-irs-w4|topmostSubform[0].Page1[0].Step1a[0].f1_02[0]': ['last', 'Step 1 Employee', 'Employee last name'],
  'dev-irs-w4|topmostSubform[0].Page1[0].Step1a[0].f1_03[0]': ['address', 'Step 1 Employee', 'Employee home address'],
  'dev-irs-w9|topmostSubform[0].Page1[0].f1_01[0]': ['name', 'Line 1', 'Name of the person on line 1'],
  'dev-irs-w9|topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]': ['address', 'Line 5', 'Street address of the person on line 1'],
  'dev-uscis-i9|First Name Given Name': ['first', 'Section 1. Employee Information', 'Employee first name'],
  'dev-uscis-i9|Last Name (Family Name)': ['last', 'Section 1. Employee Information', 'Employee last name'],
  'dev-uscis-i9|Date of Birth mmddyyyy': ['dob', 'Section 1. Employee Information', 'Employee date of birth'],
  'dev-uscis-i9|Address Street Number and Name': ['address', 'Section 1. Employee Information', 'Employee street address. The ZIP box stays empty'],
  'heldout-irs-w8ben|topmostSubform[0].Page1[0].f_1[0]': ['name', 'Line 1 beneficial owner', 'The individual beneficial owner is the filer'],
  'heldout-irs-w8ben|topmostSubform[0].Page1[0].f_3[0]': ['address', 'Line 3 permanent residence', 'Permanent residence of the beneficial owner'],
  'heldout-irs-w8ben|topmostSubform[0].Page1[0].f_12[0]': ['dob', 'Line 8', 'Date of birth of the beneficial owner'],
  'heldout-irs-ss4|topmostSubform[0].Page1[0].f1_2[0]': ['name', 'Line 1', 'Legal name of the individual the EIN is for'],
  'heldout-irs-ss4|topmostSubform[0].Page1[0].Line4ReadOrder[0].f1_5[0]': ['address', 'Line 4a', 'Mailing address of the person on line 1'],
  'heldout-irs-w7|topmostSubform[0].Page1[0].f1_13[0]': ['address', 'Line 2 Applicant mailing', 'Applicant mailing address'],
  'heldout-irs-w7|topmostSubform[0].Page1[0].f1_15[0]': ['address', 'Line 3 Foreign address', 'Applicant foreign address'],
  'heldout-irs-w7|topmostSubform[0].Page1[0].Line4_ReadOrder[0].f1_17[0]': ['dob', 'Line 4', 'Applicant date of birth'],
  'heldout-irs-w7|topmostSubform[0].Page1[0].c1_10[1]': ['male', 'Line 5', 'Applicant sex, the Male box'],
  'heldout-irs-w7|topmostSubform[0].Page1[0].f1_40[0]': ['phone', 'Applicant signature block', 'Applicant phone above the delegate line'],
  'heldout-sg-childbirth|member_s_particulars_full_name_in_block_le': ['name', "MEMBER'S PARTICULARS", 'Member name'],
  'heldout-sg-childbirth|member_s_particulars_nric_no': ['nric', "MEMBER'S PARTICULARS", 'Member NRIC'],
  'heldout-sg-childbirth|member_s_particulars_address': ['address', "MEMBER'S PARTICULARS", 'Member address'],
  'heldout-sg-marriage|member_s_particulars_full_name_in_block_le': ['name', "MEMBER'S PARTICULARS", 'Member name'],
  'heldout-sg-marriage|member_s_particulars_nric_no': ['nric', "MEMBER'S PARTICULARS", 'Member NRIC'],
  'heldout-sg-marriage|member_s_particulars_address': ['address', "MEMBER'S PARTICULARS", 'Member address'],
  'heldout-sg-hdbsu-hosp|member_s_particulars_full_name_in_block_le': ['name', "MEMBER'S PARTICULARS", 'Member name'],
  'heldout-sg-hdbsu-hosp|member_s_particulars_nric_no': ['nric', "MEMBER'S PARTICULARS", 'Member NRIC'],
  'heldout-sg-hdbsu-hosp|member_s_particulars_address': ['address', "MEMBER'S PARTICULARS", 'Member address'],
  'heldout-sg-gift-tpd|gender_male': ['male', 'Information on member', 'Member gender'],
  'heldout-sg-gift-tpd|dear_claimant_full_name_of_member_as_shown': ['name', 'Information on member', 'Member name on a disability claim the member makes'],
  'heldout-sg-gift-tpd|information_on_member_nric_passport_or_fin': ['nric', 'Information on member', 'Member NRIC'],
  'heldout-sg-gift-tpd|information_on_member_nationality': ['nationality', 'Information on member', 'Member nationality'],
  'heldout-sg-gift-tpd|dear_claimant_mailing_address': ['address', 'Information on member', 'Member mailing address'],
  'heldout-sg-gift-tpd|information_on_member_email': ['email', 'Information on member', 'Member email'],
  'sc|present_address': ['address', 'Contact Information', 'Applicant present address'],
  'sc|post_code': ['postal', 'Contact Information', 'Post code under the applicant present address'],
  'sc|applicant_s_personal_information_name_of_a_18': ['name', "Applicant's Personal Information", 'Accountholder name in English'],
  'sc|applicant_s_personal_information_date_of_b': ['dob', "Applicant's Personal Information", 'Applicant date of birth'],
  'sc|applicant_s_personal_information_gender': ['sex', "Applicant's Personal Information", 'Applicant gender'],
  'ocbc|name': ['name', 'Personal particulars of main account holder', 'Main account holder name'],
  'ocbc|nationality': ['nationality', 'Personal particulars of main account holder', 'Main account holder nationality'],
  'ocbc|postal_code': ['postal', 'Personal particulars of main account holder', 'Postal code beside the main account holder address'],
  'ocbc|name_to_appear_on_card': ['name', 'Debit card', 'Name on the applicant card, same person as the identity document'],
  'prudential|nric_no': ['nric', "Life Assured's particulars", 'Life assured NRIC. The section is completed by the adult life assured'],
  'prudential|address': ['address', "Life Assured's particulars", 'Life assured address'],
  'prudential|postal_code': ['postal', "Life Assured's particulars", 'Life assured postal code'],
  'uob|name_as_in_nric_passport': ['name', 'Section 1: Your particulars', 'Applicant name'],
  'uob|nric_passport_number': ['nric', 'Section 1: Your particulars', 'Applicant NRIC'],
  'uob|nric_passport_number_5': ['nric', 'Section 1: Your particulars', 'Applicant NRIC'],
  'uob|email_address': ['email', 'Section 1: Your particulars', 'Applicant email'],
  'dbs-india|1st_applicant_minor_e_mail': ['email', '1st Applicant', 'Email beside the 1st applicant marital status'],
  'dbs-india|1st_applicant_name': ['name', '1st Applicant debit card', 'Name on the 1st applicant debit card'],
  'uk-gp|what_male': ['male', 'Patient registration', 'Patient sex, the line that asks your sex'],
  'uk-gp|gp_email': ['email', 'Patient contact', 'Item 18, the patient email. The GP heading above it is the surgery, not this line'],
  'hsbc|Last Name/Surname': ['last', 'My Personal Details', 'Customer last name'],
  'hsbc|First/Given Name': ['first', 'My Personal Details', 'Customer first name'],
  'hsbc|Email Address': ['email', 'My Personal Details', 'Customer email'],
  'dbs-hk|selected_language_male_m': ['male', 'Personal Data of Sole/Principal Applicant', 'Gender Male (M)'],
  'dbs-hk|gender_male_m': ['male', 'Personal Data of Sole/Principal Applicant', 'Gender Male (M)'],
  'dbs-hk|personal_data_of_sole_principal_applicant__4': ['nationality', 'Personal Data of Sole/Principal Applicant', 'Applicant nationality'],
  'dbs-hk|nationality': ['nationality', 'Personal Data of Sole/Principal Applicant', 'Applicant nationality'],
  'dbs-hk|personal_data_of_sole_principal_applicant__5': ['dob', 'Personal Data of Sole/Principal Applicant', 'Applicant date of birth'],
  'dbs-hk|date_of_birth': ['dob', 'Personal Data of Sole/Principal Applicant', 'Applicant date of birth'],
  'dbs-hk|personal_data_of_sole_principal_applicant__6': ['address', 'Personal Data of Sole/Principal Applicant', 'Applicant residential address'],
  'dbs-hk|residential_address': ['address', 'Personal Data of Sole/Principal Applicant', 'Applicant residential address'],
  'dbs-hk|email_address': ['email', 'Contact Information', 'Applicant email'],
  'dbs-hk|customer_name': ['name', 'Phone banking customer, line 1', 'Applicant name on phone banking line 1. The account number stays empty']
};

function keptValue(slot, person, field, fields) {
  if (slot === 'name') return person.name ? { value: person.name, kind: 'name' } : { value: '', kind: '' };
  if (slot === 'first') return person.firstName ? { value: person.firstName, kind: 'name' } : { value: '', kind: '' };
  if (slot === 'last') return person.lastName ? { value: person.lastName, kind: 'name' } : { value: '', kind: '' };
  if (slot === 'nric') return person.nric ? { value: person.nric, kind: 'nric' } : { value: '', kind: '' };
  if (slot === 'dob') return person.dob ? { value: person.dob, kind: 'dob' } : { value: '', kind: '' };
  if (slot === 'email') return person.email ? { value: person.email, kind: 'email' } : { value: '', kind: '' };
  if (slot === 'phone') return person.phone ? { value: person.phone, kind: 'phone' } : { value: '', kind: '' };
  if (slot === 'postal') return person.postal ? { value: person.postal, kind: 'postal' } : { value: '', kind: '' };
  if (slot === 'nationality') return person.nationality ? { value: person.nationality, kind: 'name' } : { value: '', kind: '' };
  if (slot === 'sex') return person.sex ? { value: person.sex, kind: 'sex' } : { value: '', kind: '' };
  if (slot === 'male') return person.sex === 'Male' ? { value: 'Male', kind: 'sex' } : { value: '', kind: '' };
  if (slot === 'address') {
    const besideZip = (fields || []).some(function (other) {
      return other !== field && (other.page || 0) === (field.page || 0) && isUsZip(other, fields);
    });
    const line = addressLine(person, besideZip);
    return { value: line, kind: line ? 'address' : '' };
  }
  return { value: '', kind: '' };
}

/* One answer per field and person. The input mode does not change it.
   Passing formId uses the audited list. Without it, the label rules below
   still apply, for the small unit checks. */
export function expectValue(field, person, fields, formId) {
  if (!field || !person || mustBeEmpty(field)) return { value: '', kind: '', section: '', why: '' };
  if (formId) {
    const row = kept[formId + '|' + field.id];
    if (!row) return { value: '', kind: '', section: '', why: '' };
    const answer = keptValue(row[0], person, field, fields);
    return { value: answer.value, kind: answer.kind, section: row[1], why: row[2] };
  }
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
      const answer = expectValue(field, person, fields, formId);
      if (!answer.value) return;
      out[formId + '|' + field.id + '|' + person.id] = {
        value: answer.value,
        kind: answer.kind,
        label: field.label || '',
        section: answer.section || '',
        why: answer.why || ''
      };
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
