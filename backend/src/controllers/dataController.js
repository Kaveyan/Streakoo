const HabitData = require("../models/HabitData");

// GET /api/data  -> returns the whole app-state document for the logged-in user
const getData = async (req, res, next) => {
  try {
    let doc = await HabitData.findOne({ user: req.user._id });
    if (!doc) doc = await HabitData.create({ user: req.user._id });
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};

// PUT /api/data  -> merges the patch into the stored document (matches the
// frontend's previous `save(patch)` semantics against window.storage)
const updateData = async (req, res, next) => {
  try {
    const patch = req.body || {};
    delete patch._id;
    delete patch.user;

    const doc = await HabitData.findOneAndUpdate(
      { user: req.user._id },
      { $set: patch },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};

module.exports = { getData, updateData };
