import React, { useMemo } from 'react';

interface MarkdownTextProps {
  content: string;
  className?: string;
  isTyping?: boolean;
}

/**
 * Normalizes common LLM single-line bullet artifacts and formatting.
 */
function normalizeMarkdown(raw: string): string {
  if (!raw) return '';
  // Convert inline bullet separators like "text: * **Title:**" or ". * **Title:**" into clean newlines
  let s = raw.replace(/([.:?!])\s+[\*•-]\s+(\*\*|[A-Za-z0-9])/g, '$1\n\n- $2');
  s = s.replace(/\s+[\*•-]\s+(\*\*)/g, '\n- $1');
  return s;
}

/**
 * Renders inline spans (bold, italic, inline code, links).
 */
function renderInline(text: string): React.ReactNode[] {
  if (!text) return [];

  // Match bold italic, bold, italic, inline code, and markdown links
  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|(?<!\*)\*[^*]+(?<!\*)\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(regex);

  return parts.map((part, i) => {
    if (!part) return null;

    // Bold + Italic: ***text***
    if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
      return (
        <strong key={i} className="font-semibold italic text-white">
          {part.slice(3, -3)}
        </strong>
      );
    }

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2 && !part.startsWith('**')) {
      return (
        <em key={i} className="italic text-white/90">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Inline Code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={i}
          className="px-1 py-0.5 rounded bg-white/10 text-[10.5px] font-mono text-[#79c0ff]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Link: [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#58a6ff] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {linkMatch[1]}
        </a>
      );
    }

    // Strip unclosed formatting markers that occur mid-typing (e.g. "teks **Kata")
    let clean = part;
    if (clean.endsWith('**')) {
      clean = clean.slice(0, -2);
    } else if (clean.endsWith('*') && !clean.endsWith('**')) {
      clean = clean.slice(0, -1);
    } else if (clean.endsWith('`')) {
      clean = clean.slice(0, -1);
    }

    return <React.Fragment key={i}>{clean}</React.Fragment>;
  });
}

/**
 * Lightweight, zero-dependency Markdown renderer tailored for WinIsle Dynamic Island.
 */
export const MarkdownText: React.FC<MarkdownTextProps> = ({
  content,
  className = '',
  isTyping = false,
}) => {
  const rendered = useMemo(() => {
    if (!content) return null;

    const normalized = normalizeMarkdown(content);
    const lines = normalized.split('\n');
    const nodes: React.ReactNode[] = [];

    let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockLines: string[] = [];

    const flushList = (key: number) => {
      if (!currentList) return;
      if (currentList.type === 'ul') {
        nodes.push(
          <ul key={`list-${key}`} className="my-1 pl-3.5 space-y-1 list-disc list-outside text-white/90">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="leading-snug">
                {renderInline(item)}
              </li>
            ))}
          </ul>
        );
      } else {
        nodes.push(
          <ol key={`list-${key}`} className="my-1 pl-3.5 space-y-1 list-decimal list-outside text-white/90">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="leading-snug">
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    };

    const flushCodeBlock = (key: number) => {
      if (!inCodeBlock) return;
      nodes.push(
        <div key={`code-${key}`} className="my-1.5 p-2 rounded-md bg-black/40 border border-white/10 overflow-x-auto no-scrollbar">
          {codeBlockLang && (
            <div className="text-[9px] text-white/40 font-mono mb-1 uppercase tracking-wider">
              {codeBlockLang}
            </div>
          )}
          <pre className="text-[10.5px] font-mono text-[#e6edf3] leading-relaxed">
            {codeBlockLines.join('\n')}
          </pre>
        </div>
      );
      inCodeBlock = false;
      codeBlockLang = '';
      codeBlockLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Code block start / end
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          flushCodeBlock(i);
        } else {
          flushList(i);
          inCodeBlock = true;
          codeBlockLang = trimmed.slice(3).trim();
          codeBlockLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      // Empty line
      if (!trimmed) {
        flushList(i);
        continue;
      }

      // Headers (### Header, ## Header, # Header)
      const headerMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headerMatch) {
        flushList(i);
        const level = headerMatch[1].length;
        const text = headerMatch[2];
        if (level === 1 || level === 2) {
          nodes.push(
            <h4 key={`h-${i}`} className="text-[12px] font-bold text-white mt-2 mb-0.5">
              {renderInline(text)}
            </h4>
          );
        } else {
          nodes.push(
            <h5 key={`h-${i}`} className="text-[11.5px] font-semibold text-white/95 mt-1.5 mb-0.5">
              {renderInline(text)}
            </h5>
          );
        }
        continue;
      }

      // Bullet list item (- Item, * Item, • Item)
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        if (!currentList || currentList.type !== 'ul') {
          flushList(i);
          currentList = { type: 'ul', items: [] };
        }
        currentList.items.push(bulletMatch[1]);
        continue;
      }

      // Numbered list item (1. Item, 2. Item)
      const numberMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (numberMatch) {
        if (!currentList || currentList.type !== 'ol') {
          flushList(i);
          currentList = { type: 'ol', items: [] };
        }
        currentList.items.push(numberMatch[2]);
        continue;
      }

      // Regular paragraph line
      flushList(i);
      nodes.push(
        <p key={`p-${i}`} className="leading-relaxed my-0.5">
          {renderInline(line)}
        </p>
      );
    }

    // Flush any pending list or code block
    flushList(lines.length);
    flushCodeBlock(lines.length);

    return nodes;
  }, [content]);

  return (
    <div className={`select-text break-words ${className}`}>
      {rendered}
      {isTyping && (
        <span className="inline-block w-1.5 h-3 ml-0.5 align-middle bg-white/70 animate-pulse rounded-xs" />
      )}
    </div>
  );
};
