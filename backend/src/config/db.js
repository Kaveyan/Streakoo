const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // dbName is forced here so we never silently land on Mongo's default
    // "test" database, even if MONGO_URI itself has no db name in the path.
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || "streako",
    });
    console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    // IMPORTANT: never call process.exit() here — this runs inside a Vercel
    // serverless function. Exiting kills the whole function process before
    // Express/cors middleware can send a proper response, which shows up in
    // the browser as a confusing "CORS error" instead of a real error.
    throw err;
  }
};

module.exports = connectDB;
