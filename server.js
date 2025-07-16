const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

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

app.listen(3001, () =>
  console.log("🚀 Server running on http://localhost:3001")
);
