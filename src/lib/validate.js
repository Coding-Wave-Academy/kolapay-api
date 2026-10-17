const { errors } = require('./errors');
const { MIN_TRANSFER, MAX_TRANSFER } = require('./fees');

// Accepts "kp-0042", " KP-0042 " etc. and returns "KP-0042".
function accountId(value, field = 'accountId') {
  if (typeof value !== 'string' || !/^KP-\d{4}$/i.test(value.trim())) {
    throw errors.validation(field, 'Account IDs look like KP-0042.');
  }
  return value.trim().toUpperCase();
}

function pin(value) {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) {
    throw errors.validation('pin', 'The PIN must be exactly 4 digits, sent as a string like "1234".');
  }
  return value;
}

// Money must be a whole number of FCFA. Strings like "5000" are refused on purpose:
// that is the "2500" + 500 trap, and the app should convert with Number() first.
function amount(value, field = 'amount') {
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    throw errors.validation(field, 'Amount must be a number, not text. Use Number() before sending.');
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw errors.validation(field, 'Amount must be a whole number of FCFA, like 5000.');
  }
  if (value < MIN_TRANSFER) throw errors.amountTooSmall(MIN_TRANSFER);
  if (value > MAX_TRANSFER) throw errors.amountTooLarge(MAX_TRANSFER);
  return value;
}

// For query strings, where everything arrives as text: "5000" is fine there.
function amountFromQuery(value) {
  if (value === undefined || value === '' || !/^\d+$/.test(String(value))) {
    throw errors.validation('amount', 'Add ?amount= with a whole number, like ?amount=5000.');
  }
  return amount(Number(value));
}

function text(value, field, { max = 140, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw errors.validation(field, `${field} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw errors.validation(field, `${field} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw errors.validation(field, `${field} is required.`);
  if (trimmed.length > max) throw errors.validation(field, `${field} must be ${max} characters or fewer.`);
  return trimmed;
}

module.exports = { accountId, pin, amount, amountFromQuery, text };
