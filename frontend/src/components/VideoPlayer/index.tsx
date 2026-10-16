import React from "react";
import styles from "./VideoPlayer.module.css";
import VideoPlayerLoader from "./loader";

interface VideoPlayerProps {
  videoUrl: string;
  isLoading?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  isLoading = false,
}) => {
  if (isLoading) {
    return <VideoPlayerLoader />;
  }

  return (
    <div className={styles.videoContainer}>
      <video
        src={videoUrl}
        controls
        autoPlay={false}
        muted
        playsInline
        className={styles.videoPlayer}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoPlayer;
