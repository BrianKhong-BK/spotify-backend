const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const YoutubeMusicApi = require("youtube-music-api");
const stringSimilarity = require("string-similarity");

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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, "") // remove non-alphanumeric
    .trim();
}

// ✅ Spotify Search
app.get("/api/spotify-search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing query" });

  const searchURL = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=30`;

  try {
    const response = await fetch(searchURL, {
      headers: { Authorization: `Bearer ${spotifyToken}` },
    });

    const data = await response.json();
    if (!data.tracks?.items)
      return res.status(404).json({ error: "No results found" });

    const results = data.tracks.items.map((item) => {
      return {
        id: item.id,
        title: item.name,
        cover: item.album.images[2].url,
        artist: item.artists.map((artist) => artist.name).toString(),
      };
    });

    res.json(results);
  } catch (err) {
    console.error("❌ Spotify search failed:", err);
    res.status(500).json({ error: "Spotify search failed" });
  }
});

function parseInput(input) {
  const parts = input.split(" : ");
  if (parts.length === 2) {
    return {
      song: parts[0].trim(),
      artist: parts[1].trim(),
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

  const spotifyInput = parseInput(query); // Assume this returns { title, artist, durationMs }

  console.log(query);
  const api = new YoutubeMusicApi();

  try {
    await api.initalize();
    const response = await api.search(query, "song");
    const results = response.content;

    // Score and sort results
    const scoredResults = results
      .map((track) => {
        const score = calculateMatchScore(track, spotifyInput);
        return { ...track, score };
      })
      .sort((a, b) => b.score - a.score); // Sort by highest score

    res.json({ results: scoredResults[0] });
  } catch (err) {
    console.error("❌ YouTube Music API failed:", err);
    res.status(500).json({ error: "YouTube search failed" });
  }
});

// --- Scoring Logic ---
function calculateMatchScore(youtubeTrack, spotifyInput) {
  let score = 0;

  // 1. Title Match (Case-Insensitive)
  const youtubeTitle = youtubeTrack.name?.toLowerCase() || "";
  const youtubeArtist = youtubeTrack.artist.name?.toLowerCase() || "";
  const spotifyTitle = spotifyInput.song?.toLowerCase() || "";
  const spotifyArtist = spotifyInput.artist?.toLowerCase() || "";

  if (youtubeTitle === spotifyTitle) score += 20;
  if (youtubeArtist === spotifyArtist) score += 15;

  spotifyTitle.split(" ").forEach((word) => {
    if (youtubeTitle.includes(word)) score += 5;
  });

  spotifyArtist.split(" ").forEach((word) => {
    if (youtubeArtist.includes(word)) score += 4;
  });

  const titleSimilarity = stringSimilarity.compareTwoStrings(
    youtubeTitle,
    spotifyTitle
  );
  const artistSimilarity = stringSimilarity.compareTwoStrings(
    youtubeArtist,
    spotifyArtist
  );

  if (titleSimilarity > 0.8) score += 15;
  if (artistSimilarity > 0.8) score += 10;

  return score;
}

app.listen(3001, () =>
  console.log("🚀 Server running on http://localhost:3001")
);
