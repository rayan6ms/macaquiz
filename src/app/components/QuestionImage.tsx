"use client";

import { useState } from "react";

type QuestionImageProps = {
  src?: string;
  alt?: string;
  className?: string;
};

export default function QuestionImage({
  src,
  alt = "",
  className,
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
        ].join(" ")}
      >
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
