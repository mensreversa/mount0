import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const Hero: React.FC<{ subtitle?: string }> = ({ subtitle = "The Future of Virtual Filesystems" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = spring({ frame, fps, config: { damping: 200 } });
  const scale = spring({ frame, fps, from: 0.8, to: 1, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        color: "white",
        fontFamily: "monospace",
      }}
    >
      <div style={{ opacity, transform: `scale(${scale})`, textAlign: "center" }}>
        <h1 style={{ fontSize: 180, fontWeight: 900, letterSpacing: "-5px" }}>
          MOUNT<span style={{ color: "#555" }}>0</span>
        </h1>
        <h2
          style={{
            fontSize: 40,
            fontWeight: 300,
            color: "#aaa",
            marginTop: 20,
            letterSpacing: "2px",
          }}
        >
          {subtitle}
        </h2>
      </div>
    </AbsoluteFill>
  );
};
