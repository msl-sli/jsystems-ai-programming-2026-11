"use client";

import { defaultRehypePlugins, Streamdown, type Components } from "streamdown";

// Raw HTML disabled: `raw` is omitted, sanitize and harden stay (ADR-001 section 6).
const REHYPE_PLUGINS = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.undoubleClobberPrefix,
  defaultRehypePlugins.harden,
].filter((plugin) => plugin !== undefined);

const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline wrap-anywhere"
    >
      {children}
    </a>
  ),
};

/** Streaming Markdown of agent answers (Message pattern); HTML is escaped, not rendered. */
export function AgentMarkdown({
  children,
  streaming = false,
}: {
  children: string;
  streaming?: boolean;
}) {
  return (
    <Streamdown
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      rehypePlugins={REHYPE_PLUGINS}
      components={COMPONENTS}
      linkSafety={{ enabled: false }}
      controls={false}
    >
      {children}
    </Streamdown>
  );
}
