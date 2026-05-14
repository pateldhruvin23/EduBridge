const axios = require("axios");
require("dotenv").config();

const fetchPlaylistVideos = async (playlistId) => {
  try {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems`;

    const response = await axios.get(url, {
      params: {
        part: "snippet",
        maxResults: 50,
        playlistId,
        key: process.env.YOUTUBE_API_KEY,
      },
    });

    return response.data.items.map((item, index) => ({
      videoId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      order: index + 1,
      // ✅ pick best available thumbnail
      thumbnail:
        item.snippet.thumbnails?.maxres?.url ||
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url ||
        null,
    }));
  } catch (err) {
    console.error(err);
    return [];
  }
};

module.exports = { fetchPlaylistVideos };