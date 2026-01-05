"use client";

import { type ReactNode, useState } from "react";

type QuestionImageProps = {
  src?: string;
  alt?: string;
  className?: string;
  placeholderLabel?: string;
  placeholderClassName?: string;
  placeholderIcon?: ReactNode;
};

export default function QuestionImage({
  src,
  alt = "",
  className,
  placeholderLabel,
  placeholderClassName,
  placeholderIcon,
}: QuestionImageProps) {
  const [errorMap, setErrorMap] = useState<Record<string, boolean>>({});
  const hasError = Boolean(src && errorMap[src]);

  if (!src || hasError) {
    return (
      <div
        className={[
          className,
          "flex items-center justify-center rounded-xl border border-white/10",
          "bg-gradient-to-br from-white/10 via-white/5 to-transparent",
          "text-white/60",
          placeholderClassName,
        ].join(" ")}
      >
        <div className="flex flex-col items-center gap-1 text-center">
          {placeholderIcon ?? (
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <circle cx="9" cy="10" r="2" />
              <path d="M21 16l-5.5-5.5L6 20" />
            </svg>
          )}
          {placeholderLabel && (
            <span className="text-xs font-semibold">{placeholderLabel}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        if (!src) return;
        setErrorMap((prev) => (prev[src] ? prev : { ...prev, [src]: true }));
      }}
    />
  );
}
