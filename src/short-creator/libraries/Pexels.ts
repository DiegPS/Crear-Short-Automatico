/* eslint-disable @remotion/deterministic-randomness */
import { getOrientationConfig } from "../../components/utils";
import { logger } from "../../logger";
import { OrientationEnum, type Video } from "../../types/shorts";

const jokerTerms: string[] = ["nature", "globe", "space", "ocean", "beautiful", "landscape", "sky", "water", "mountain", "forest", "sunset", "sunrise", "beach", "city", "people", "life", "abstract", "art", "color", "light"];
const durationBufferSeconds = 3;
const defaultTimeoutMs = 5000;
const retryTimes = 3;

export class PexelsAPI {
  constructor(private API_KEY: string) {}

  private async _findVideo(
    searchTerm: string,
    minDurationSeconds: number,
    excludeIds: string[],
    orientation: OrientationEnum,
    timeout: number,
    relaxCriteria: boolean = false,
  ): Promise<Video> {
    if (!this.API_KEY) {
      throw new Error("API key not set");
    }
    logger.debug(
      { searchTerm, minDurationSeconds, orientation, relaxCriteria },
      "Searching for video in Pexels API",
    );
    const headers = new Headers();
    headers.append("Authorization", this.API_KEY);
    
    let response;
    try {
      response = await fetch(
        `https://api.pexels.com/videos/search?orientation=${orientation}&size=medium&per_page=80&query=${encodeURIComponent(searchTerm)}`,
        {
          method: "GET",
          headers,
          redirect: "follow",
          signal: AbortSignal.timeout(timeout),
        },
      )
        .then((res) => res.json())
        .catch((error: unknown) => {
          logger.error(error, "Error fetching videos from Pexels API");
          throw error;
        });
    } catch (error: unknown) {
      logger.error(error, "Error fetching videos from Pexels API");
      throw error;
    }
    
    const videos = response.videos as {
      id: string;
      duration: number;
      video_files: {
        fps: number;
        quality: string;
        width: number;
        height: number;
        id: string;
        link: string;
      }[];
    }[];

    const { width: requiredVideoWidth, height: requiredVideoHeight } =
      getOrientationConfig(orientation);

    if (!videos || videos.length === 0) {
      logger.warn(
        { searchTerm, orientation },
        "No videos found in Pexels API response, will try with relaxed criteria",
      );
      throw new Error("No videos found");
    }

    // find all the videos that fits the criteria, then select one randomly
    // First try with strict criteria
    let filteredVideos = videos
      .map((video) => {
        if (excludeIds.includes(video.id)) {
          return;
        }
        if (!video.video_files.length) {
          return;
        }

        // calculate the real duration of the video by converting the FPS to 25
        const fps = video.video_files[0].fps;
        const duration =
          fps < 25 ? video.duration * (fps / 25) : video.duration;

        if (duration >= minDurationSeconds + durationBufferSeconds) {
          for (const file of video.video_files) {
            if (
              file.quality === "hd" &&
              file.width === requiredVideoWidth &&
              file.height === requiredVideoHeight
            ) {
              return {
                id: video.id,
                url: file.link,
                width: file.width,
                height: file.height,
              };
            }
          }
        }
      })
      .filter(Boolean);

    // If no videos found with strict criteria, relax them
    if (!filteredVideos.length || relaxCriteria) {
      logger.warn(
        { searchTerm },
        "No videos found with strict criteria, relaxing requirements",
      );
      
      // Relax: allow any quality, any duration, but still prefer correct orientation
      filteredVideos = videos
        .map((video) => {
          if (excludeIds.includes(video.id)) {
            return;
          }
          if (!video.video_files.length) {
            return;
          }

          // Try to find matching orientation first
          for (const file of video.video_files) {
            if (
              file.width === requiredVideoWidth &&
              file.height === requiredVideoHeight
            ) {
              return {
                id: video.id,
                url: file.link,
                width: file.width,
                height: file.height,
              };
            }
          }
          
          // If no exact match, take any video file
          const file = video.video_files[0];
          return {
            id: video.id,
            url: file.link,
            width: file.width,
            height: file.height,
          };
        })
        .filter(Boolean);
    }

    if (!filteredVideos.length) {
      logger.error({ searchTerm }, "No videos found even with relaxed criteria");
      throw new Error("No videos found");
    }

    const video = filteredVideos[
      Math.floor(Math.random() * filteredVideos.length)
    ] as Video;

    logger.debug(
      { searchTerm, video: video, minDurationSeconds, orientation },
      "Found video from Pexels API",
    );

    return video;
  }

  async findVideo(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    timeout: number = defaultTimeoutMs,
    retryCounter: number = 0,
  ): Promise<Video> {
    // shuffle the search terms to randomize the search order
    const shuffledJokerTerms = jokerTerms.sort(() => Math.random() - 0.5);
    const shuffledSearchTerms = searchTerms.sort(() => Math.random() - 0.5);

    // First pass: try with strict criteria
    for (const searchTerm of [...shuffledSearchTerms, ...shuffledJokerTerms]) {
      try {
        return await this._findVideo(
          searchTerm,
          minDurationSeconds,
          excludeIds,
          orientation,
          timeout,
          false, // strict criteria
        );
      } catch (error: unknown) {
        if (
          error instanceof DOMException &&
          error.name === "TimeoutError"
        ) {
          if (retryCounter < retryTimes) {
            logger.warn(
              { searchTerm, retryCounter },
              "Timeout error, retrying...",
            );
            return await this.findVideo(
              searchTerms,
              minDurationSeconds,
              excludeIds,
              orientation,
              timeout,
              retryCounter + 1,
            );
          }
          logger.error(
            { searchTerm, retryCounter },
            "Timeout error, retry limit reached",
          );
          // Continue to next term instead of throwing
        }

        logger.warn(error, "Error finding video in Pexels API for term, trying next term");
      }
    }

    // Second pass: try with relaxed criteria
    logger.warn(
      { searchTerms },
      "No videos found with strict criteria, trying with relaxed criteria",
    );
    
    for (const searchTerm of [...shuffledSearchTerms, ...shuffledJokerTerms]) {
      try {
        return await this._findVideo(
          searchTerm,
          minDurationSeconds,
          excludeIds,
          orientation,
          timeout,
          true, // relaxed criteria
        );
      } catch (error: unknown) {
        if (
          error instanceof DOMException &&
          error.name === "TimeoutError"
        ) {
          if (retryCounter < retryTimes) {
            logger.warn(
              { searchTerm, retryCounter },
              "Timeout error with relaxed criteria, retrying...",
            );
            return await this.findVideo(
              searchTerms,
              minDurationSeconds,
              excludeIds,
              orientation,
              timeout,
              retryCounter + 1,
            );
          }
        }

        logger.warn(error, "Error finding video with relaxed criteria, trying next term");
      }
    }

    // Last resort: try without orientation filter and with very generic terms
    logger.warn(
      { searchTerms },
      "All search terms failed, trying without orientation filter",
    );
    
    const genericTerms = ["nature", "beautiful", "abstract", "color", "light"];
    for (const searchTerm of genericTerms) {
      try {
        // Try without orientation filter by using a different endpoint
        const headers = new Headers();
        headers.append("Authorization", this.API_KEY);
        const response = await fetch(
          `https://api.pexels.com/videos/search?size=medium&per_page=80&query=${encodeURIComponent(searchTerm)}`,
          {
            method: "GET",
            headers,
            redirect: "follow",
            signal: AbortSignal.timeout(timeout),
          },
        )
          .then((res) => res.json())
          .catch((error: unknown) => {
            logger.error(error, "Error fetching videos from Pexels API");
            throw error;
          });

        const videos = response.videos as {
          id: string;
          duration: number;
          video_files: {
            fps: number;
            quality: string;
            width: number;
            height: number;
            id: string;
            link: string;
          }[];
        }[];

        if (videos && videos.length > 0) {
          // Just take any video that's not excluded
          const availableVideo = videos.find(v => !excludeIds.includes(v.id) && v.video_files.length > 0);
          if (availableVideo) {
            const file = availableVideo.video_files[0];
            logger.warn(
              { searchTerm, videoId: availableVideo.id },
              "Using fallback video without strict criteria",
            );
            return {
              id: availableVideo.id,
              url: file.link,
              width: file.width,
              height: file.height,
            };
          }
        }
      } catch (error: unknown) {
        logger.warn(error, "Error in fallback video search");
      }
    }

    // If we still don't have a video, this should never happen, but throw a descriptive error
    logger.error(
      { searchTerms, excludeIds, orientation },
      "CRITICAL: No videos found after all attempts - this should never happen",
    );
    throw new Error("CRITICAL: Unable to find any video from Pexels API after all fallback attempts");
  }
}
