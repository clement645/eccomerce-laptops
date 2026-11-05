'use client';

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const inputClass = (invalid: boolean) =>
  cn(
    'w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-subtle transition focus:outline-none focus:ring-4',
    invalid
      ? 'border-danger focus:border-danger focus:ring-red-100'
      : 'border-line focus:border-primary-400 focus:ring-primary-100',
  );

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

function FieldShell({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-danger"
        >
          <AlertCircle aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField(
  { label, error, hint, className, ...props },
  ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputClass(Boolean(error)), className)}
        {...props}
      />
    </FieldShell>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, FieldProps>(function PasswordField(
  { label, error, hint, ...props },
  ref,
) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(inputClass(Boolean(error)), 'pr-11')}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-subtle hover:text-ink"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>
    </FieldShell>
  );
});

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: readonly string[];
  placeholder?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, error, options, placeholder, ...props },
  ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error}>
      <select
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass(Boolean(error))}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }
>(function Checkbox({ label, ...props }, ref) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-muted">
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 rounded border-line accent-primary-600"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
});

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ label, error, hint, id, className, ...props }, ref) {
    const generated = useId();
    const fieldId = id ?? generated;
    return (
      <FieldShell id={fieldId} label={label} error={error} hint={hint}>
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(inputClass(Boolean(error)), 'min-h-28 resize-y', className)}
          {...props}
        />
      </FieldShell>
    );
  },
);

export function SubmitButton({
  pending,
  children,
  className,
}: {
  pending: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        'inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-button transition hover:bg-primary-700 disabled:cursor-wait disabled:opacity-70',
        className,
      )}
    >
      {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function FormAlert({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  if (!children) return null;
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm',
        tone === 'error' && 'bg-red-50 text-red-800',
        tone === 'success' && 'bg-emerald-50 text-emerald-800',
        tone === 'info' && 'bg-primary-50 text-primary-800',
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
