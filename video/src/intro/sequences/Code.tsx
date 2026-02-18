import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

export const Code: React.FC = () => {
  const frame = useCurrentFrame();
  const text = `const fs = new Mount0();\nawait fs.mount('/tmp/virt');\nconsole.log('Online 🟢');`;
  const charsShown = Math.floor(frame / 1.5);

  return (
    <AbsoluteFill
      style={{
        padding: 100,
        fontFamily: "monospace",
        color: "#0f0",
        fontSize: 50,
        whiteSpace: "pre",
        justifyContent: "center",
      }}
    >
      <div style={{ borderLeft: "4px solid #333", paddingLeft: 40 }}>
        {text.slice(0, charsShown)}
        <span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>_</span>
      </div>
    </AbsoluteFill>
  );
};
