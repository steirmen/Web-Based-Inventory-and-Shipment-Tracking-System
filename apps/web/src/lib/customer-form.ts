import {
  type CreateCustomerRequest,
  type Customer,
  CUSTOMER_LIMITS,
  PHONE_PATTERN,
  type UpdateCustomerRequest,
} from '@app/shared';
import type { Translation } from '@/i18n/define';
import type { common } from '@/i18n/messages/common';
import type { sales } from '@/i18n/messages/sales';
import { type FieldErrors, validateEmail } from './auth-form';

/** Client-side checks for the customer form; the API remains authoritative. */

const L = CUSTOMER_LIMITS;

export interface CustomerFormValues {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export type CustomerField = keyof CustomerFormValues;

export const CUSTOMER_FIELDS: readonly CustomerField[] = [
  'name',
  'companyName',
  'email',
  'phone',
  'address',
  'notes',
];

const collapse = (value: string) => value.trim().replace(/\s+/g, ' ');

export function customerFormValues(customer: Customer | null): CustomerFormValues {
  return {
    name: customer?.name ?? '',
    companyName: customer?.companyName ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
    notes: customer?.notes ?? '',
  };
}

export function validateCustomer(
  values: CustomerFormValues,
  m: Translation<typeof sales.en>['customerForm'],
  auth: Translation<typeof common.en>['authValidation'],
): FieldErrors<CustomerField> {
  const tooLong = (value: string, max: number) =>
    value.trim().length > max ? m.tooLong({ max }) : undefined;
  const name = collapse(values.name);
  const email = values.email.trim();
  const phone = values.phone.trim();
  return {
    name: !name ? m.nameRequired : tooLong(name, L.nameMaxLength),
    companyName: tooLong(values.companyName, L.companyNameMaxLength),
    email: !email ? undefined : (tooLong(email, L.emailMaxLength) ?? validateEmail(email, auth)),
    phone: !phone
      ? undefined
      : (tooLong(phone, L.phoneMaxLength) ??
        (PHONE_PATTERN.test(phone) ? undefined : m.phonePattern)),
    address: tooLong(values.address, L.addressMaxLength),
    notes: tooLong(values.notes, L.notesMaxLength),
  };
}

/** Normalized like the server: whitespace collapsed, lower-case email, blanks → null. */
export function toCustomerRequest(values: CustomerFormValues): CreateCustomerRequest {
  return {
    name: collapse(values.name),
    companyName: collapse(values.companyName) || null,
    email: values.email.trim().toLowerCase() || null,
    phone: values.phone.trim() || null,
    address: values.address.trim() || null,
    notes: values.notes.trim() || null,
  };
}

/** Only the fields that changed. */
export function toUpdateCustomerRequest(
  customer: Customer,
  values: CustomerFormValues,
): UpdateCustomerRequest {
  const next = toCustomerRequest(values);
  const changes: UpdateCustomerRequest = {};
  for (const field of CUSTOMER_FIELDS) {
    if (next[field] !== customer[field]) Object.assign(changes, { [field]: next[field] });
  }
  return changes;
}
