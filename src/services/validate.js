import { ValidationError } from './errors.js';

export function text(value, { field, min = 1, max = 200, optional = false }) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (optional && trimmed === '') return '';
  if (trimmed.length < min || trimmed.length > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max} characters.`, 'InvalidField');
  }
  return trimmed;
}

export function integer(value, { field, min, max }) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ValidationError(`${field} must be a whole number from ${min} to ${max}.`, 'InvalidField');
  }
  return number;
}

export function id(value, field = 'Id') {
  return integer(value, { field, min: 1, max: 2_147_483_647 });
}

export function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}.`, 'InvalidField');
  }
  return value;
}

export function date(value, field) {
  const parsed = typeof value === 'string' || value instanceof Date ? new Date(value) : new Date(NaN);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${field} must be a valid date and time.`, 'InvalidField');
  }
  return parsed;
}
