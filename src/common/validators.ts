/** Shared patterns for DTOs. */
export const PHONE_PATTERN = /^(?=(?:\D*\d){7,15}\D*$)\+?[\d()\s-]{7,24}$/;
export const PHONE_MESSAGE = "must be a valid phone number";
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MESSAGE = "may only contain lowercase letters, numbers and hyphens";
