export type PasswordStrength = {
  score:    number;
  label:    "Zwak" | "Matig" | "Medium" | "Sterk";
  isMedium: boolean;
};

export const MIN_PASSWORD_LENGTH = 8;

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const hasLength = password.length >= MIN_PASSWORD_LENGTH;
  const hasLongLength = password.length >= 12;
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const score = [
    hasLength,
    hasMixedCase,
    hasDigit,
    hasSymbol,
    hasLongLength,
  ].filter(Boolean).length;

  const label =
    score >= 4 ? "Sterk" :
    score >= 3 ? "Medium" :
    score >= 2 ? "Matig" :
    "Zwak";

  return {
    score,
    label,
    isMedium: hasLength && score >= 3,
  };
}

export function mediumPasswordMessage(): string {
  return "Gebruik minimaal 8 tekens en combineer hoofdletters, kleine letters, cijfers of symbolen.";
}