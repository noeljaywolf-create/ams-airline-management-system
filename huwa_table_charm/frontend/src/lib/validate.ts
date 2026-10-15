export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Please enter your email.';
  if (!EMAIL_RE.test(v)) return 'Please enter a valid email address.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Please enter your password.';
  if (value.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

export function validateName(value: string): string | null {
  if (!value.trim()) return 'Please enter your name.';
  return null;
}