import { Composition } from "remotion";
import { Intro } from "./intro/Intro";
import "./index.css";

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="Intro"
                component={Intro}
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
