import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { decimalSeparator, parseNum } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface NumberInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'min' | 'max'> {
  readonly value: number | null;
  /** Called with every valid value while typing (null when cleared, if `allowEmpty`). */
  readonly onValue: (v: number | null) => void;
  readonly min?: number;
  readonly max?: number;
  readonly allowEmpty?: boolean;
  readonly digits?: number;
}

/**
 * Text field for numbers: keeps what the user types (partial input, decimal comma), commits only
 * valid values and flags invalid ones. Follows external value changes when not focused.
 */
export function NumberInput({ value, onValue, min, max, allowEmpty, digits = 2, className, onFocus, onBlur, ...rest }: NumberInputProps) {
  const show = (v: number | null) =>
    v == null ? '' : String(Math.round(v * 10 ** digits) / 10 ** digits).replace('.', decimalSeparator());
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const v = parseNum(text);
  const invalid = text.trim() === '' ? !allowEmpty : v == null || (min != null && v < min) || (max != null && v > max);
  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      value={text}
      aria-invalid={invalid || undefined}
      className={cn('font-mono', className)}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = parseNum(t);
        if (t.trim() === '' && allowEmpty) onValue(null);
        else if (n != null && (min == null || n >= min) && (max == null || n <= max)) onValue(n);
      }}
      {...rest}
    />
  );
}
