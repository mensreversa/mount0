import React from 'react';
import {
    AbsoluteFill,
    spring,
    useCurrentFrame,
    useVideoConfig,
} from 'remotion';

export const Intro: React.FC<{ title: string; subtitle: string }> = ({ title = 'MOUNT0', subtitle = 'Virtual Filesystem' }) => {
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
