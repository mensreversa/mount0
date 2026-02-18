import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";

const FeatureItem: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const translateY = spring({ frame: frame - delay, fps, from: 50, to: 0 });

  return (
    <h3
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        fontSize: 60,
        margin: "20px 0",
        color: "#fff",
        fontFamily: "monospace",
      }}
    >
      {text}
    </h3>
  );
};

export const Features: React.FC = () => {
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <FeatureItem text="> In-Memory Speed" delay={0} />
      <FeatureItem text="> FUSE Compatibility" delay={15} />
      <FeatureItem text="> Zero Disk Footprint" delay={30} />
      <FeatureItem text="> Developer API" delay={45} />
    </AbsoluteFill>
  );
};
