const { validationResult } = require("express-validator");
const User = require("../models/User");
const HabitData = require("../models/HabitData");
const generateToken = require("../utils/generateToken");

// Auth is Bearer-token only (frontend and backend live on different Vercel
// domains, so cross-site cookies are unreliable across browsers). The token
// is simply returned in the JSON body; the frontend stores it and sends it
// back as `Authorization: Bearer <token>`.
const sendAuthResponse = (res, user, status = 200) => {
  const token = generateToken(user._id);
  res.status(status).json({ user: user.toSafeObject(), token });
};

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { name, email, password } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "An account with this email already exists" });

    const user = await User.create({ name, email, password, authProvider: "local" });
    await HabitData.create({ user: user._id });

    sendAuthResponse(res, user, 201);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    sendAuthResponse(res, user, 200);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
// Nothing to clear server-side with Bearer tokens — the frontend just
// deletes the token from localStorage. Kept as a route for symmetry /
// future use (e.g. token blacklisting).
const logout = (req, res) => {
  res.status(200).json({ message: "Logged out" });
};

// GET /api/auth/me
const getMe = async (req, res) => {
  res.status(200).json({ user: req.user.toSafeObject() });
};

module.exports = { register, login, logout, getMe };
