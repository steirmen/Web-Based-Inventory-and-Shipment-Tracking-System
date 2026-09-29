import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';
import { Label } from './label';

/** Accessibility props to spread onto the field's control. */
export interface FieldControlProps {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

export interface FormFieldProps {
  label: string;
  /** Validation message. Replaces the hint and marks the control invalid. */
  error?: string;
  hint?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + control + hint/error, wired together for assistive technology.
 *
 *   <FormField label="Email" error={errors.email}>
 *     {(control) => <Input {...control} type="email" />}
 *   </FormField>
 */
export function FormField({ label, error, hint, className, children }: FormFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': message ? messageId : undefined,
      })}
      {message && (
        <p
          id={messageId}
          className={cn('text-xs', error ? 'text-danger' : 'text-muted-foreground')}
        >
          {message}
        </p>
      )}
    </div>
  );
}
