/* Text-layer types are the visual-gold-1 parser result.
   OCR types stay off: visual-e2e-1 calibration did not clear the budget.
   See research/forms-filler/SCORECARD.md. */
(function (root) {
  root.FormThresholds = {
    scorecard: 'visual-gold-1',
    autofill: {
      name: true,
      nric: true,
      dob: true,
      phone: true,
      email: true,
      address: true,
      postal: false,
      mailbox: false
    },
    ocrAutofill: {
      name: false,
      nric: false,
      dob: false,
      phone: false,
      email: false,
      address: false,
      postal: false,
      mailbox: false
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
