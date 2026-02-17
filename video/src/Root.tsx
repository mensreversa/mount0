import { Composition } from 'remotion';
import './index.css';
import { Intro } from './intro/Intro';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Intro"
        component={Intro}
        durationInFrames={450}
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
