import { Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { cn } from '@/lib/cn';
import { Input } from './input';

/** Password input with a show/hide toggle. The value is never altered. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const m = useMessages(common).actions;

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        className={cn('pr-10', className)}
        spellCheck={false}
        autoCapitalize="none"
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? m.hidePassword : m.showPassword}
        aria-pressed={visible}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-control text-subtle-foreground focus-ring transition-colors duration-150 hover:text-foreground disabled:pointer-events-none"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
