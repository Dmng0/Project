import React from "react";
import { flowNoteRanges } from "./flow-text";
export default function FlowReader({
  blocks,
  notes,
  settings: s,
  highlighted,
  follow,
  renderScan,
}) {
  const fontStyle = {
    fontFamily:
      s.font === "serif"
        ? 'Georgia, "Noto Serif KR", serif'
        : s.font === "mono"
          ? "monospace"
          : "Arial, sans-serif",
    fontSize: s.size,
    lineHeight: s.line,
  };
  return (
    <article className="reading-flow">
      {blocks.map((block) => {
        const ranges =
          block.kind === "text" ? flowNoteRanges(block, notes) : [];
        return block.kind === "scan" ? (
          <React.Fragment key={`scan-${block.data.num}`}>
            {renderScan(block.data)}
          </React.Fragment>
        ) : (
          <section className="flow-run" key={block.id} data-flow-run={block.id}>
            <div
              className={`prose flow-prose ${s.indent ? "indent" : ""}`}
              style={fontStyle}
            >
              {block.paragraphs.map((paragraph, i) => (
                <p className={paragraph.heading ? "flow-heading" : ""} key={i}>
                  {paragraph.parts.map((part, j) => {
                    const content = highlighted(part.text, part.start, ranges);
                    if (part.separator)
                      return (
                        <React.Fragment key={j}>{part.text}</React.Fragment>
                      );
                    return (
                      <span
                        className="flow-source"
                        data-page={part.page}
                        data-flow-start={part.start}
                        data-source-start={part.sourceStart}
                        key={j}
                      >
                        {part.link ? (
                          part.link.dest ? (
                            <button
                              className="text-pdf-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                follow(part.link.dest);
                              }}
                            >
                              {content}
                            </button>
                          ) : (
                            <a
                              href={part.link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {content}
                            </a>
                          )
                        ) : (
                          content
                        )}
                      </span>
                    );
                  })}
                </p>
              ))}
            </div>
          </section>
        );
      })}
    </article>
  );
}
