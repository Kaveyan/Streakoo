const mongoose = require("mongoose");

/**
 * Stores the entire habit-tracker app state for a single user as one document.
 * This mirrors the shape the frontend previously kept in browser storage
 * (habits, completions, targets, tasks, tracks, preferences), so the UI's
 * existing save/load logic maps onto this schema with no data-model changes.
 */
const HabitDataSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    habits: { type: Array, default: [] },
    completions: { type: mongoose.Schema.Types.Mixed, default: {} },
    targets: { type: Array, default: [] },

    todayTasks: { type: Array, default: [] },
    todayTasksDate: { type: String, default: null },
    weekTasks: { type: Array, default: [] },
    weekTasksWeekStart: { type: String, default: null },
    monthTasks: { type: Array, default: [] },
    monthTasksMonthStart: { type: String, default: null },
    goalBudgetItems: { type: Array, default: [] },
    bucketListItems: { type: Array, default: [] },

    tracks: { type: Array, default: [] },
    trackEntries: { type: mongoose.Schema.Types.Mixed, default: {} },

    theme: { type: String, default: "light" },
    countdownMode: { type: String, default: "month" },
    dob: { type: String, default: null },

    moneyTarget: { type: Number, default: 0 },
    moneyEarned: { type: Number, default: 0 },
    packageTarget: { type: Number, default: 0 },
    packageAchieved: { type: Number, default: 0 },
    checkedProTips: { type: Array, default: [] },
    proTips: { type: Array, default: [] },
    timerSeconds: { type: Number, default: 1500 },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("HabitData", HabitDataSchema);
