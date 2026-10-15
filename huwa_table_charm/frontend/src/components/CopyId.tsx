import { useState } from 'react';

interface Props {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  buttonClassName?: string;
}

export default function CopyId({ value, label, copiedLabel, className, buttonClassName }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <code className="font-mono text-xs text-stone-500 break-all select-all">{label ?? value}</code>
      <button
        type="button"
        onClick={copy}
        title={value ? 'Copy to clipboard' : undefined}
        className={`min-w-[3rem] px-2 py-1 rounded border text-xs font-medium transition cursor-pointer ${
          copied
            ? 'bg-teal-700 text-white border-teal-700'
            : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-100 active:bg-stone-200'
        } ${buttonClassName ?? ''}`}
      >
        {copied ? (copiedLabel ?? '✓ Copied') : '📋 Copy'}
      </button>
    </span>
  );
}
