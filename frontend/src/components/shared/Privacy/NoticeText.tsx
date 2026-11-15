import type { CSSProperties, ReactElement } from "react";

// Renders the privacy notice from plain text: a blank line starts a new block, lines starting
// with "- " are bullet points, and a short single line with no full stop is a heading.
const NoticeText = ({ text, style }: { text: string; style?: CSSProperties }) => {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div style={{ lineHeight: 1.6, fontSize: "0.95rem", ...style }}>
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        const isHeading = (l: string) => l.length <= 60 && !/[.:;,]$/.test(l) && !l.startsWith("- ");
        const out: ReactElement[] = [];
        let k = 0;
        let bullets: string[] = [];
        const flush = () => {
          if (bullets.length) out.push(<ul key={k++} style={{ margin: "0.25rem 0 0.75rem", paddingLeft: "1.25rem" }}>{bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>);
          bullets = [];
        };
        lines.forEach((l, j) => {
          if (l.startsWith("- ")) return void bullets.push(l.slice(2));
          flush();
          if (j === 0 && lines.length > 1 && isHeading(l)) out.push(<h3 key={k++} style={{ margin: "1rem 0 0.35rem", fontSize: "1.02rem" }}>{l}</h3>);
          else out.push(<p key={k++} style={{ margin: "0 0 0.75rem" }}>{l}</p>);
        });
        flush();
        return <div key={i}>{out}</div>;
      })}
    </div>
  );
};

export default NoticeText;
