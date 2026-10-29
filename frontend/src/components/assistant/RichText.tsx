import { Fragment, type ReactNode } from "react";
import styled from "styled-components";

// A small, safe subset of Markdown: paragraphs, bullet and numbered lists,
// **bold**, *italic* and `code`. Everything renders as React text, never HTML.

const Root = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    line-height: 1.5;
    overflow-wrap: anywhere;

    p {
        margin: 0;
    }
    ul,
    ol {
        margin: 0;
        padding-left: 18px;
    }
    li + li {
        margin-top: 2px;
    }
    code {
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        background: var(--surface-raised);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 0 4px;
    }
    strong {
        font-weight: 600;
    }
`;

function inline(text: string): ReactNode[] {
    const out: ReactNode[] = [];
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
        if (match.index > last) out.push(text.slice(last, match.index));
        const token = match[0];
        const key = `${match.index}`;
        if (token.startsWith("`")) out.push(<code key={key}>{token.slice(1, -1)}</code>);
        else if (token.startsWith("**")) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
        else out.push(<em key={key}>{token.slice(1, -1)}</em>);
        last = match.index + token.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

function parse(text: string): Block[] {
    const blocks: Block[] = [];
    for (const raw of text.split("\n")) {
        const line = raw.trimEnd();
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        const last = blocks[blocks.length - 1];
        if (bullet || numbered) {
            const kind = bullet ? "ul" : "ol";
            const item = (bullet ?? numbered)![1];
            if (last?.kind === kind) last.items.push(item);
            else blocks.push({ kind, items: [item] });
        } else if (!line.trim()) {
            blocks.push({ kind: "p", lines: [] });
        } else if (last?.kind === "p") {
            last.lines.push(line);
        } else {
            blocks.push({ kind: "p", lines: [line] });
        }
    }
    return blocks.filter((b) => (b.kind === "p" ? b.lines.length > 0 : true));
}

export function RichText({ text }: { text: string }) {
    return (
        <Root>
            {parse(text).map((b, i) =>
                b.kind === "p" ? (
                    <p key={i}>
                        {b.lines.map((l, j) => (
                            <Fragment key={j}>
                                {j > 0 && <br />}
                                {inline(l.replace(/^#+\s+/, ""))}
                            </Fragment>
                        ))}
                    </p>
                ) : b.kind === "ul" ? (
                    <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>
                ) : (
                    <ol key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>
                )
            )}
        </Root>
    );
}
