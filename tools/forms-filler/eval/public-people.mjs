/* Synthetic people already described in this repo. No real identity documents. */

export const people = [
  {
    id: 'alex',
    name: 'Alex Example',
    firstName: 'Alex',
    lastName: 'Example',
    nric: 'S1234567D',
    dob: '14/03/1992',
    dobCard: '14 MAR 1992',
    sex: 'Male',
    postal: '123456',
    blk: '10',
    street: 'EXAMPLE ROAD',
    unit: '04-12',
    phone: '+65 8123 4567',
    email: 'alex.example@example.com',
    race: 'Chinese'
  },
  {
    id: 'tan',
    name: 'TAN WEI MING',
    nric: 'S8523146D',
    dob: '15/01/1990',
    dobCard: '15 JAN 1990',
    sex: 'Male',
    postal: '018956',
    blk: '88',
    street: 'EXAMPLE WALK',
    unit: '12-34',
    nationality: 'Singapore Citizen'
  },
  {
    id: 'nurul',
    name: 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL',
    nric: 'S1234567D',
    dob: '15/01/1990',
    dobCard: '15 JAN 1990'
  }
];

/* Each mode gets the same facts, written in the shape that mode reads.
   A postal code is stated outright. It is not inferred from a stray number. */
export function photoText(person) {
  const lines = ['REPUBLIC OF SINGAPORE', 'IDENTITY CARD', 'Name', person.name, 'NRIC', person.nric];
  if (person.dobCard) lines.push('Date of birth', person.dobCard);
  if (person.sex) lines.push('Sex', person.sex === 'Male' ? 'M' : 'F');
  if (person.nationality) lines.push('Nationality', person.nationality);
  if (person.street) {
    lines.push('Address');
    lines.push((person.blk ? 'BLK ' + person.blk + ' ' : '') + person.street);
    if (person.unit) lines.push('#' + person.unit);
    if (person.postal) lines.push('SINGAPORE ' + person.postal);
  }
  return lines.join('\n');
}

export function typedText(person) {
  const lines = ['Applicant', 'Full name: ' + person.name, 'NRIC: ' + person.nric];
  if (person.firstName) lines.push('First name: ' + person.firstName);
  if (person.lastName) lines.push('Last name: ' + person.lastName);
  if (person.dob) lines.push('Date of birth: ' + person.dob);
  if (person.sex) lines.push('Sex: ' + (person.sex === 'Male' ? 'M' : 'F'));
  if (person.phone) lines.push('Phone: ' + person.phone);
  if (person.email) lines.push('Email: ' + person.email);
  if (person.blk && person.street && person.unit) {
    lines.push('Address: APT BLK ' + person.blk + ' ' + person.street + ' #' + person.unit);
  } else if (person.street) {
    lines.push('Address: ' + person.street);
  }
  if (person.postal) lines.push('Postal code: ' + person.postal);
  if (person.nationality) lines.push('Nationality: ' + person.nationality);
  if (person.race) lines.push('Race: ' + person.race);
  return lines.join('\n');
}
