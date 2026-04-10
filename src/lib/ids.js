const crypto = require('crypto');

function createPrefixedId(prefix) {
  return `${prefix}${crypto.randomBytes(6).toString('hex')}`;
}

function isTaskId(value) {
  return typeof value === 'string' && /^tsk_[a-f0-9]{12}$/.test(value);
}

function createRequestId() {
  return createPrefixedId('req_');
}

function createTaskId() {
  return createPrefixedId('tsk_');
}

module.exports = {
  createRequestId,
  createTaskId,
  isTaskId,
};
