import React from 'react';
import {
  AbsoluteFill,
  Composition,
  registerRoot,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const Title: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const scale = spring({
    frame,
    fps,
    config: { damping: 200 },
    from: 0.8,
    to: 1,
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
        color: 'white',
        fontFamily: 'monospace',
      }}
    >
      <div style={{ opacity, transform: `scale(${scale})`, textAlign: 'center' }}>
        <h1 style={{ fontSize: 180, margin: 0, fontWeight: 900 }}>
          MOUNT<span style={{ color: '#333' }}>0</span>
        </h1>
        <h2 style={{ fontSize: 60, margin: 20, fontWeight: 300, color: '#888' }}>{subtitle}</h2>
      </div>
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Intro"
        component={Title}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'MOUNT0',
          subtitle: 'Virtual Filesystem',
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
