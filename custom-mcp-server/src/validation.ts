export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateEmail(email: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError(`Invalid email: ${email}`);
  }
}

export function validateDate(dateStr: string): void {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new ValidationError(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new ValidationError(`Invalid date: ${dateStr}`);
  }
}

export function validateFutureDate(dateStr: string): void {
  validateDate(dateStr);
  const date = new Date(dateStr);
  const now = new Date();
  if (date <= now) {
    throw new ValidationError(`Date must be in the future: ${dateStr}`);
  }
}

export function validateAge(age: number): void {
  if (age < 1 || age > 150 || !Number.isInteger(age)) {
    throw new ValidationError(`Invalid age: ${age}. Must be between 1 and 150`);
  }
}

export function validateDistance(distance: number): void {
  if (distance <= 0) {
    throw new ValidationError(`Invalid distance: ${distance}. Must be greater than 0`);
  }
}

export function validateUUID(id: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new ValidationError(`Invalid UUID: ${id}`);
  }
}

export function validateStatus(status: string): void {
  const validStatuses = ['registered', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }
}
