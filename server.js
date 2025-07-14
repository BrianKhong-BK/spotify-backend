const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const YoutubeMusicApi = require("youtube-music-api");

dotenv.config();
const app = express();
app.use(cors());

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;

let spotifyToken = null;

// 🔁 Refresh Spotify Token
async function refreshSpotifyToken() {
  const authString = Buffer.from(`${client_id}:${client_secret}`).toString(
    "base64"
  );

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authString}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  const data = await response.json();
  spotifyToken = data.access_token;
  console.log("✅ Spotify token refreshed");
}

refreshSpotifyToken();
setInterval(refreshSpotifyToken, 55 * 60 * 1000);

// ✅ Normalize utility
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gi, "")
    .trim();
}

// ✅ Spotify Search
app.get("/api/spotify-search", async (req, res) => {
  const songInput = req.query.song?.toLowerCase().trim() || "";
  const artistInput = req.query.artist?.toLowerCase().trim() || "";

  const query =
    artistInput && songInput
      ? `track:${songInput} artist:${artistInput}`
      : songInput;
  if (!query) return res.status(400).json({ error: "Missing query" });

  const searchURL = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
    query
  )}&type=track&limit=30`;

  try {
    const response = await fetch(searchURL, {
      headers: { Authorization: `Bearer ${spotifyToken}` },
    });

    const data = await response.json();
    if (!data.tracks?.items)
      return res.status(404).json({ error: "No results found" });

    const seen = new Set();
    const scoredResults = [];

    const songWords = songInput.split(" ").filter(Boolean);
    const artistWords = artistInput.split(" ").filter(Boolean);

    data.tracks.items.forEach((track) => {
      const trackTitle = track.name.toLowerCase().trim();
      const trackArtists = track.artists.map((a) =>
        a.name.toLowerCase().trim()
      );
      const artistString = trackArtists.join(", ");
      const key = `${trackTitle}|${artistString}`;

      if (seen.has(key)) return;
      seen.add(key);

      let score = 0;
      if (trackTitle === songInput) score += 40;
      if (trackArtists.some((a) => a === artistInput)) score += 40;

      songWords.forEach((word) => {
        if (trackTitle.includes(word)) score += 5;
      });

      artistWords.forEach((word) => {
        if (trackArtists.some((a) => a.includes(word))) score += 5;
      });

      score += Math.floor(track.popularity / 10);

      scoredResults.push({
        id: track.id,
        title: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        album: track.album.name,
        image: track.album.images[0]?.url,
        preview_url: track.preview_url,
        spotify_url: track.external_urls.spotify,
        popularity: track.popularity,
        score,
      });
    });

    scoredResults.sort((a, b) => b.score - a.score);
    res.json({ results: scoredResults });
  } catch (err) {
    console.error("❌ Spotify search failed:", err);
    res.status(500).json({ error: "Spotify search failed" });
  }
});

function parseInput(input) {
  const parts = input.split(" - ");
  if (parts.length === 2) {
    return {
      artist: parts[0].trim(),
      song: parts[1].trim(),
    };
  }
  return {
    artist: "",
    song: input.trim(),
  };
}

// ✅ YouTube Music API Search
app.get("/api/youtube-search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing query" });

  const api = new YoutubeMusicApi();

  try {
    await api.initalize();
    const response = await api.search(query, "song");

    const results = (response.content || []).map((item) => {
      const title = normalize(item.name || "");
      const artist = normalize(item.artist?.name || "");
      const input = parseInput(query);
      const inputTitle = normalize(input.song);
      const inputArtist = normalize(input.artist);

      let score = 0;

      if (title === inputTitle) score += 20;
      if (artist === inputArtist) score += 15;
      if (title.includes(inputTitle)) score += 5;
      if (artist.includes(inputArtist)) score += 8;

      return {
        videoId: item.videoId,
        name: item.name,
        artist: item.artist?.name,
        score,
      };
    });

    results.sort((a, b) => b.score - a.score);
    res.json({ results });
  } catch (err) {
    console.error("❌ YouTube Music API failed:", err);
    res.status(500).json({ error: "YouTube search failed" });
  }
});

app.listen(3001, () =>
  console.log("🚀 Server running on http://localhost:3001")
);
