import api from "./axios";

/**
 * Drop-in replacement for the previous `window.storage` (browser sandbox
 * storage) API used by HabitTracker.jsx. Same method signatures
 * (get/set returning { key, value }), but now persists to MongoDB via the
 * backend instead of local/browser storage. This is the ONLY thing that
 * changed for the habit tracker UI component.
 */
export const storage = {
  async get() {
    const { data } = await api.get("/data");
    return { key: "habit-tracker-data", value: JSON.stringify(data) };
  },
  async set(_key, valueString) {
    const patch = JSON.parse(valueString);
    const { data } = await api.put("/data", patch);
    return { key: "habit-tracker-data", value: JSON.stringify(data) };
  },
};
