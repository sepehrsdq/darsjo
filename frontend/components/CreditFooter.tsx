"use client";

/**
 * A deliberately tiny signature: a soft heart beat and a slow terminal caret.
 * No tooltip, no icon, no extra chrome.
 */
export function CreditFooter({ className = "" }: { className?: string }) {
  return (
    <div className={`credit-footer ${className}`}>
      <a
        className="credit-link"
        href="https://github.com/darsjo"
        target="_blank"
        rel="noopener noreferrer"
        dir="ltr"
        aria-label="Made with love by darsjo — GitHub"
      >
        <span className="credit-copy">
          Made with <span className="credit-heart" aria-hidden="true">❤</span> by{" "}
          <span className="credit-name">darsjo</span>
          <span className="credit-caret" aria-hidden="true" />
        </span>
      </a>
    </div>
  );
}
