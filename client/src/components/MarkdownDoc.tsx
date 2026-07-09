import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a markdown document the way claude.ai does: clear headings, bold
 * labels, real tables. Used for foundation docs and any long-form AI output.
 */
export function MarkdownDoc({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold text-foreground tracking-tight mt-2 mb-3 pb-2 border-b border-border/50">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-foreground tracking-tight mt-6 mb-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-foreground mt-5 mb-1.5">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-medium text-foreground mt-4 mb-1">{children}</h4>
          ),
          p: ({ children }) => <p className="text-sm text-foreground/85 mb-3">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-sm text-foreground/85">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 my-3 text-sm text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-border/50 my-5" />,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {children}
            </a>
          ),
          code: ({ children, className }) =>
            className ? (
              <code className="block rounded-lg bg-background/60 border border-border/50 p-3 text-xs font-mono text-foreground/85 overflow-x-auto my-3">
                {children}
              </code>
            ) : (
              <code className="rounded bg-background/60 border border-border/40 px-1 py-0.5 text-xs font-mono text-foreground/85">
                {children}
              </code>
            ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-border/50">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-background/60 text-left">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-semibold text-foreground border-b border-border/50 align-top">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-foreground/85 border-b border-border/30 align-top">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
