const mongoose = require("mongoose");
const app = require("../src/app");
const connectDB = require("../src/config/db");

// Cache the connection promise across warm invocations of this function.
// If it fails, clear the cache so the *next* request retries instead of
// being stuck forever on a rejected promise.
let connectPromise = null;

const ensureDB = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connectPromise) {
    connectPromise = connectDB().catch((err) => {
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
};

module.exports = async (req, res) => {
  try {
    await ensureDB();
  } catch (error) {
    console.error("Database connection error:", error);
    // Still route through the Express app so cors/helmet headers get set
    // correctly on the error response (avoids the browser reporting a
    // generic "CORS error" instead of the real 503).
    return res.status(503).json({ message: "Database not connected, please try again shortly" });
  }

  return app(req, res);
};