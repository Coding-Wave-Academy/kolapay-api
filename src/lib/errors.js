// Every error the API sends has the same shape:
// { error: { code, message, details } }
// `message` is written for the end user, so apps can show it as-is.

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const fcfa = (n) => `${Number(n).toLocaleString('en-US')} FCFA`;

const errors = {
  missingApiKey: () => new ApiError(401, 'MISSING_API_KEY', 'This app has no API key. Add it to api.js.'),
  invalidApiKey: () => new ApiError(401, 'INVALID_API_KEY', 'This API key is not valid. Check api.js.'),
  missingToken: () => new ApiError(401, 'MISSING_TOKEN', 'Please log in first.'),
  sessionExpired: () => new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please log in again.'),
  accountNotFound: (accountId) =>
    new ApiError(404, 'ACCOUNT_NOT_FOUND', `No account found with ID ${accountId}.`, { accountId }),
  invalidPin: (attemptsLeft) =>
    new ApiError(401, 'INVALID_PIN',
      `Wrong PIN. ${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`, { attemptsLeft }),
  accountLocked: (unlocksAt, minutes) =>
    new ApiError(423, 'ACCOUNT_LOCKED',
      `Too many wrong PINs. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
      { unlocksAt }),
  validation: (field, message) => new ApiError(400, 'VALIDATION_ERROR', message, { field }),
  amountTooSmall: (min) => new ApiError(400, 'AMOUNT_TOO_SMALL', `The minimum transfer is ${fcfa(min)}.`, { min }),
  amountTooLarge: (max) => new ApiError(400, 'AMOUNT_TOO_LARGE', `The maximum transfer is ${fcfa(max)}.`, { max }),
  selfTransfer: () => new ApiError(400, 'SELF_TRANSFER', "You can't send money to your own account."),
  insufficientFunds: (total, balance) =>
    new ApiError(422, 'INSUFFICIENT_FUNDS',
      `You need ${fcfa(total - balance)} more. Your balance is ${fcfa(balance)}.`,
      { total, balance, needed: total - balance }),
  contactExists: (contactId) =>
    new ApiError(409, 'CONTACT_EXISTS', 'This person is already in your contacts.', { contactId }),
  notFound: (what = 'That page') => new ApiError(404, 'NOT_FOUND', `${what} was not found.`),
  forbidden: () => new ApiError(403, 'FORBIDDEN', 'You are not allowed to do this.'),
};

module.exports = { ApiError, errors, fcfa };
