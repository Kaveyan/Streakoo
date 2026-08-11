import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { storage } from "../api/storage";
import { useAuth } from "../context/AuthContext";

const PALETTE = [
  "#3B82F6", "#10B981", "#22C55E", "#FBC02D", "#FB923C", "#F0544F",
  "#EC4899", "#A855F7", "#6366F1", "#0EA5E9", "#14B8A6", "#84CC16",
];

const BG_LIGHT = [250, 247, 239]; // matches light page background var(--page-bg)
const BG_DARK = [0, 0, 0]; // matches dark page background #000000
const CELL_EMPTY = "var(--cell-empty)";
const HEATMAP_WEEKS = 53;
const HEATMAP_BASE = "#2F9E52";

const pad2 = (n) => String(n).padStart(2, "0");
const isoFromDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISO = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const todayISO = () => isoFromDate(new Date());
const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoFromDate(d);
};
const dayOfWeekMon0 = (iso) => (parseISO(iso).getDay() + 6) % 7;
const weekStartISO = (iso) => addDays(iso, -dayOfWeekMon0(iso));
// Task resets roll over at 4am local time rather than midnight, so a late night
// doesn't wipe out "today's" tasks before you've actually gone to bed.
const appDayISO = () => {
  const now = new Date();
  if (now.getHours() < 4) now.setDate(now.getDate() - 1);
  return isoFromDate(now);
};
const daysBetween = (fromISO, toISO) => {
  const a = parseISO(fromISO);
  const b = parseISO(toISO);
  return Math.round((b - a) / 86400000);
};
const fmtShort = (iso) => parseISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (hex, ratio, bg) => {
  const [r, g, b] = hexToRgb(hex);
  const mr = Math.round(bg[0] + (r - bg[0]) * ratio);
  const mg = Math.round(bg[1] + (g - bg[1]) * ratio);
  const mb = Math.round(bg[2] + (b - bg[2]) * ratio);
  return `rgb(${mr}, ${mg}, ${mb})`;
};
const scaleFor = (hex, bg) => [mix(hex, 0.25, bg), mix(hex, 0.5, bg), mix(hex, 0.75, bg), mix(hex, 1, bg)];

const STORAGE_KEY = "habit-tracker-data";
const DEFAULT_TIMER_SECONDS = 25 * 60;
const MAX_TIMER_SECONDS = 99 * 3600 + 59 * 60 + 59;
const clampTimer = (secs) => Math.min(MAX_TIMER_SECONDS, Math.max(0, secs));
const splitDuration = (secs) => ({
  hours: Math.floor(secs / 3600),
  mins: Math.floor((secs % 3600) / 60),
  secs: secs % 60,
});

export default function HabitTracker() {
  const [habits, setHabits] = useState([]);
  const [completions, setCompletions] = useState({});
  const [targets, setTargets] = useState([]);
  const [todayTasks, setTodayTasks] = useState([]);
  const [weekTasks, setWeekTasks] = useState([]);
  const [monthTasks, setMonthTasks] = useState([]);
  const [goalBudgetItems, setGoalBudgetItems] = useState([]);
  const [bucketListItems, setBucketListItems] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [trackEntries, setTrackEntries] = useState({});
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [hoveredHabitId, setHoveredHabitId] = useState(null);

  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [newName, setNewName] = useState("");
  const [addHabitOpen, setAddHabitOpen] = useState(false);
  const [deleteHabitId, setDeleteHabitId] = useState(null);
  const [countdownMode, setCountdownMode] = useState("month");
  const [countdownMenuOpen, setCountdownMenuOpen] = useState(false);
  const [dob, setDob] = useState(null);
  const [dobModalOpen, setDobModalOpen] = useState(false);
  const [dobInput, setDobInput] = useState("");
  const [activePage, setActivePage] = useState("main");
  const [mobileTab, setMobileTab] = useState("habit");
  const [targetName, setTargetName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [todayInput, setTodayInput] = useState("");
  const [weekInput, setWeekInput] = useState("");
  const [monthInput, setMonthInput] = useState("");
  const [goalBudgetInput, setGoalBudgetInput] = useState("");
  const [bucketInput, setBucketInput] = useState("");
  const [trackNameInput, setTrackNameInput] = useState("");
  const [entryDate, setEntryDate] = useState(todayISO());
  const [entryValue, setEntryValue] = useState("");
  const [draggedTask, setDraggedTask] = useState(null);
  const [draggedGoalBudgetId, setDraggedGoalBudgetId] = useState(null);
  const [now, setNow] = useState(new Date());
  const [timerDuration, setTimerDuration] = useState(DEFAULT_TIMER_SECONDS);
  const [timerRemaining, setTimerRemaining] = useState(DEFAULT_TIMER_SECONDS);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerDeadlineRef = useRef(null);
  const timerDisplayRef = useRef(null);
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!timerRunning) {
      timerDeadlineRef.current = null;
      return undefined;
    }
    timerDeadlineRef.current = Date.now() + timerRemaining * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((timerDeadlineRef.current - Date.now()) / 1000));
      setTimerRemaining(left);
      if (left === 0) setTimerRunning(false);
    }, 250);
    return () => clearInterval(id);
    // timerRemaining is intentionally omitted: the deadline is captured on start/resume
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  const toggleTimer = () => {
    if (!timerRunning && timerRemaining === 0) {
      setTimerRemaining(timerDuration);
      if (timerDuration === 0) return;
    }
    setTimerRunning((v) => !v);
  };

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerRemaining(timerDuration);
  };

  const daysLeftInYear = useMemo(() => {
    const t = todayISO();
    const yearEnd = `${new Date().getFullYear()}-12-31`;
    return Math.max(0, daysBetween(t, yearEnd));
  }, []);

  const monthRemaining = useMemo(() => {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    let diff = Math.max(0, monthEnd - now);
    const days = Math.floor(diff / 86400000);
    diff -= days * 86400000;
    const hours = Math.floor(diff / 3600000);
    diff -= hours * 3600000;
    const mins = Math.floor(diff / 60000);
    diff -= mins * 60000;
    const secs = Math.floor(diff / 1000);
    return { days, hours, mins, secs };
  }, [now]);

  const yearRemaining = useMemo(() => {
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    let diff = Math.max(0, yearEnd - now);
    const days = Math.floor(diff / 86400000);
    diff -= days * 86400000;
    const hours = Math.floor(diff / 3600000);
    diff -= hours * 3600000;
    const mins = Math.floor(diff / 60000);
    diff -= mins * 60000;
    const secs = Math.floor(diff / 1000);
    return { days, hours, mins, secs };
  }, [now]);

  const ageInfo = useMemo(() => {
    if (!dob) return null;
    const [by, bm, bd] = dob.split("-").map(Number);
    const t = todayISO();
    const [ty, tm, td] = t.split("-").map(Number);
    let age = ty - by;
    if (tm < bm || (tm === bm && td < bd)) age -= 1;
    const decadeStart = Math.floor(age / 10) * 10;
    const decadeEndAge = decadeStart + 10;
    const endDateISO = `${by + decadeEndAge}-${pad2(bm)}-${pad2(bd)}`;
    const daysLeft = Math.max(0, daysBetween(t, endDateISO));
    const weeksLeft = Math.ceil(daysLeft / 7);
    return { age, decadeStart, weeksLeft };
  }, [dob, now]);

  const saveDob = () => {
    if (!dobInput) return;
    setDob(dobInput);
    setCountdownMode("age");
    setDobModalOpen(false);
    save({ dob: dobInput, countdownMode: "age" });
  };

  const chooseCountdownMode = (mode) => {
    setCountdownMenuOpen(false);
    if (mode === "age" && !dob) {
      setDobInput("");
      setDobModalOpen(true);
      return;
    }
    setCountdownMode(mode);
    save({ countdownMode: mode });
  };

  useEffect(() => {
    (async () => {
      let data = {};
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) data = JSON.parse(res.value);
      } catch (e) {
        // no existing data yet
      }
      setHabits(data.habits || []);
      setCompletions(data.completions || {});
      setTargets(data.targets || []);
      setTracks(data.tracks || []);
      setTrackEntries(data.trackEntries || {});
      if ((data.tracks || []).length > 0) setSelectedTrackId(data.tracks[0].id);
      setTheme(data.theme === "light" ? "light" : "dark");
      setCountdownMode(data.countdownMode || "month");
      setDob(data.dob || null);

      setTodayTasks(data.todayTasks || []);
      setWeekTasks(data.weekTasks || []);
      setMonthTasks(data.monthTasks || []);
      setGoalBudgetItems(data.goalBudgetItems || []);
      setBucketListItems(data.bucketListItems || []);
      const savedTimer = clampTimer(Number(data.timerDuration) || DEFAULT_TIMER_SECONDS);
      setTimerDuration(savedTimer);
      setTimerRemaining(savedTimer);

      setLoaded(true);
    })();
  }, []);

  const save = useCallback(async (patch) => {
    try {
      const res = await storage.get(STORAGE_KEY).catch(() => null);
      const current = res && res.value ? JSON.parse(res.value) : {};
      const next = { ...current, ...patch };
      await storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("save failed", e);
    }
  }, []);

  const adjustTimer = useCallback(
    (unitSeconds, direction) => {
      if (timerRunning) return;
      const next = clampTimer(timerRemaining + unitSeconds * direction);
      setTimerRemaining(next);
      setTimerDuration(next);
      save({ timerDuration: next });
    },
    [timerRunning, timerRemaining, save]
  );

  // Wheel is registered as a passive listener by React, so it is bound manually
  // to keep the page from scrolling while a timer segment is being adjusted.
  useEffect(() => {
    const el = timerDisplayRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const segment = e.target.closest?.("[data-timer-unit]");
      if (!segment) return;
      e.preventDefault();
      adjustTimer(Number(segment.dataset.timerUnit), e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [adjustTimer, loaded, activePage, habits.length]);

  const isCleanupTime = useCallback(() => {
    const now = new Date();
    return now.getHours() === 23 && now.getMinutes() >= 59;
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!isCleanupTime()) return;
      setTodayTasks((prev) => prev.filter((task) => !task.done));
      setWeekTasks((prev) => prev.filter((task) => !task.done));
      setMonthTasks((prev) => prev.filter((task) => !task.done));
    };

    const id = setInterval(tick, 60000);
    tick();
    return () => clearInterval(id);
  }, [isCleanupTime]);

  // ---------- Habits ----------
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    save({ theme: next });
  };

  const addHabit = () => {
    const name = newName.trim();
    if (!name) return;
    const habit = { id: "h_" + Date.now(), name, color: PALETTE[habits.length % PALETTE.length], createdAt: todayISO() };
    const next = [...habits, habit];
    setHabits(next);
    setNewName("");
    setAddHabitOpen(false);
    save({ habits: next });
  };
  const removeHabit = (id) => {
    const next = habits.filter((h) => h.id !== id);
    const nextC = { ...completions };
    delete nextC[id];
    setHabits(next);
    setCompletions(nextC);
    save({ habits: next, completions: nextC });
  };
  const toggleDay = (habitId, iso) => {
    const set = new Set(completions[habitId] || []);
    if (set.has(iso)) set.delete(iso);
    else set.add(iso);
    const next = { ...completions, [habitId]: Array.from(set) };
    setCompletions(next);
    save({ completions: next });
  };

  // ---------- Targets ----------
  const addTarget = () => {
    const name = targetName.trim();
    if (!name || !targetDate) return;
    const next = [...targets, { id: "t_" + Date.now(), name, date: targetDate }].sort((a, b) => a.date.localeCompare(b.date));
    setTargets(next);
    setTargetName("");
    setTargetDate("");
    save({ targets: next });
  };
  const removeTarget = (id) => {
    const next = targets.filter((t) => t.id !== id);
    setTargets(next);
    save({ targets: next });
  };

  // ---------- Today tasks ----------
  const addTodayTask = () => {
    const text = todayInput.trim();
    if (!text) return;
    const next = [...todayTasks, { id: "tt_" + Date.now(), text, done: false, pinned: false }];
    setTodayTasks(next);
    setTodayInput("");
    save({ todayTasks: next, todayTasksDate: appDayISO() });
  };
  const toggleTodayTask = (id) => {
    const next = todayTasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    setTodayTasks(next);
    save({ todayTasks: next, todayTasksDate: appDayISO() });
  };
  const deleteTodayTask = (id) => {
    const next = todayTasks.filter((t) => t.id !== id);
    setTodayTasks(next);
    save({ todayTasks: next, todayTasksDate: appDayISO() });
  };
  const toggleTodayPin = (id) => {
    const next = todayTasks.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
    setTodayTasks(next);
    save({ todayTasks: next, todayTasksDate: appDayISO() });
  };

  // ---------- Week tasks ----------
  const addWeekTask = () => {
    const text = weekInput.trim();
    if (!text) return;
    const next = [...weekTasks, { id: "wt_" + Date.now(), text, done: false, pinned: false }];
    setWeekTasks(next);
    setWeekInput("");
    save({ weekTasks: next, weekTasksWeekStart: weekStartISO(appDayISO()) });
  };
  const toggleWeekTask = (id) => {
    const next = weekTasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    setWeekTasks(next);
    save({ weekTasks: next, weekTasksWeekStart: weekStartISO(appDayISO()) });
  };
  const deleteWeekTask = (id) => {
    const next = weekTasks.filter((t) => t.id !== id);
    setWeekTasks(next);
    save({ weekTasks: next, weekTasksWeekStart: weekStartISO(appDayISO()) });
  };
  const toggleWeekPin = (id) => {
    const next = weekTasks.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
    setWeekTasks(next);
    save({ weekTasks: next, weekTasksWeekStart: weekStartISO(appDayISO()) });
  };

  const reorderTasks = (listName, draggedId, targetId) => {
    if (!draggedId || !targetId || draggedId === targetId) return;

    const reorder = (items) => {
      const sourceIndex = items.findIndex((t) => t.id === draggedId);
      const targetIndex = items.findIndex((t) => t.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return items;
      const next = [...items];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    };

    if (listName === "today") {
      const next = reorder(todayTasks);
      setTodayTasks(next);
      save({ todayTasks: next, todayTasksDate: appDayISO() });
    }
    if (listName === "week") {
      const next = reorder(weekTasks);
      setWeekTasks(next);
      save({ weekTasks: next, weekTasksWeekStart: weekStartISO(appDayISO()) });
    }
    if (listName === "month") {
      const next = reorder(monthTasks);
      setMonthTasks(next);
      save({ monthTasks: next, monthTasksMonthStart: `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-01` });
    }
  };

  // ---------- Month tasks ----------
  const addMonthTask = () => {
    const text = monthInput.trim();
    if (!text) return;
    const next = [...monthTasks, { id: "mt_" + Date.now(), text, done: false, pinned: false }];
    setMonthTasks(next);
    setMonthInput("");
    save({ monthTasks: next, monthTasksMonthStart: `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-01` });
  };
  const toggleMonthTask = (id) => {
    const next = monthTasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    setMonthTasks(next);
    save({ monthTasks: next, monthTasksMonthStart: `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-01` });
  };
  const deleteMonthTask = (id) => {
    const next = monthTasks.filter((t) => t.id !== id);
    setMonthTasks(next);
    save({ monthTasks: next, monthTasksMonthStart: `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-01` });
  };
  const toggleMonthPin = (id) => {
    const next = monthTasks.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
    setMonthTasks(next);
    save({ monthTasks: next, monthTasksMonthStart: `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-01` });
  };

  // ---------- Goals & Budget ----------
  const addGoalBudgetItem = () => {
    const text = goalBudgetInput.trim();
    if (!text) return;
    const next = [...goalBudgetItems, { id: "gb_" + Date.now(), text, type: "goal", done: false }];
    setGoalBudgetItems(next);
    setGoalBudgetInput("");
    save({ goalBudgetItems: next });
  };
  const toggleGoalBudgetDone = (id) => {
    const next = goalBudgetItems.map((item) => (item.id === id ? { ...item, done: !item.done } : item));
    setGoalBudgetItems(next);
    save({ goalBudgetItems: next });
  };
  const deleteGoalBudgetItem = (id) => {
    const next = goalBudgetItems.filter((item) => item.id !== id);
    setGoalBudgetItems(next);
    save({ goalBudgetItems: next });
  };
  const reorderGoalBudgetItems = (draggedId, targetId) => {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const sourceIndex = goalBudgetItems.findIndex((item) => item.id === draggedId);
    const targetIndex = goalBudgetItems.findIndex((item) => item.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const next = [...goalBudgetItems];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setGoalBudgetItems(next);
    save({ goalBudgetItems: next });
  };

  const addBucketListItem = () => {
    const text = bucketInput.trim();
    if (!text) return;
    const next = [...bucketListItems, { id: "bucket_" + Date.now(), text, done: false }];
    setBucketListItems(next);
    setBucketInput("");
    save({ bucketListItems: next });
  };
  const toggleBucketListDone = (id) => {
    const next = bucketListItems.map((item) => (item.id === id ? { ...item, done: !item.done } : item));
    setBucketListItems(next);
    save({ bucketListItems: next });
  };
  const deleteBucketListItem = (id) => {
    const next = bucketListItems.filter((item) => item.id !== id);
    setBucketListItems(next);
    save({ bucketListItems: next });
  };
  const reorderBucketListItems = (draggedId, targetId) => {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const sourceIndex = bucketListItems.findIndex((item) => item.id === draggedId);
    const targetIndex = bucketListItems.findIndex((item) => item.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const next = [...bucketListItems];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setBucketListItems(next);
    save({ bucketListItems: next });
  };

  // ---------- Tracks ----------
  const addTrack = () => {
    const name = trackNameInput.trim();
    if (!name) return;
    const track = { id: "tr_" + Date.now(), name, color: PALETTE[tracks.length % PALETTE.length] };
    const next = [...tracks, track];
    setTracks(next);
    setTrackNameInput("");
    setSelectedTrackId(track.id);
    save({ tracks: next });
  };
  const removeTrack = (id) => {
    const next = tracks.filter((t) => t.id !== id);
    const nextEntries = { ...trackEntries };
    delete nextEntries[id];
    setTracks(next);
    setTrackEntries(nextEntries);
    if (selectedTrackId === id) setSelectedTrackId(next[0]?.id || null);
    save({ tracks: next, trackEntries: nextEntries });
  };
  const addTrackEntry = () => {
    if (!selectedTrackId) return;
    const val = parseFloat(entryValue);
    if (!entryDate || isNaN(val)) return;
    const existing = (trackEntries[selectedTrackId] || []).filter((e) => e.date !== entryDate);
    const nextForTrack = [...existing, { date: entryDate, value: val }].sort((a, b) => a.date.localeCompare(b.date));
    const next = { ...trackEntries, [selectedTrackId]: nextForTrack };
    setTrackEntries(next);
    setEntryValue("");
    save({ trackEntries: next });
  };

  // ---------- Derived: habits ----------
  const completionSets = useMemo(() => {
    const map = {};
    habits.forEach((h) => (map[h.id] = new Set(completions[h.id] || [])));
    return map;
  }, [habits, completions]);

  const habitStreak = (habitId) => {
    const set = completionSets[habitId];
    if (!set) return 0;
    let streak = 0;
    let cursor = todayISO();
    if (!set.has(cursor)) cursor = addDays(cursor, -1);
    while (set.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    return streak;
  };

  const dayCompletionCount = (iso) => habits.reduce((acc, h) => acc + (completionSets[h.id]?.has(iso) ? 1 : 0), 0);

  const currentStreak = useMemo(() => {
    if (habits.length === 0) return 0;
    const allDone = (iso) => habits.every((h) => completionSets[h.id]?.has(iso));
    let current = 0;
    let cursor = todayISO();
    if (!allDone(cursor)) cursor = addDays(cursor, -1);
    while (allDone(cursor)) {
      current++;
      cursor = addDays(cursor, -1);
    }
    return current;
  }, [habits, completionSets]);

  const todayProgress = useMemo(() => {
    if (habits.length === 0) return 0;
    const done = habits.filter((h) => completionSets[h.id]?.has(todayISO())).length;
    return Math.round((done / habits.length) * 100);
  }, [habits, completionSets]);

  const todayTaskProgress = useMemo(() => {
    if (todayTasks.length === 0) return 0;
    const done = todayTasks.filter((t) => t.done).length;
    return Math.round((done / todayTasks.length) * 100);
  }, [todayTasks]);

  const weekTaskProgress = useMemo(() => {
    if (weekTasks.length === 0) return 0;
    const done = weekTasks.filter((t) => t.done).length;
    return Math.round((done / weekTasks.length) * 100);
  }, [weekTasks]);

  const monthTaskProgress = useMemo(() => {
    if (monthTasks.length === 0) return 0;
    const done = monthTasks.filter((t) => t.done).length;
    return Math.round((done / monthTasks.length) * 100);
  }, [monthTasks]);

  const goalBudgetColumns = useMemo(() => {
    const goalItems = goalBudgetItems.filter((item) => item.type === "goal");
    const chunkSize = Math.max(1, Math.ceil(goalItems.length / 3));
    return Array.from({ length: 3 }, (_, index) => ({
      key: `goal-col-${index}`,
      title: "",
      color: "#8B5CF6",
      items: goalItems.slice(index * chunkSize, (index + 1) * chunkSize),
    }));
  }, [goalBudgetItems]);

  const bucketListColumns = useMemo(() => {
    const chunkSize = Math.max(1, Math.ceil(bucketListItems.length / 3));
    return Array.from({ length: 3 }, (_, index) => ({
      key: `bucket-col-${index}`,
      title: "",
      color: "#8B5CF6",
      items: bucketListItems.slice(index * chunkSize, (index + 1) * chunkSize),
    }));
  }, [bucketListItems]);

  const hoveredHabit = habits.find((h) => h.id === hoveredHabitId) || null;
  const currentStreakDisplay = hoveredHabit ? habitStreak(hoveredHabit.id) : currentStreak;
  const timerParts = splitDuration(timerRemaining);

  const donutData = useMemo(
    () => habits.map((h) => ({ name: h.name, value: (completions[h.id] || []).length, color: h.color })).filter((d) => d.value > 0),
    [habits, completions]
  );

  // ---------- Heatmap (continuous week columns, Sun-Sat rows) ----------
  const heatmapStart = useMemo(() => {
    const t = todayISO();
    const dow = parseISO(t).getDay();
    const thisSunday = addDays(t, -dow);
    return addDays(thisSunday, -7 * (HEATMAP_WEEKS - 1));
  }, []);

  const heatmapWeeks = useMemo(() => {
    const weeks = [];
    for (let w = 0; w < HEATMAP_WEEKS; w++) {
      const weekStart = addDays(heatmapStart, w * 7);
      const days = Array.from({ length: 7 }, (_, d) => addDays(weekStart, d));
      weeks.push({ weekStart, days });
    }
    return weeks;
  }, [heatmapStart]);

  const monthLabels = useMemo(() => {
    let lastMonth = null;
    return heatmapWeeks.map((wk) => {
      const m = parseISO(wk.days[0]).getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        return parseISO(wk.days[0]).toLocaleString("en-US", { month: "short" });
      }
      return null;
    });
  }, [heatmapWeeks]);

  const maxHabitsForColor = Math.max(habits.length, 1);
  const isDark = theme === "dark";
  const themeBg = isDark ? BG_DARK : BG_LIGHT;
  const heatmapScale = useMemo(
    () => scaleFor(hoveredHabit ? hoveredHabit.color : HEATMAP_BASE, themeBg),
    [hoveredHabit, isDark]
  );

  const cellColor = (iso) => {
    if (iso > todayISO()) return "transparent";
    const value = hoveredHabit ? (completionSets[hoveredHabit.id]?.has(iso) ? 1 : 0) : dayCompletionCount(iso);
    if (!value) return CELL_EMPTY;
    if (hoveredHabit) return heatmapScale[3];
    const ratio = value / maxHabitsForColor;
    if (ratio >= 1) return heatmapScale[3];
    if (ratio >= 0.66) return heatmapScale[2];
    if (ratio >= 0.33) return heatmapScale[1];
    return heatmapScale[0];
  };

  // ---------- Targets ----------
  const targetStatus = (t) => {
    const diff = daysBetween(todayISO(), t.date);
    if (diff < 0) return { label: "Passed", tone: "past" };
    if (diff === 0) return { label: "Today", tone: "urgent" };
    if (diff <= 7) return { label: `${diff} day${diff === 1 ? "" : "s"} remaining`, tone: "urgent" };
    if (diff <= 30) return { label: `${diff} days remaining`, tone: "soon" };
    return { label: `${diff} days remaining`, tone: "far" };
  };
  const toneColors = isDark
    ? {
        urgent: { bg: "#000000", text: "#E8917C", bar: "#E2624A" },
        soon: { bg: "#000000", text: "#E8C87A", bar: "#DDBA4A" },
        far: { bg: "#000000", text: "#8FD1A8", bar: "#5A9370" },
        past: { bg: "#000000", text: "var(--text-muted)", bar: "#5C5847" },
      }
    : {
        urgent: { bg: "#F7E4DE", text: "#9C4426", bar: "#C1502B" },
        soon: { bg: "#FBF0D6", text: "#8A6A0F", bar: "#C9A227" },
        far: { bg: "#E4EEE6", text: "#2F5B3F", bar: "#3F6C51" },
        past: { bg: "#EAE8E0", text: "var(--text-muted)", bar: "#B4AF9C" },
      };

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) || null;
  const selectedTrackData = useMemo(() => {
    if (!selectedTrack) return [];
    return (trackEntries[selectedTrack.id] || []).slice(-30).map((e) => ({ ...e, label: fmtShort(e.date) }));
  }, [selectedTrack, trackEntries]);

  if (!loaded) return <div style={{ padding: "2rem", fontFamily: "Inter, sans-serif" }}>Loading…</div>;

  const themeVars = isDark
    ? {
        "--page-bg": "#000000",
        "--card-bg": "#000000",
        "--text": "#F3F0E6",
        "--text-muted": "#A69F8C",
        "--border": "#3A382F",
        "--border-strong": "#4A483C",
        "--subtle-bg": "#000000",
        "--hover-bg": "#000000",
        "--segment-empty-bg": "#000000",
        "--segment-dot": "#5C5847",
        "--cell-empty": "#333330",
      }
    : {
        "--page-bg": "#FAF7EF",
        "--card-bg": "#FFFFFC",
        "--text": "#2B2A25",
        "--text-muted": "#8A8672",
        "--border": "#E7E2D3",
        "--border-strong": "#D8D2C0",
        "--subtle-bg": "#F0EDE2",
        "--hover-bg": "#F5F2E7",
        "--segment-empty-bg": "#F3F0E6",
        "--segment-dot": "#C7C2AE",
        "--cell-empty": "#E7E3D8",
      };

  return (
    <div
      className="ht-root-padding"
      style={{
        fontFamily: "'Inter', sans-serif",
        background: "var(--page-bg)",
        color: "var(--text)",
        padding: "2rem",
        borderRadius: "16px",
        maxWidth: "1440px",
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box",
        overflowX: "hidden",
        transition: "background 0.15s, color 0.15s",
        ...themeVars,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');
        .app-dashboard { padding: 1rem; box-sizing: border-box; width: 100%; max-width: 100vw; overflow-x: hidden; }
        html, body, #root { margin: 0; padding: 0; overflow-x: hidden; max-width: 100vw; background: ${isDark ? "#000000" : "#FAF7EF"}; }
        #root { width: 100%; }
        .app-dashboard { background: ${isDark ? "#000000" : "#FAF7EF"} !important; }
        @media (max-width: 768px) {
          .app-dashboard { padding: 0; }
        }
        .ht-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; min-width: 0; }
        .ht-btn { border: 1px solid var(--text); background: transparent; color: var(--text); border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: 'Inter', sans-serif; }
        .ht-btn:hover { background: var(--text); color: var(--page-bg); }
        .ht-input { border: 1px solid var(--border-strong); border-radius: 8px; padding: 8px 12px; font-size: 14px; font-family: 'Inter', sans-serif; background: var(--card-bg); color: var(--text); width: 100%; box-sizing: border-box; }
        .ht-input[type="date"] { color-scheme: ${isDark ? "dark" : "light"}; }
        .ht-input[type="date"]::-webkit-calendar-picker-indicator {
          cursor: pointer;
          opacity: 1;
          width: 18px;
          height: 18px;
          ${isDark
            ? `background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23FFFFFF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E") center / 16px 16px no-repeat;
               filter: none;`
            : ""}
        }
        .ht-input:focus { outline: 2px solid #3F6C51; }
        .ht-task { display: flex; align-items: center; gap: 8px; padding: 7px 2px; border-bottom: 1px solid var(--subtle-bg); min-width: 0; width: 100%; box-sizing: border-box; }
        .ht-task:last-child { border-bottom: none; }
        .ht-task.dragging { opacity: 0.45; }
        .ht-task-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
        .ht-task-add-row { display: flex; gap: 6px; margin-bottom: 8px; min-width: 0; width: 100%; }
        .ht-task-add-row .ht-input { flex: 1; min-width: 0; width: auto; }
        .ht-task-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; gap: 8px; min-width: 0; }
        .ht-task-section { min-width: 0; overflow: hidden; }
        .ht-task-progress { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .ht-task-delete { border: none; background: none; color: #B7563C; cursor: pointer; font-size: 13px; flex-shrink: 0; padding: 0 2px; line-height: 1; }
        .ht-check { width: 18px; height: 18px; border-radius: 5px; border: 2px solid #3F6C51; cursor: pointer; flex-shrink: 0; display:flex; align-items:center; justify-content:center; background: var(--card-bg); }
        .ht-check.done { background: #3F6C51; }
        .ht-pin { border: none; background: none; cursor: pointer; font-size: 15px; font-weight: 700; color: var(--segment-dot); flex-shrink: 0; line-height: 1; }
        .ht-pin.active { color: #3B82F6; }
        .ht-card ::-webkit-scrollbar { width: 6px; }
        .ht-card ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 999px; }
        .ht-card ::-webkit-scrollbar-track { background: transparent; }
        .ht-track-btn { border: 1px solid var(--border-strong); background: var(--card-bg); color: var(--text); border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer; font-family: 'Inter', sans-serif; white-space: nowrap; }
        .ht-track-btn.active { color: #FFFFFC; border-color: transparent; }
        .ht-theme-toggle { border: 1px solid var(--border-strong); background: var(--card-bg); color: var(--text); border-radius: 999px; width: 36px; height: 36px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ht-logout-btn { border: 1px solid var(--border-strong); background: var(--card-bg); color: var(--text); border-radius: 999px; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ht-nav-icon { border: none; background: none; color: var(--text-muted); cursor: pointer; padding: 4px 2px 8px; display: flex; align-items: center; justify-content: center; border-bottom: 2.5px solid transparent; }
        .ht-nav-icon.active { color: var(--text); border-bottom-color: var(--text); }
        .ht-mobile-tabs { display: none; gap: 6px; margin-bottom: 16px; background: var(--subtle-bg); padding: 4px; border-radius: 10px; }
        .ht-mobile-tab-btn { flex: 1; border: none; background: transparent; color: var(--text-muted); font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; padding: 9px 6px; border-radius: 8px; cursor: pointer; }
        .ht-mobile-tab-btn.active { background: var(--card-bg); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
        .ht-header-actions { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
        .ht-header-date { text-align: right; flex-shrink: 0; }
        .ht-header-mobile-theme { display: none; }
        .ht-header-desktop-theme { display: flex; }
        .ht-main-grid { min-width: 0; }
        .ht-col { min-width: 0; }
        .ht-col-task { min-width: 0; overflow: hidden; box-sizing: border-box; }
        .ht-heatmap-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; padding-bottom: 4px; }
        .ht-heatmap-scroll::-webkit-scrollbar { height: 5px; }
        .ht-heatmap-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 999px; }
        .ht-heatmap-inner { display: flex; gap: 6px; width: max-content; }
        .ht-track-form { display: flex; gap: 6px; margin-bottom: 14px; max-width: 360px; width: 100%; }
        .ht-track-entry-row { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
        .ht-track-entry-row .ht-input-date { width: 150px; flex: 1 1 140px; min-width: 0; }
        .ht-track-entry-row .ht-input-value { width: 120px; flex: 1 1 100px; min-width: 0; }
        .ht-goals-shell { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
        .ht-goal-col { min-width: 0; background: transparent; border: none; border-radius: 0; padding: 0; }
        .ht-goal-list { display: grid; gap: 8px; }
        .ht-goal-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border: none; border-radius: 0; background: transparent; cursor: grab; }
        .ht-goal-item.dragging { opacity: 0.5; }
        .ht-goal-item .ht-goal-text { flex: 1; min-width: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ht-goal-toggle { width: 18px; height: 18px; border-radius: 5px; border: 2px solid currentColor; display: flex; align-items: center; justify-content: center; background: transparent; color: inherit; cursor: pointer; flex-shrink: 0; }
        .ht-goal-toggle.done { background: currentColor; border-color: currentColor; }
        .ht-goal-toggle.done span { color: #FFFFFC; font-size: 11px; }
        .ht-goal-delete { border: none; background: none; color: transparent; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; opacity: 0; transition: opacity 0.15s ease, color 0.15s ease; }
        .ht-goal-item:hover .ht-goal-delete,
        .ht-goal-item:focus-within .ht-goal-delete { opacity: 1; color: #D92D20; }
        .ht-goal-delete:hover { color: #B42318; }
        @media (max-width: 768px) {
          .ht-root-padding { padding: 1rem 1rem 1.5rem !important; border-radius: 0 !important; }
          .ht-header-row { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; margin-bottom: 1rem !important; }
          .ht-header-title-row { display: flex; align-items: center; justify-content: space-between; width: 100%; }
          .ht-header-title-row h1 { font-size: 26px !important; }
          .ht-header-actions { flex-wrap: wrap; width: 100%; gap: 10px !important; }
          .ht-header-date { text-align: left; flex: 1 1 100%; order: 3; padding-top: 2px; }
          .ht-header-mobile-theme { display: flex !important; }
          .ht-header-desktop-theme { display: none !important; }
          .ht-mobile-tabs { display: flex !important; }
          .ht-main-grid { grid-template-columns: 1fr !important; gap: 16px !important; width: 100%; }
          .ht-col { display: none !important; }
          .ht-col.ht-col-active { display: block !important; width: 100%; max-width: 100%; }
          .ht-col-target, .ht-col-task { position: static !important; top: auto !important; }
          .ht-col-task { width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; box-sizing: border-box !important; }
          .ht-root-padding { width: 100% !important; max-width: 100vw !important; }
          .ht-task-section-head { flex-wrap: wrap; }
          .ht-task { gap: 6px; padding: 7px 0; }
          .ht-habit-grid { grid-template-columns: 1fr !important; }
          .ht-stats-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
          .ht-stats-grid > div { padding: 0.85rem 1rem !important; }
          .ht-stats-grid > div > div:first-child { font-size: 11px !important; }
          .ht-stats-grid > div > div:last-child { font-size: 22px !important; }
          .ht-track-form { max-width: 100% !important; flex-wrap: wrap; }
          .ht-track-entry-row .ht-input-date,
          .ht-track-entry-row .ht-input-value { width: 100% !important; flex: 1 1 100% !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .ht-main-grid { grid-template-columns: 220px minmax(0, 1fr) 240px !important; gap: 16px !important; }
          .ht-stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        }
      `}</style>

      <div className="ht-header-row" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", gap: "16px" }}>
        <div className="ht-header-title-row">
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "32px", margin: 0 }}>Habit</h1>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                className={`ht-nav-icon ${activePage === "main" ? "active" : ""}`}
                onClick={() => setActivePage("main")}
                aria-label="Main page"
                title="Main page"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11.5 12 4l9 7.5" />
                  <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
                </svg>
              </button>
              <button
                className={`ht-nav-icon ${activePage === "track" ? "active" : ""}`}
                onClick={() => setActivePage("track")}
                aria-label="Track page"
                title="Track"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17 9 11l4 4 8-8" />
                  <path d="M15 7h6v6" />
                </svg>
              </button>
            </div>
          </div>
          <button
            className="ht-theme-toggle ht-header-mobile-theme"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4.5"/><g stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.5" y2="4.5"/></g></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A9 9 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1z"/></svg>
            )}
          </button>
        </div>
        <div className="ht-header-actions">
          <button className="ht-btn" style={{ flexShrink: 0 }} onClick={() => setAddHabitOpen(true)}>+ Add Habit</button>
          <button
            className="ht-theme-toggle ht-header-desktop-theme"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4.5"/><g stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.5" y2="4.5"/></g></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A9 9 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1z"/></svg>
            )}
          </button>
          <div className="ht-header-date" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              className="ht-logout-btn"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
            <div>
              <span style={{ display: "block", fontSize: "13px", color: "var(--text-muted)" }}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
              <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                {daysLeftInYear} days left in {new Date().getFullYear()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {activePage === "main" && (
      <>
      <div className="ht-mobile-tabs">
        <button className={`ht-mobile-tab-btn ${mobileTab === "habit" ? "active" : ""}`} onClick={() => setMobileTab("habit")}>Habits</button>
        <button className={`ht-mobile-tab-btn ${mobileTab === "task" ? "active" : ""}`} onClick={() => setMobileTab("task")}>Tasks</button>
        <button className={`ht-mobile-tab-btn ${mobileTab === "target" ? "active" : ""}`} onClick={() => setMobileTab("target")}>Set target</button>
      </div>
      <div className="ht-main-grid" style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr) 280px", gap: "20px", alignItems: "start" }}>
        {/* LEFT: Set target panel + month countdown */}
        <div className={`ht-col ht-col-target ${mobileTab === "target" ? "ht-col-active" : ""}`} style={{ display: "grid", gap: "16px", position: "sticky", top: "1rem" }}>
        <div className="ht-card" style={{ padding: "1.1rem" }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: "17px", fontWeight: 600, marginBottom: "10px" }}>Set target</div>
          <div style={{ display: "grid", gap: "8px", marginBottom: "14px" }}>
            <input className="ht-input" placeholder="e.g. AWS exam" value={targetName} onChange={(e) => setTargetName(e.target.value)} />
            <input className="ht-input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            <button className="ht-btn" style={{ width: "100%" }} onClick={addTarget}>+ Add target</button>
          </div>
          {targets.length === 0 ? (
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>No targets yet. Add a deadline to see a live countdown.</div>
          ) : (
            <div style={{ display: "grid", gap: "10px", maxHeight: "176px", overflowY: "auto", paddingRight: "4px" }}>
              {targets.map((t) => {
                const status = targetStatus(t);
                const colors = toneColors[status.tone];
                return (
                  <div key={t.id} style={{ background: colors.bg, borderRadius: "10px", padding: "10px 12px", position: "relative" }}>
                    <button onClick={() => removeTarget(t.id)} aria-label={`Delete target ${t.name}`} style={{ position: "absolute", top: 6, right: 8, border: "none", background: "none", color: colors.text, opacity: 0.6, cursor: "pointer", fontSize: "12px" }}>×</button>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: colors.text, paddingRight: "14px" }}>{t.name}</div>
                    <div style={{ fontSize: "11px", color: colors.text, opacity: 0.75, marginBottom: "6px" }}>
                      {parseISO(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "18px", color: colors.bar }}>{status.label}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live "left in" countdown */}
        <div className="ht-card" style={{ padding: "1.1rem", position: "relative" }}>
          <button
            aria-label="More options"
            onClick={() => setCountdownMenuOpen((v) => !v)}
            style={{
              position: "absolute", top: "10px", right: "10px", width: 26, height: 26, borderRadius: "50%",
              border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", letterSpacing: "1px",
            }}
          >
            •••
          </button>

          {countdownMenuOpen && (
            <>
              <div onClick={() => setCountdownMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 900 }} />
              <div
                className="ht-card"
                style={{ position: "absolute", top: "40px", right: "10px", zIndex: 901, padding: "6px", minWidth: "110px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}
              >
                {[
                  ["month", "Month"],
                  ["year", "Year"],
                  ["age", "Age"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => chooseCountdownMode(mode)}
                    style={{
                      display: "block", width: "100%", textAlign: "left", border: "none",
                      background: countdownMode === mode ? "var(--hover-bg)" : "transparent",
                      color: "var(--text)", padding: "7px 10px", borderRadius: "6px", fontSize: "13px", cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ fontFamily: "'Fraunces', serif", fontSize: "15px", fontWeight: 600, marginBottom: "12px", paddingRight: "30px" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>

          {countdownMode === "age" ? (
            ageInfo ? (
              <div>
                <div style={{ border: "1.5px solid var(--text)", borderRadius: "12px", background: "var(--card-bg)", padding: "18px 10px", textAlign: "center", marginBottom: "10px" }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: "30px", fontWeight: 700, color: "var(--text)" }}>{ageInfo.weeksLeft}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>weeks left in your {ageInfo.decadeStart}s</div>
                </div>
                <button
                  onClick={() => { setDobInput(dob); setDobModalOpen(true); }}
                  style={{ border: "none", background: "none", color: "var(--text-muted)", fontSize: "11px", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                >
                  Change date of birth
                </button>
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                <button
                  onClick={() => { setDobInput(""); setDobModalOpen(true); }}
                  style={{ border: "none", background: "none", color: "#3F6C51", cursor: "pointer", textDecoration: "underline", fontSize: "13px", padding: 0 }}
                >
                  Set your date of birth
                </button>{" "}
                to see this.
              </div>
            )
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "8px" }}>
                {[
                  ["days", (countdownMode === "year" ? yearRemaining : monthRemaining).days, true],
                  ["hours", (countdownMode === "year" ? yearRemaining : monthRemaining).hours, false],
                  ["mins", (countdownMode === "year" ? yearRemaining : monthRemaining).mins, false],
                ].map(([label, value, tinted]) => (
                  <div
                    key={label}
                    style={{
                      border: "1.5px solid var(--text)",
                      borderRadius: "12px",
                      background: tinted && !isDark ? "#E7F3E5" : "var(--card-bg)",
                      padding: "10px 4px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 700, color: tinted && !isDark ? "#1F3A28" : "var(--text)" }}>{value}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ border: "1.5px solid var(--text)", borderRadius: "12px", background: "var(--card-bg)", padding: "10px 4px", textAlign: "center", width: "72px", flexShrink: 0 }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: "22px", fontWeight: 700 }}>{(countdownMode === "year" ? yearRemaining : monthRemaining).secs}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>secs</div>
                </div>
                <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.3 }}>
                  Left in<br />{countdownMode === "year" ? "This Year" : "This Month"}
                </div>
              </div>
            </>
          )}
        </div>
        </div>

        {/* CENTER: main tracker content */}
        <div className={`ht-col ht-col-habit ${mobileTab === "habit" ? "ht-col-active" : ""}`}>
          {habits.length === 0 ? (
            <div className="ht-card" style={{ padding: "1.25rem", marginBottom: "1.5rem", color: "var(--text-muted)", fontSize: "14px" }}>
              No habits yet.{" "}
              <button onClick={() => setAddHabitOpen(true)} style={{ border: "none", background: "none", color: "#3F6C51", cursor: "pointer", textDecoration: "underline", fontSize: "14px" }}>
                Add your first one.
              </button>
            </div>
          ) : (
            <div className="ht-card" style={{ padding: "1rem 1.1rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", marginBottom: "10px", flexWrap: "wrap" }}>
                <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "13px", background: "var(--subtle-bg)", display: "inline-block", padding: "3px 8px", borderRadius: "5px" }}>
                  Habit List
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ display: "flex", gap: "2px" }}>
                    {Array.from({ length: 6 }).map((_, i) => {
                      const filled = i < Math.round((todayProgress / 100) * 6);
                      return (
                        <div
                          key={i}
                          style={{
                            width: "16px", height: "13px",
                            borderRadius: i === 0 ? "3px 0 0 3px" : i === 5 ? "0 3px 3px 0" : "0",
                            background: filled ? "var(--text)" : "radial-gradient(var(--segment-dot) 1px, transparent 1.2px)",
                            backgroundColor: filled ? "var(--text)" : "var(--segment-empty-bg)",
                            backgroundSize: filled ? undefined : "4px 4px",
                          }}
                        />
                      );
                    })}
                  </div>
                  <span style={{ fontSize: "13px", color: "var(--text)", fontWeight: 600 }}>{todayProgress}%</span>
                </div>
              </div>
              <div style={{ borderBottom: "1px solid var(--border)", marginBottom: "6px" }} />
              <div className="ht-habit-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "2px 12px" }}>
                {habits.map((h) => {
                  const doneToday = completionSets[h.id]?.has(todayISO());
                  return (
                    <div
                      key={h.id}
                      onMouseEnter={() => setHoveredHabitId(h.id)}
                      onMouseLeave={() => setHoveredHabitId(null)}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px", padding: "8px 4px",
                        borderRadius: "8px",
                        background: hoveredHabitId === h.id ? "var(--hover-bg)" : "transparent",
                      }}
                    >
                      <button
                        onClick={() => toggleDay(h.id, todayISO())}
                        aria-label={doneToday ? `Mark ${h.name} not done today` : `Mark ${h.name} done today`}
                        style={{
                          width: 18, height: 18, borderRadius: "5px", border: "2px solid #3B82F6",
                          background: doneToday ? "#3B82F6" : "transparent", cursor: "pointer", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {doneToday && <span style={{ color: "#FFFFFC", fontSize: "11px" }}>✓</span>}
                      </button>
                      <span style={{ flex: 1, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                      <button onClick={() => setDeleteHabitId(h.id)} aria-label={`Delete ${h.name}`} style={{ border: "none", background: "none", color: "#B7563C", cursor: "pointer", fontSize: "13px", flexShrink: 0 }}>×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="ht-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "1.5rem" }}>
            <div className="ht-card" style={{ padding: "1rem" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>Active habits</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "24px", fontWeight: 600 }}>{habits.length}</div>
            </div>
            <div className="ht-card" style={{ padding: "1rem" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>{hoveredHabit ? `Current streak — ${hoveredHabit.name}` : "Current streak"}</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "24px", fontWeight: 600 }}>{currentStreakDisplay}d</div>
            </div>
            <div className="ht-card" style={{ padding: "1rem" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>Timer</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                <div
                  ref={timerDisplayRef}
                  style={{ fontFamily: "'Fraunces', serif", fontSize: "24px", fontWeight: 600, display: "flex", alignItems: "baseline", userSelect: "none" }}
                  title={timerRunning ? "Stop the timer to change it" : "Scroll over hours, minutes or seconds to set the timer"}
                >
                  {[
                    ["hours", 3600, timerParts.hours],
                    ["minutes", 60, timerParts.mins],
                    ["seconds", 1, timerParts.secs],
                  ].map(([label, unit, value], i) => (
                    <span key={label} style={{ display: "flex", alignItems: "baseline" }}>
                      {i > 0 && <span style={{ padding: "0 2px" }}>:</span>}
                      <span
                        role="spinbutton"
                        tabIndex={0}
                        aria-label={`Timer ${label}`}
                        aria-valuenow={value}
                        data-timer-unit={unit}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp") { e.preventDefault(); adjustTimer(unit, 1); }
                          if (e.key === "ArrowDown") { e.preventDefault(); adjustTimer(unit, -1); }
                        }}
                        style={{
                          padding: "0 3px", borderRadius: "5px", cursor: timerRunning ? "default" : "ns-resize",
                          background: timerRunning ? "transparent" : "var(--subtle-bg)",
                        }}
                      >
                        {pad2(value)}
                      </span>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={toggleTimer}
                    aria-label={timerRunning ? "Stop timer" : "Start timer"}
                    style={{
                      border: "1px solid var(--border-strong)", background: "var(--card-bg)", color: "var(--text)",
                      borderRadius: "6px", padding: "4px 10px", fontSize: "12px", cursor: "pointer",
                    }}
                  >
                    {timerRunning ? "Stop" : "Start"}
                  </button>
                  <button
                    onClick={resetTimer}
                    aria-label="Reset timer"
                    style={{
                      border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)",
                      borderRadius: "6px", padding: "4px 10px", fontSize: "12px", cursor: "pointer",
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: "1.5rem", minWidth: 0 }}>
            <div className="ht-card" style={{ padding: "1rem", minWidth: 0 }}>
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "10px" }}>
                Streak calendar{hoveredHabit ? ` — ${hoveredHabit.name}` : ""}
              </div>
              <div className="ht-heatmap-scroll">
              <div className="ht-heatmap-inner">
                <div style={{ display: "grid", gridTemplateRows: "repeat(7, 10px)", gap: "2px", fontSize: "9px", color: "var(--text-muted)", marginTop: "16px", flexShrink: 0 }}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} style={{ height: 10, lineHeight: "10px" }}>{d}</div>
                  ))}
                </div>
                <div>
                  <div style={{ position: "relative", height: 14, marginBottom: "4px", width: HEATMAP_WEEKS * 12 }}>
                    {monthLabels.map((label, i) =>
                      label ? (
                        <span key={i} style={{ position: "absolute", left: i * 12, fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{label}</span>
                      ) : null
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateRows: "repeat(7, 10px)", gridAutoFlow: "column", gap: "2px" }}>
                    {heatmapWeeks.flatMap((wk) =>
                      wk.days.map((iso) => (
                        <div
                          key={iso}
                          title={hoveredHabit ? `${iso}${completionSets[hoveredHabit.id]?.has(iso) ? " · done" : ""}` : `${iso} · ${dayCompletionCount(iso)}/${habits.length} habits`}
                          style={{ width: 10, height: 10, borderRadius: 2, background: cellColor(iso) }}
                        />
                      ))
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "4px", marginTop: "8px", fontSize: "10px", color: "var(--text-muted)" }}>
                    Less
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: CELL_EMPTY }} />
                    {heatmapScale.map((c, i) => (
                      <span key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                    ))}
                    More
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>

          <div className="ht-card" style={{ padding: "1rem", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "17px", fontWeight: 600, color: "#8B5CF6" }}>Goals</div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="ht-input"
                  placeholder="Add item…"
                  value={goalBudgetInput}
                  onChange={(e) => setGoalBudgetInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addGoalBudgetItem()}
                  style={{ width: "220px" }}
                />
              </div>
            </div>

            <div className="ht-goals-shell">
              {goalBudgetColumns.map((column) => (
                <div key={column.key} className="ht-goal-col">
                  {column.title ? (
                    <div style={{ fontSize: "12px", fontWeight: 700, color: column.color, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>
                      {column.title}
                    </div>
                  ) : null}
                  <div className="ht-goal-list">
                    {column.items.map((item) => (
                      <div
                        key={item.id}
                        className={`ht-goal-item ${draggedGoalBudgetId === item.id ? "dragging" : ""}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          setDraggedGoalBudgetId(item.id);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          reorderGoalBudgetItems(draggedGoalBudgetId, item.id);
                          setDraggedGoalBudgetId(null);
                        }}
                        onDragEnd={() => setDraggedGoalBudgetId(null)}
                        style={{ color: column.color }}
                      >
                        <button
                          className={`ht-goal-toggle ${item.done ? "done" : ""}`}
                          onClick={() => toggleGoalBudgetDone(item.id)}
                          aria-label={item.done ? "Mark item as not done" : "Mark item as done"}
                          style={{ color: column.color }}
                        >
                          {item.done && <span>✓</span>}
                        </button>
                        <span className="ht-goal-text" style={{ textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--text-muted)" : "var(--text)" }}>{item.text}</span>
                        <button onClick={() => deleteGoalBudgetItem(item.id)} className="ht-goal-delete" aria-label="Delete item">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ht-card" style={{ padding: "1rem", minWidth: 0, marginTop: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "17px", fontWeight: 600, color: "#C9A227" }}>Bucket List</div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="ht-input"
                  placeholder="Add item…"
                  value={bucketInput}
                  onChange={(e) => setBucketInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addBucketListItem()}
                  style={{ width: "220px" }}
                />
              </div>
            </div>

            <div className="ht-goals-shell">
              {bucketListColumns.map((column) => (
                <div key={column.key} className="ht-goal-col">
                  {column.title ? (
                    <div style={{ fontSize: "12px", fontWeight: 700, color: column.color, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>
                      {column.title}
                    </div>
                  ) : null}
                  <div className="ht-goal-list">
                    {column.items.map((item) => (
                      <div
                        key={item.id}
                        className={`ht-goal-item ${draggedGoalBudgetId === item.id ? "dragging" : ""}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          setDraggedGoalBudgetId(item.id);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          reorderBucketListItems(draggedGoalBudgetId, item.id);
                          setDraggedGoalBudgetId(null);
                        }}
                        onDragEnd={() => setDraggedGoalBudgetId(null)}
                        style={{ color: column.color }}
                      >
                        <button
                          className={`ht-goal-toggle ${item.done ? "done" : ""}`}
                          onClick={() => toggleBucketListDone(item.id)}
                          aria-label={item.done ? "Mark item as not done" : "Mark item as done"}
                          style={{ color: "#C9A227" }}
                        >
                          {item.done && <span>✓</span>}
                        </button>
                        <span className="ht-goal-text" style={{ textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--text-muted)" : "var(--text)" }}>{item.text}</span>
                        <button onClick={() => deleteBucketListItem(item.id)} className="ht-goal-delete" aria-label="Delete item">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Today / Weekly tasks panel */}
        <div className={`ht-card ht-col ht-col-task ${mobileTab === "task" ? "ht-col-active" : ""}`} style={{ padding: "1.1rem", position: "sticky", top: "1rem" }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: "17px", fontWeight: 600, marginBottom: "12px" }}>Tasks</div>

          <div className="ht-task-section" style={{ marginBottom: "18px" }}>
            <div className="ht-task-section-head">
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#3F6C51", textTransform: "uppercase", letterSpacing: "0.04em" }}>Today</div>
              <div className="ht-task-progress">
                <div style={{ display: "flex", gap: "2px" }}>
                  {Array.from({ length: 5 }).map((_, i) => {
                    const filled = i < Math.round((todayTaskProgress / 100) * 5);
                    return (
                      <div
                        key={i}
                        style={{
                          width: "12px", height: "10px",
                          borderRadius: i === 0 ? "3px 0 0 3px" : i === 4 ? "0 3px 3px 0" : "0",
                          background: filled ? "#3F6C51" : "radial-gradient(var(--segment-dot) 1px, transparent 1.2px)",
                          backgroundColor: filled ? "#3F6C51" : "var(--segment-empty-bg)",
                          backgroundSize: filled ? undefined : "4px 4px",
                        }}
                      />
                    );
                  })}
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>{todayTaskProgress}%</span>
              </div>
            </div>
            <div className="ht-task-add-row">
              <input className="ht-input" placeholder="Add a task…" value={todayInput} onChange={(e) => setTodayInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTodayTask()} />
              <button className="ht-btn" style={{ flexShrink: 0, padding: "8px 10px" }} onClick={addTodayTask}>+</button>
            </div>
            {todayTasks.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No active tasks yet.</div>
            ) : (
              <div>
                {todayTasks.map((t) => (
                  <div
                    key={t.id}
                    className={`ht-task ${draggedTask?.id === t.id ? "dragging" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedTask({ list: "today", id: t.id });
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedTask?.list === "today") {
                        reorderTasks("today", draggedTask.id, t.id);
                      }
                      setDraggedTask(null);
                    }}
                    onDragEnd={() => setDraggedTask(null)}
                  >
                    <div className={`ht-check ${t.done ? "done" : ""}`} onClick={() => toggleTodayTask(t.id)}>
                      {t.done && <span style={{ color: "#FFFFFC", fontSize: "12px" }}>✓</span>}
                    </div>
                    <span className="ht-task-text" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-muted)" : "var(--text)" }}>{t.text}</span>
                    <button
                      className={`ht-pin ${t.pinned ? "active" : ""}`}
                      onClick={() => toggleTodayPin(t.id)}
                      aria-label={t.pinned ? "Stop pinning this task" : "Pin this task to keep it active"}
                      title={t.pinned ? "Unpin task" : "Pin this task to keep it active"}
                    >
                      ∞
                    </button>
                    <button onClick={() => deleteTodayTask(t.id)} aria-label="Delete task" className="ht-task-delete">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ht-task-section" style={{ marginBottom: "18px" }}>
            <div className="ht-task-section-head">
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#C9A227", textTransform: "uppercase", letterSpacing: "0.04em" }}>This week</div>
              <div className="ht-task-progress">
                <div style={{ display: "flex", gap: "2px" }}>
                  {Array.from({ length: 5 }).map((_, i) => {
                    const filled = i < Math.round((weekTaskProgress / 100) * 5);
                    return (
                      <div
                        key={i}
                        style={{
                          width: "12px", height: "10px",
                          borderRadius: i === 0 ? "3px 0 0 3px" : i === 4 ? "0 3px 3px 0" : "0",
                          background: filled ? "#C9A227" : "radial-gradient(var(--segment-dot) 1px, transparent 1.2px)",
                          backgroundColor: filled ? "#C9A227" : "var(--segment-empty-bg)",
                          backgroundSize: filled ? undefined : "4px 4px",
                        }}
                      />
                    );
                  })}
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>{weekTaskProgress}%</span>
              </div>
            </div>
            <div className="ht-task-add-row">
              <input className="ht-input" placeholder="Add a task…" value={weekInput} onChange={(e) => setWeekInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addWeekTask()} />
              <button className="ht-btn" style={{ flexShrink: 0, padding: "8px 10px" }} onClick={addWeekTask}>+</button>
            </div>
            {weekTasks.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No weekly tasks yet.</div>
            ) : (
              <div>
                {weekTasks.map((t) => (
                  <div
                    key={t.id}
                    className={`ht-task ${draggedTask?.id === t.id ? "dragging" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedTask({ list: "week", id: t.id });
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedTask?.list === "week") {
                        reorderTasks("week", draggedTask.id, t.id);
                      }
                      setDraggedTask(null);
                    }}
                    onDragEnd={() => setDraggedTask(null)}
                  >
                    <div className={`ht-check ${t.done ? "done" : ""}`} onClick={() => toggleWeekTask(t.id)}>
                      {t.done && <span style={{ color: "#FFFFFC", fontSize: "12px" }}>✓</span>}
                    </div>
                    <span className="ht-task-text" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-muted)" : "var(--text)" }}>{t.text}</span>
                    <button
                      className={`ht-pin ${t.pinned ? "active" : ""}`}
                      onClick={() => toggleWeekPin(t.id)}
                      aria-label={t.pinned ? "Stop pinning this task" : "Pin this task to keep it active"}
                      title={t.pinned ? "Unpin task" : "Pin this task to keep it active"}
                    >
                      ∞
                    </button>
                    <button onClick={() => deleteWeekTask(t.id)} aria-label="Delete task" className="ht-task-delete">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ht-task-section">
            <div className="ht-task-section-head">
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "0.04em" }}>This month</div>
              <div className="ht-task-progress">
                <div style={{ display: "flex", gap: "2px" }}>
                  {Array.from({ length: 5 }).map((_, i) => {
                    const filled = i < Math.round((monthTaskProgress / 100) * 5);
                    return (
                      <div
                        key={i}
                        style={{
                          width: "12px", height: "10px",
                          borderRadius: i === 0 ? "3px 0 0 3px" : i === 4 ? "0 3px 3px 0" : "0",
                          background: filled ? "#8B5CF6" : "radial-gradient(var(--segment-dot) 1px, transparent 1.2px)",
                          backgroundColor: filled ? "#8B5CF6" : "var(--segment-empty-bg)",
                          backgroundSize: filled ? undefined : "4px 4px",
                        }}
                      />
                    );
                  })}
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>{monthTaskProgress}%</span>
              </div>
            </div>
            <div className="ht-task-add-row">
              <input className="ht-input" placeholder="Add a task…" value={monthInput} onChange={(e) => setMonthInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMonthTask()} />
              <button className="ht-btn" style={{ flexShrink: 0, padding: "8px 10px" }} onClick={addMonthTask}>+</button>
            </div>
            {monthTasks.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No monthly tasks yet.</div>
            ) : (
              <div>
                {monthTasks.map((t) => (
                  <div
                    key={t.id}
                    className={`ht-task ${draggedTask?.id === t.id ? "dragging" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedTask({ list: "month", id: t.id });
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedTask?.list === "month") {
                        reorderTasks("month", draggedTask.id, t.id);
                      }
                      setDraggedTask(null);
                    }}
                    onDragEnd={() => setDraggedTask(null)}
                  >
                    <div className={`ht-check ${t.done ? "done" : ""}`} onClick={() => toggleMonthTask(t.id)} style={{ borderColor: "#8B5CF6" }}>
                      {t.done && <span style={{ color: "#FFFFFC", fontSize: "12px" }}>✓</span>}
                    </div>
                    <span className="ht-task-text" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-muted)" : "var(--text)" }}>{t.text}</span>
                    <button
                      className={`ht-pin ${t.pinned ? "active" : ""}`}
                      onClick={() => toggleMonthPin(t.id)}
                      aria-label={t.pinned ? "Stop pinning this task" : "Pin this task to keep it active"}
                      title={t.pinned ? "Unpin task" : "Pin this task to keep it active"}
                      style={{ color: t.pinned ? "#8B5CF6" : "var(--segment-dot)" }}
                    >
                      ∞
                    </button>
                    <button onClick={() => deleteMonthTask(t.id)} aria-label="Delete task" className="ht-task-delete">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </>
      )}

      {/* Track page */}
      {activePage === "track" && (
      <div className="ht-card" style={{ padding: "1.25rem" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: "19px", fontWeight: 600, marginBottom: "12px" }}>Track</div>

        <div className="ht-track-form">
          <input className="ht-input" placeholder="e.g. Learn" value={trackNameInput} onChange={(e) => setTrackNameInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTrack()} />
          <button className="ht-btn" style={{ flexShrink: 0 }} onClick={addTrack}>+ Add track</button>
        </div>

        {tracks.length === 0 ? (
          <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Add a track (like "Learn" or "Run") to log daily numbers and see them charted.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
              {tracks.map((t) => (
                <button
                  key={t.id}
                  className={`ht-track-btn ${selectedTrackId === t.id ? "active" : ""}`}
                  style={selectedTrackId === t.id ? { background: t.color, borderColor: t.color } : {}}
                  onClick={() => setSelectedTrackId(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {selectedTrack && (
              <div>
                <div className="ht-track-entry-row">
                  <input className="ht-input ht-input-date" type="date" max={todayISO()} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
                  <input className="ht-input ht-input-value" type="number" step="0.1" placeholder="Hours" value={entryValue} onChange={(e) => setEntryValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTrackEntry()} />
                  <button className="ht-btn" onClick={addTrackEntry}>Save entry</button>
                  <button onClick={() => removeTrack(selectedTrack.id)} style={{ border: "none", background: "none", color: "#B7563C", cursor: "pointer", fontSize: "12px", marginLeft: "auto" }}>Remove track</button>
                </div>

                {selectedTrackData.length === 0 ? (
                  <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>No entries yet for {selectedTrack.name}. Log today's number, or pick an earlier date if you missed a day.</div>
                ) : (
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={selectedTrackData} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`grad-${selectedTrack.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={selectedTrack.color} stopOpacity={0.55} />
                            <stop offset="100%" stopColor={selectedTrack.color} stopOpacity={0.03} />
                          </linearGradient>
                          <linearGradient id={`stroke-${selectedTrack.id}`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#F0544F" />
                            <stop offset="35%" stopColor="#FB923C" />
                            <stop offset="65%" stopColor={selectedTrack.color} />
                            <stop offset="100%" stopColor="#6366F1" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="var(--subtle-bg)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                        <Tooltip
                          formatter={(v) => [v, selectedTrack.name]}
                          labelFormatter={(l) => l}
                          contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={`url(#stroke-${selectedTrack.id})`}
                          strokeWidth={3}
                          fill={`url(#grad-${selectedTrack.id})`}
                          dot={{ r: 4, stroke: "#FFFFFC", strokeWidth: 2, fill: selectedTrack.color }}
                          activeDot={{ r: 6 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* Date of birth modal (for Age countdown) */}
      {dobModalOpen && (
        <div
          onClick={() => setDobModalOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(43,42,37,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ht-card"
            style={{ padding: "1.5rem", width: "320px", maxWidth: "90vw" }}
          >
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Date of birth</div>
            <input
              autoFocus
              type="date"
              className="ht-input"
              max={todayISO()}
              value={dobInput}
              onChange={(e) => setDobInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveDob()}
              style={{ marginBottom: "14px" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button className="ht-btn" onClick={() => setDobModalOpen(false)}>Cancel</button>
              <button className="ht-btn" style={{ background: "var(--text)", color: "var(--page-bg)" }} onClick={saveDob}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Habit modal */}
      {addHabitOpen && (
        <div
          onClick={() => setAddHabitOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(43,42,37,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ht-card"
            style={{ padding: "1.5rem", width: "320px", maxWidth: "90vw" }}
          >
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Add habit</div>
            <input
              autoFocus
              className="ht-input"
              placeholder="e.g. Read 20 minutes"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHabit()}
              style={{ marginBottom: "14px" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button className="ht-btn" onClick={() => { setAddHabitOpen(false); setNewName(""); }}>Cancel</button>
              <button className="ht-btn" style={{ background: "var(--text)", color: "var(--page-bg)" }} onClick={addHabit}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete habit confirmation modal */}
      {deleteHabitId && (
        <div
          onClick={() => setDeleteHabitId(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(43,42,37,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ht-card"
            style={{ padding: "1.5rem", width: "360px", maxWidth: "90vw" }}
          >
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Delete habit</div>
            <div style={{ fontSize: "14px", color: "#5A5748", marginBottom: "20px" }}>
              Delete this habit? This cannot be undone.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button className="ht-btn" onClick={() => setDeleteHabitId(null)}>Cancel</button>
              <button
                className="ht-btn"
                style={{ background: "#B7563C", borderColor: "#B7563C", color: "#FFFFFC" }}
                onClick={() => { removeHabit(deleteHabitId); setDeleteHabitId(null); }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
