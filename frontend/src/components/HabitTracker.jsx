import { useState, useEffect, useMemo, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { storage } from "../api/storage";
import { useAuth } from "../context/AuthContext";
import confetti from "canvas-confetti";

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
const formatTime = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
};
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

export default function HabitTracker() {
  const [habits, setHabits] = useState([]);
  const [completions, setCompletions] = useState({});
  const [targets, setTargets] = useState([]);
  const [todayTasks, setTodayTasks] = useState([]);
  const [weekTasks, setWeekTasks] = useState([]);
  const [monthTasks, setMonthTasks] = useState([]);
  const [goalBudgetItems, setGoalBudgetItems] = useState([]);
  const [bucketListItems, setBucketListItems] = useState([]);
  const [checkedProTips, setCheckedProTips] = useState([]);
  const [proTips, setProTips] = useState([
    "Travel as much as possible",
    "Communication Skills",
    "Fitness as a Mindset",
    "Live in a Big City",
    "Meet new people",
    "Sleeping Maxxing",
    "Learn to live alone",
    "Read Books",
    "Be Shameless in asking",
    "Learn to ace the first impression",
    "Write and Journal your thoughts",
    "Multiple Sources of Income",
    "Use Twitter (X) Everyday",
    "Replace Reels with Substack",
    "Do deep work"
  ]);
  const [draggedProTipIndex, setDraggedProTipIndex] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [trackEntries, setTrackEntries] = useState({});
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [noteTitleInput, setNoteTitleInput] = useState("");
  const [noteParagraphInput, setNoteParagraphInput] = useState("");
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editNoteId, setEditNoteId] = useState(null);
  const [editNoteTitleInput, setEditNoteTitleInput] = useState("");
  const [editNoteParagraphInput, setEditNoteParagraphInput] = useState("");
  const [editNoteModalOpen, setEditNoteModalOpen] = useState(false);
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
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [moneyTarget, setMoneyTarget] = useState(0);
  const [moneyEarned, setMoneyEarned] = useState(0);
  const [moneyTargetInput, setMoneyTargetInput] = useState("");
  const [moneyEarnInput, setMoneyEarnInput] = useState("");
  const [packageTarget, setPackageTarget] = useState(0);
  const [packageAchieved, setPackageAchieved] = useState(0);
  const [packageTargetInput, setPackageTargetInput] = useState("");
  const [packageAchievedInput, setPackageAchievedInput] = useState("");
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
  const [timerSeconds, setTimerSeconds] = useState(1500); // 25 minutes
  const [timerActive, setTimerActive] = useState(false);
  const [timerEditMode, setTimerEditMode] = useState(false);
  const [timerEditValue, setTimerEditValue] = useState("");
  // Inline edit state for tasks and habits
  const [editingTask, setEditingTask] = useState(null); // { list: 'today'|'week'|'month', id, value }
  const [editingHabitId, setEditingHabitId] = useState(null);
  const [editingHabitValue, setEditingHabitValue] = useState("");
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // ---------- Inline task rename ----------
  const commitTaskRename = () => {
    if (!editingTask) return;
    const { list, id, value } = editingTask;
    const trimmed = value.trim();
    if (!trimmed) { setEditingTask(null); return; }
    const setters = { today: setTodayTasks, week: setWeekTasks, month: setMonthTasks };
    const getters = { today: todayTasks, week: weekTasks, month: monthTasks };
    const saveKeys = { today: "todayTasks", week: "weekTasks", month: "monthTasks" };
    // eslint-disable-next-line no-unused-vars
    const next = getters[list].map((t) => t.id === id ? { ...t, text: trimmed } : t);
    setters[list](next);
    save({ [saveKeys[list]]: next });
    setEditingTask(null);
  };

  // ---------- Inline habit rename ----------
  const commitHabitRename = () => {
    if (!editingHabitId) return;
    const trimmed = editingHabitValue.trim();
    if (!trimmed) { setEditingHabitId(null); return; }
    const next = habits.map((h) => h.id === editingHabitId ? { ...h, name: trimmed } : h);
    setHabits(next);
    save({ habits: next });
    setEditingHabitId(null);
  };

  const toggleProTip = (tip) => {
    setCheckedProTips((prev) => {
      const isChecked = prev.includes(tip);
      if (!isChecked) confetti({ particleCount: 100, spread: 70, origin: { y: 0.8 }, colors: PALETTE });
      const next = isChecked ? prev.filter(t => t !== tip) : [...prev, tip];
      save({ checkedProTips: next });
      return next;
    });
  };

  const reorderProTips = (sourceIndex, destIndex) => {
    setProTips((prev) => {
      const items = Array.from(prev);
      const [reorderedItem] = items.splice(sourceIndex, 1);
      items.splice(destIndex, 0, reorderedItem);
      save({ proTips: items });
      return items;
    });
  };

  const parseTimerInput = (raw) => {
    const s = raw.trim().toLowerCase();
    // "1:30" or "1:30:00" → h:m or h:m:s
    if (/^\d+:\d+(:\d+)?$/.test(s)) {
      const parts = s.split(":").map(Number);
      if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
      return parts[0]*3600 + parts[1]*60;
    }
    // "1hr" / "1h" → hours
    const hrMatch = s.match(/^(\d+)\s*h/);
    if (hrMatch) return parseInt(hrMatch[1]) * 3600;
    // "1 30" → 1 hr 30 min
    const twoNum = s.match(/^(\d+)\s+(\d+)$/);
    if (twoNum) return parseInt(twoNum[1])*3600 + parseInt(twoNum[2])*60;
    // plain number → hours (e.g. "1" = 1 hour, "2" = 2 hours)
    const hrs = parseFloat(s);
    if (!isNaN(hrs)) return Math.round(hrs * 3600);
    return null;
  };

  const commitTimerEdit = () => {
    const secs = parseTimerInput(timerEditValue);
    if (secs !== null && secs > 0) {
      const finalSecs = Math.min(64800, secs);
      setTimerSeconds(finalSecs);
      save({ timerSeconds: finalSecs });
    }
    setTimerEditMode(false);
    setTimerEditValue("");
  };

  const startTimer = () => {
    setTimerActive(true);
    save({ timerSeconds });
  };

  const stopTimer = () => {
    setTimerActive(false);
    setTimerSeconds((prev) => {
      save({ timerSeconds: prev });
      return prev;
    });
  };

  const resetTimer = () => {
    setTimerActive(false);
    setTimerSeconds(0);
    save({ timerSeconds: 0 });
  };

  const updateMoneyTarget = (target) => {
    setMoneyTarget(target);
    save({ moneyTarget: target });
  };

  const addMoneyEarnings = (earning) => {
    setMoneyEarned((prev) => {
      const next = Math.min(moneyTarget, prev + earning);
      save({ moneyEarned: next });
      return next;
    });
  };

  const resetMoneyTarget = () => {
    setMoneyTarget(0);
    setMoneyEarned(0);
    save({ moneyTarget: 0, moneyEarned: 0 });
  };

  const updatePackageTarget = (target) => {
    setPackageTarget(target);
    save({ packageTarget: target });
  };

  const addPackageAchieved = (achieved) => {
    setPackageAchieved((prev) => {
      const next = Math.min(packageTarget, prev + achieved);
      save({ packageAchieved: next });
      return next;
    });
  };

  const resetPackageTarget = () => {
    setPackageTarget(0);
    setPackageAchieved(0);
    save({ packageTarget: 0, packageAchieved: 0 });
  };

  const adjustTimer = (delta) => {
    if (timerActive) return;
    setTimerSeconds((prev) => {
      const next = Math.max(0, Math.min(64800, prev + delta));
      save({ timerSeconds: next });
      return next;
    });
  };

  useEffect(() => {
    let interval = null;
    if (timerActive && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prevSeconds) => prevSeconds - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setTimerActive(false);
      save({ timerSeconds: 0 });
      // Optionally, play a sound or show a notification
    }
    return () => clearInterval(interval);
  }, [timerActive, timerSeconds]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const daysLeftInYear = useMemo(() => {
    const t = todayISO();
    const yearEnd = `${new Date().getFullYear()}-12-31`;
    return Math.max(0, daysBetween(t, yearEnd));
  }, []);

  const daysLeftInMonth = useMemo(() => {
    const t = todayISO();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const lastDayDate = new Date(year, month, 0);
    const monthEnd = `${year}-${pad2(month)}-${pad2(lastDayDate.getDate())}`;
    return Math.max(0, daysBetween(t, monthEnd));
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
      setNotes(data.notes || []);
      if ((data.tracks || []).length > 0) setSelectedTrackId(data.tracks[0].id);
      setTheme(data.theme === "light" ? "light" : "dark");
      setCountdownMode(data.countdownMode || "month");
      setDob(data.dob || null);

      setTodayTasks(data.todayTasks || []);
      setWeekTasks(data.weekTasks || []);
      setMonthTasks(data.monthTasks || []);
      setGoalBudgetItems(data.goalBudgetItems || []);
      setBucketListItems(data.bucketListItems || []);

      setMoneyTarget(data.moneyTarget || 0);
      setMoneyEarned(data.moneyEarned || 0);
      setPackageTarget(data.packageTarget || 0);
      setPackageAchieved(data.packageAchieved || 0);
      setCheckedProTips(data.checkedProTips || []);
      if (data.proTips && data.proTips.length > 0) {
        setProTips(data.proTips);
      }
      setTimerSeconds(data.timerSeconds !== undefined ? data.timerSeconds : 1500);

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
    if (set.has(iso)) {
      set.delete(iso);
    } else {
      set.add(iso);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
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
    const next = todayTasks.map((t) => {
      if (t.id === id) {
        if (!t.done) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        return { ...t, done: !t.done };
      }
      return t;
    });
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
    const next = weekTasks.map((t) => {
      if (t.id === id) {
        if (!t.done) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        return { ...t, done: !t.done };
      }
      return t;
    });
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
    const next = monthTasks.map((t) => {
      if (t.id === id) {
        if (!t.done) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        return { ...t, done: !t.done };
      }
      return t;
    });
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
    const next = goalBudgetItems.map((item) => {
      if (item.id === id) {
        if (!item.done) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        return { ...item, done: !item.done };
      }
      return item;
    });
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
    const next = bucketListItems.map((item) => {
      if (item.id === id) {
        if (!item.done) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        return { ...item, done: !item.done };
      }
      return item;
    });
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

  // ---------- Notes ----------
  const addNote = () => {
    const title = noteTitleInput.trim();
    const text = noteParagraphInput.trim();
    if (!title && !text) return;
    const newNote = {
      id: "n_" + Date.now(),
      title,
      text,
      createdAt: new Date().toISOString()
    };
    const next = [newNote, ...notes];
    setNotes(next);
    setNoteTitleInput("");
    setNoteParagraphInput("");
    setNoteModalOpen(false);
    save({ notes: next });
  };

  const removeNote = (id) => {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    save({ notes: next });
  };

  const startEditNote = (note) => {
    setEditNoteId(note.id);
    setEditNoteTitleInput(note.title);
    setEditNoteParagraphInput(note.text);
    setEditNoteModalOpen(true);
  };

  const saveEditNote = () => {
    if (!editNoteId) return;
    const title = editNoteTitleInput.trim();
    const text = editNoteParagraphInput.trim();
    if (!title && !text) return;
    const next = notes.map((n) =>
      n.id === editNoteId ? { ...n, title, text, updatedAt: new Date().toISOString() } : n
    );
    setNotes(next);
    setEditNoteId(null);
    setEditNoteModalOpen(false);
    setEditNoteTitleInput("");
    setEditNoteParagraphInput("");
    save({ notes: next });
  };

  const cancelEditNote = () => {
    setEditNoteId(null);
    setEditNoteModalOpen(false);
    setEditNoteTitleInput("");
    setEditNoteParagraphInput("");
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

  const singleHabitLongestStreak = (habitId) => {
    const set = completionSets[habitId];
    if (!set || set.size === 0) return 0;
    const sorted = Array.from(set).sort();
    let longest = 0, run = 0, prev = null;
    sorted.forEach((d) => {
      if (prev && addDays(prev, 1) === d) run++;
      else run = 1;
      longest = Math.max(longest, run);
      prev = d;
    });
    return longest;
  };

  const { currentStreak, longestStreak } = useMemo(() => {
    if (habits.length === 0) return { currentStreak: 0, longestStreak: 0 };
    const allDone = (iso) => habits.every((h) => completionSets[h.id]?.has(iso));
    let current = 0;
    let cursor = todayISO();
    if (!allDone(cursor)) cursor = addDays(cursor, -1);
    while (allDone(cursor)) {
      current++;
      cursor = addDays(cursor, -1);
    }
    const allDates = new Set();
    habits.forEach((h) => (completions[h.id] || []).forEach((d) => allDates.add(d)));
    let longest = 0, run = 0, prev = null;
    Array.from(allDates).sort().forEach((d) => {
      if (allDone(d)) {
        if (prev && addDays(prev, 1) === d) run++;
        else run = 1;
        longest = Math.max(longest, run);
        prev = d;
      } else {
        prev = d;
        run = 0;
      }
    });
    return { currentStreak: current, longestStreak: Math.max(longest, current) };
  }, [habits, completions, completionSets]);

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
  const longestStreakDisplay = hoveredHabit ? singleHabitLongestStreak(hoveredHabit.id) : longestStreak;

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
        .ht-inline-edit-input { flex: 1; border: none; background: transparent; color: var(--text); font-family: 'Inter', sans-serif; font-size: 13px; padding: 0 2px; outline: none; min-width: 0; line-height: 1.4; }
        .ht-editable-text { cursor: text; border-radius: 4px; transition: background 0.12s; }
        .ht-editable-text:hover { background: rgba(99,102,241,0.08); }
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
        /* ---- Notes Panel ---- */
        .ht-notes-panel { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
        .ht-notes-header { padding: 18px 20px 16px; background: linear-gradient(135deg, var(--subtle-bg) 0%, var(--card-bg) 100%); border-bottom: 1px solid var(--border); color: var(--text); }
        .ht-notes-icon-wrap { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #6366F1, #8B5CF6); display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
        .ht-notes-form-wrap { padding: 16px 20px 0; display: flex; flex-direction: column; gap: 10px; }
        .ht-notes-title-input { font-weight: 600; font-size: 14px !important; }
        .ht-notes-textarea { resize: vertical; min-height: 72px; font-family: 'Inter', sans-serif; font-size: 13px !important; line-height: 1.5; }
        .ht-notes-add-btn { align-self: flex-end; display: inline-flex; align-items: center; gap: 6px; border: none; background: linear-gradient(135deg, #6366F1, #8B5CF6); color: #fff; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; transition: opacity 0.15s, transform 0.1s; margin-bottom: 16px; }
        .ht-notes-add-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .ht-notes-add-btn:disabled { opacity: 0.38; cursor: not-allowed; }
        .ht-notes-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: var(--text-muted); font-size: 13px; }
        .ht-notes-list { padding: 0 20px 20px; display: flex; flex-direction: column; gap: 12px; }
        .ht-note-card { display: flex; border-radius: 10px; border: 1px solid var(--border); background: var(--card-bg); overflow: hidden; transition: box-shadow 0.15s, transform 0.15s; }
        .ht-note-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); transform: translateY(-1px); }
        .ht-note-accent-bar { width: 4px; flex-shrink: 0; background: var(--note-accent, #6366F1); border-radius: 0; }
        .ht-note-content { flex: 1; min-width: 0; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
        .ht-note-edit-form { flex: 1; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
        .ht-note-top-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .ht-note-title { font-size: 14px; font-weight: 700; color: var(--note-accent, #6366F1); flex: 1; min-width: 0; line-height: 1.3; text-transform: uppercase; letter-spacing: 0.04em; }
        .ht-note-text { font-size: 13px; color: var(--text); white-space: pre-wrap; line-height: 1.55; opacity: 0.88; }
        .ht-note-footer { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-muted); margin-top: 4px; }
        .ht-note-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .ht-note-icon-btn { border: none; background: transparent; cursor: pointer; border-radius: 6px; padding: 5px; display: flex; align-items: center; justify-content: center; transition: background 0.12s, color 0.12s; color: var(--text-muted); }
        .ht-note-edit-icon:hover { background: rgba(99,102,241,0.12); color: #6366F1; }
        .ht-note-delete-icon:hover { background: rgba(183,86,60,0.12); color: #B7563C; }
        .ht-note-action-btn { border-radius: 7px; padding: 7px 14px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; border: 1px solid var(--border-strong); transition: background 0.12s; }
        .ht-note-cancel-btn { background: var(--subtle-bg); color: var(--text-muted); }
        .ht-note-cancel-btn:hover { background: var(--hover-bg); }
        .ht-note-save-btn { background: linear-gradient(135deg, #6366F1, #8B5CF6); color: #fff; border-color: transparent; }
        .ht-note-save-btn:hover { opacity: 0.9; }
        .ht-note-save-btn:disabled { opacity: 0.38; cursor: not-allowed; }
        .ht-note-modal { padding: 0 !important; width: 420px; max-width: 94vw; border-radius: 16px !important; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.35) !important; }
        .ht-note-modal-header { display: flex; align-items: center; gap: 12px; padding: 18px 20px; background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); color: #fff; }
        .ht-note-modal-header .ht-notes-icon-wrap { background: rgba(255,255,255,0.2); flex-shrink: 0; }
        .ht-note-modal-close { margin-left: auto; border: none; background: rgba(255,255,255,0.15); color: #fff; border-radius: 8px; width: 30px; height: 30px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.12s; flex-shrink: 0; }
        .ht-note-modal-close:hover { background: rgba(255,255,255,0.3); }
        .ht-note-modal-body { padding: 20px 20px 4px; display: flex; flex-direction: column; }
        .ht-note-modal-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 6px; display: block; }
        .ht-note-modal-footer { padding: 16px 20px 20px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border); margin-top: 16px; }
        .ht-note-modal-footer .ht-note-action-btn { padding: 9px 18px; font-size: 13px; }
        @media (max-width: 768px) {
          .ht-notes-form-wrap { padding: 14px 14px 0; }
          .ht-notes-list { padding: 0 14px 14px; }
          .ht-notes-header { padding: 14px; }
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
                {daysLeftInMonth} days left in {new Date().toLocaleDateString("en-US", { month: "long" })}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "17px", fontWeight: 600 }}>Set target</div>
            <button className="ht-btn" style={{ padding: "6px 12px", fontSize: "12px", whiteSpace: "nowrap" }} onClick={() => setTargetModalOpen(true)}>+ Add target</button>
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

        {/* Money Target panel */}
        <div className="ht-card" style={{ padding: "1.1rem" }}>
          {moneyTarget === 0 ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Set your yearly earning target</div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>₹</span>
                <input className="ht-input" type="number" placeholder="e.g. 550000" value={moneyTargetInput} onChange={(e) => setMoneyTargetInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && Number(moneyTargetInput) > 0) { updateMoneyTarget(Number(moneyTargetInput)); setMoneyTargetInput(""); } }} style={{ flex: 1 }} />
                <button className="ht-btn" style={{ flexShrink: 0, padding: "8px 12px", fontSize: "12px" }} onClick={() => { if (Number(moneyTargetInput) > 0) { updateMoneyTarget(Number(moneyTargetInput)); setMoneyTargetInput(""); } }}>Set</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Saveing Target</div>
                <button onClick={resetMoneyTarget} style={{ border: "none", background: "none", color: "#B7563C", cursor: "pointer", fontSize: "11px" }}>Reset</button>
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", fontWeight: 700, color: (moneyTarget - moneyEarned) > 0 ? "#3F6C51" : "#10B981", marginBottom: "4px" }}>
                ₹{((moneyTarget - moneyEarned) / 100000).toFixed(2)}L
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
                remaining of ₹{(moneyTarget / 100000).toFixed(2)}L  ·  earned ₹{(moneyEarned / 100000).toFixed(2)}L
              </div>
              <div style={{ height: "6px", background: "var(--hover-bg)", borderRadius: "3px", marginBottom: "12px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (moneyEarned / moneyTarget) * 100)}%`, background: "linear-gradient(90deg, #3F6C51, #10B981)", borderRadius: "3px", transition: "width 0.4s ease" }} />
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>₹</span>
                <input className="ht-input" type="number" placeholder="Enter earning..." value={moneyEarnInput} onChange={(e) => setMoneyEarnInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && Number(moneyEarnInput) > 0) { addMoneyEarnings(Number(moneyEarnInput)); setMoneyEarnInput(""); } }} style={{ flex: 1 }} />
                <button className="ht-btn" style={{ flexShrink: 0, padding: "8px 12px", fontSize: "12px" }} onClick={() => { if (Number(moneyEarnInput) > 0) { addMoneyEarnings(Number(moneyEarnInput)); setMoneyEarnInput(""); } }}>+ Add</button>
              </div>
            </div>
          )}
        </div>

        {/* Package Target panel */}
        <div className="ht-card" style={{ padding: "1.1rem" }}>
          {packageTarget === 0 ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Set your job package target</div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>₹</span>
                <input
                  className="ht-input"
                  type="number"
                  placeholder="e.g. 1200000"
                  value={packageTargetInput}
                  onChange={(e) => setPackageTargetInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && Number(packageTargetInput) > 0) {
                      updatePackageTarget(Number(packageTargetInput));
                      setPackageTargetInput("");
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="ht-btn"
                  style={{ flexShrink: 0, padding: "8px 12px", fontSize: "12px" }}
                  onClick={() => {
                    if (Number(packageTargetInput) > 0) {
                      updatePackageTarget(Number(packageTargetInput));
                      setPackageTargetInput("");
                    }
                  }}
                >
                  Set
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Package Target</div>
                <button onClick={resetPackageTarget} style={{ border: "none", background: "none", color: "#B7563C", cursor: "pointer", fontSize: "11px" }}>Reset</button>
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", fontWeight: 700, color: "#3F6C51", marginBottom: "4px" }}>
                ₹{(packageTarget / 100000).toFixed(2)}L
              </div>
            </div>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", marginBottom: "10px" }}>
                {/* Left: Habit List label */}
                <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "13px", background: "var(--subtle-bg)", display: "inline-block", padding: "3px 8px", borderRadius: "5px", flexShrink: 0 }}>
                  Habit List
                </div>

                {/* Center: Compact timer */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {timerEditMode ? (
                    <input
                      autoFocus
                      value={timerEditValue}
                      onChange={(e) => setTimerEditValue(e.target.value)}
                      onBlur={commitTimerEdit}
                      onKeyDown={(e) => { if (e.key === "Enter") commitTimerEdit(); if (e.key === "Escape") { setTimerEditMode(false); setTimerEditValue(""); } }}
                      placeholder="e.g. 1 30 or 90"
                      style={{
                        fontFamily: "'Fraunces', serif", fontSize: "14px", fontWeight: 700,
                        width: "90px", textAlign: "center", background: "var(--subtle-bg)",
                        border: "1px solid #3B82F6", borderRadius: "5px", color: "var(--text)",
                        padding: "2px 6px", outline: "none"
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => { if (!timerActive) { setTimerEditMode(true); setTimerEditValue(""); } }}
                      title={timerActive ? "Timer running" : "Click to edit time"}
                      style={{
                        fontFamily: "'Fraunces', serif", fontSize: "16px", fontWeight: 700,
                        letterSpacing: "1px", color: timerActive ? "#3F6C51" : "var(--text)",
                        minWidth: "76px", textAlign: "center", transition: "color 0.2s",
                        cursor: timerActive ? "default" : "text",
                        borderBottom: timerActive ? "none" : "1px dashed var(--text-muted)"
                      }}
                    >
                      {formatTime(timerSeconds)}
                    </span>
                  )}
                  <div style={{ width: "1px", height: "14px", background: "var(--border)" }} />
                  {!timerActive ? (
                    <button onClick={startTimer} style={{ border: "none", background: "#3F6C51", color: "#FFFFFC", borderRadius: "5px", fontSize: "11px", padding: "3px 9px", cursor: "pointer", fontWeight: 600 }}>Start</button>
                  ) : (
                    <button onClick={stopTimer} style={{ border: "none", background: "#B7563C", color: "#FFFFFC", borderRadius: "5px", fontSize: "11px", padding: "3px 9px", cursor: "pointer", fontWeight: 600 }}>Stop</button>
                  )}
                  <button onClick={resetTimer} style={{ border: "none", background: "var(--hover-bg)", color: "var(--text-muted)", borderRadius: "5px", fontSize: "11px", padding: "3px 9px", cursor: "pointer" }}>Reset</button>
                </div>

                {/* Right: Progress bar */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
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
                      {editingHabitId === h.id ? (
                        <input
                          autoFocus
                          className="ht-inline-edit-input"
                          value={editingHabitValue}
                          onChange={(e) => setEditingHabitValue(e.target.value)}
                          onBlur={commitHabitRename}
                          onKeyDown={(e) => { if (e.key === "Enter") commitHabitRename(); if (e.key === "Escape") setEditingHabitId(null); }}
                        />
                      ) : (
                        <span
                          className="ht-editable-text"
                          style={{ flex: 1, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          onDoubleClick={() => { setEditingHabitId(h.id); setEditingHabitValue(h.name); }}
                          title="Double-click to edit"
                        >{h.name}</span>
                      )}
                      <button onClick={() => setDeleteHabitId(h.id)} aria-label={`Delete ${h.name}`} style={{ border: "none", background: "none", color: "#B7563C", cursor: "pointer", fontSize: "13px", flexShrink: 0 }}>×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="ht-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "1.5rem" }}>
            <div className="ht-card" style={{ padding: "1.2rem", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", minHeight: "100px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: "14px", fontWeight: 600, fontStyle: "italic", textAlign: "center", color: "var(--text-muted)", lineHeight: "1.3" }}>
                  "Prove Who are you"
                </div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: "14px", fontWeight: 600, fontStyle: "italic", textAlign: "center", color: "var(--text-muted)", lineHeight: "1.3" }}>
                  "Never give up"
                </div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: "14px", fontWeight: 600, fontStyle: "italic", textAlign: "center", color: "var(--text-muted)", lineHeight: "1.3" }}>
                  "Why can't you"
                </div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: "14px", fontWeight: 600, fontStyle: "italic", textAlign: "center", color: "var(--text-muted)", lineHeight: "1.3" }}>
                  "Believe your self"
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", width: "100%", borderTop: "1px dashed var(--border)", paddingTop: "10px" }}>
                {[
                  { name: "Google", url: "https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" },
                  { name: "Amazon", url: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg" },
                  { name: "Microsoft", url: "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" },
                  { name: "Salesforce", url: "https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg" }
                ].map((brand) => (
                  <img
                    key={brand.name}
                    src={brand.url}
                    alt={brand.name}
                    style={{ 
                      height: brand.name === "Amazon" ? "18px" : "22px", 
                      width: "auto",
                      maxWidth: "50px",
                      objectFit: "contain"
                    }}
                    title={brand.name}
                  />
                ))}
              </div>
            </div>
            <div className="ht-card" style={{ padding: 0, overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <img 
                src="/himalayan.png" 
                alt="Himalayan 411 Silhouette" 
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div className="ht-card" style={{ padding: "1.2rem", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100px" }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "14px", fontWeight: 600, fontStyle: "italic", textAlign: "center", color: "#B7563C", marginBottom: "12px", lineHeight: "1.4" }}>
                "Fucking comfort kills your best version of you"
              </div>
              <div style={{ borderTop: "1px dashed var(--border)", paddingTop: "10px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px", textAlign: "center" }}>
                  your best version
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start", paddingLeft: "10px" }}>
                  {["Google Developer", "LeetCode Guardian","Himalayan 411 Bike"].map((point, index) => (
                    <div key={index} style={{ fontSize: "12px", fontWeight: 500, color: "var(--text)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: "#3B82F6", fontSize: "10px" }}>✦</span>
                      <span>{point}</span>
                    </div>
                  ))}
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
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "17px", fontWeight: 600, color: "#3B82F6" }}>Pro Tips</div>
            </div>
            <div className="ht-goals-shell" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
              {proTips.map((tip, idx) => {
                const isDone = checkedProTips.includes(tip);
                return (
                  <div 
                    key={tip} 
                    className={`ht-goal-item ${draggedProTipIndex === idx ? "dragging" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedProTipIndex(idx);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedProTipIndex !== null) {
                        reorderProTips(draggedProTipIndex, idx);
                        setDraggedProTipIndex(null);
                      }
                    }}
                    onDragEnd={() => setDraggedProTipIndex(null)}
                    style={{ color: "#3B82F6", cursor: "grab" }}
                  >
                    <button
                      className={`ht-goal-toggle ${isDone ? "done" : ""}`}
                      onClick={() => toggleProTip(tip)}
                      aria-label={isDone ? "Mark tip as not done" : "Mark tip as done"}
                      style={{ color: "#3B82F6", cursor: "pointer", flexShrink: 0 }}
                    >
                      {isDone && <span>✓</span>}
                    </button>
                    <span className="ht-goal-text" style={{ color: isDone ? "var(--text-muted)" : "var(--text)", textDecoration: isDone ? "line-through" : "none" }}>{tip}</span>
                  </div>
                );
              })}
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
                    {editingTask?.list === "today" && editingTask.id === t.id ? (
                      <input
                        autoFocus
                        className="ht-inline-edit-input"
                        value={editingTask.value}
                        onChange={(e) => setEditingTask({ ...editingTask, value: e.target.value })}
                        onBlur={commitTaskRename}
                        onKeyDown={(e) => { if (e.key === "Enter") commitTaskRename(); if (e.key === "Escape") setEditingTask(null); }}
                      />
                    ) : (
                      <span
                        className="ht-task-text ht-editable-text"
                        style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-muted)" : "var(--text)" }}
                        onDoubleClick={() => setEditingTask({ list: "today", id: t.id, value: t.text })}
                        title="Double-click to edit"
                      >{t.text}</span>
                    )}
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
                    {editingTask?.list === "week" && editingTask.id === t.id ? (
                      <input
                        autoFocus
                        className="ht-inline-edit-input"
                        value={editingTask.value}
                        onChange={(e) => setEditingTask({ ...editingTask, value: e.target.value })}
                        onBlur={commitTaskRename}
                        onKeyDown={(e) => { if (e.key === "Enter") commitTaskRename(); if (e.key === "Escape") setEditingTask(null); }}
                      />
                    ) : (
                      <span
                        className="ht-task-text ht-editable-text"
                        style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-muted)" : "var(--text)" }}
                        onDoubleClick={() => setEditingTask({ list: "week", id: t.id, value: t.text })}
                        title="Double-click to edit"
                      >{t.text}</span>
                    )}
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
                    {editingTask?.list === "month" && editingTask.id === t.id ? (
                      <input
                        autoFocus
                        className="ht-inline-edit-input"
                        value={editingTask.value}
                        onChange={(e) => setEditingTask({ ...editingTask, value: e.target.value })}
                        onBlur={commitTaskRename}
                        onKeyDown={(e) => { if (e.key === "Enter") commitTaskRename(); if (e.key === "Escape") setEditingTask(null); }}
                      />
                    ) : (
                      <span
                        className="ht-task-text ht-editable-text"
                        style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-muted)" : "var(--text)" }}
                        onDoubleClick={() => setEditingTask({ list: "month", id: t.id, value: t.text })}
                        title="Double-click to edit"
                      >{t.text}</span>
                    )}
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
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
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

        {/* Notes Panel - Redesigned */}
        <div className="ht-notes-panel">
          {/* Panel Header */}
          <div className="ht-notes-header">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="ht-notes-icon-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                </div>
                <div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: "20px", fontWeight: 700, lineHeight: 1 }}>Notes</div>
                  <div style={{ fontSize: "11px", opacity: 0.7, marginTop: "2px" }}>{notes.length} note{notes.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
              <button className="ht-notes-add-btn" onClick={() => setNoteModalOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New Note
              </button>
            </div>
          </div>

          {/* Notes List */}
          {notes.length === 0 ? (
            <div className="ht-notes-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: "10px" }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>No notes yet</div>
              <div style={{ fontSize: "12px", opacity: 0.65 }}>Click "New Note" to get started</div>
            </div>
          ) : (
            <div className="ht-notes-list">
              {notes.map((note, idx) => {
                const accentColors = ["#6366F1","#F59E0B","#10B981","#F43F5E","#8B5CF6","#3B82F6","#EC4899","#14B8A6"];
                const accent = accentColors[idx % accentColors.length];
                return (
                  <div key={note.id} className="ht-note-card" style={{ "--note-accent": accent }}>
                    <div className="ht-note-accent-bar" />
                    <div className="ht-note-content">
                      <div className="ht-note-top-row">
                        {note.title && <div className="ht-note-title">{note.title}</div>}
                        <div className="ht-note-actions">
                          <button
                            className="ht-note-icon-btn ht-note-edit-icon"
                            onClick={() => startEditNote(note)}
                            title="Edit note"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button
                            className="ht-note-icon-btn ht-note-delete-icon"
                            onClick={() => removeNote(note.id)}
                            title="Delete note"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </div>
                      {note.text && (
                        <div className="ht-note-text">{note.text}</div>
                      )}
                      <div className="ht-note-footer">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span>
                          {new Date(note.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                          {note.updatedAt && " · edited"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Add Note Modal */}
      {noteModalOpen && (
        <div
          onClick={() => { setNoteModalOpen(false); setNoteTitleInput(""); setNoteParagraphInput(""); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ht-card ht-note-modal"
          >
            {/* Modal Header */}
            <div className="ht-note-modal-header">
              <div className="ht-notes-icon-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: 700 }}>New Note</div>
              <button className="ht-note-modal-close" onClick={() => { setNoteModalOpen(false); setNoteTitleInput(""); setNoteParagraphInput(""); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* Modal Body */}
            <div className="ht-note-modal-body">
              <label className="ht-note-modal-label">Title</label>
              <input
                autoFocus
                className="ht-input ht-notes-title-input"
                placeholder="Enter note title..."
                value={noteTitleInput}
                onChange={(e) => setNoteTitleInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && document.getElementById("ht-note-textarea")?.focus()}
              />
              <label className="ht-note-modal-label" style={{ marginTop: "12px" }}>Note</label>
              <textarea
                id="ht-note-textarea"
                className="ht-input ht-notes-textarea"
                placeholder="Write your thoughts here..."
                value={noteParagraphInput}
                onChange={(e) => setNoteParagraphInput(e.target.value)}
                rows={5}
              />
            </div>
            <div className="ht-note-modal-footer">
              <button className="ht-note-action-btn ht-note-cancel-btn" onClick={() => { setNoteModalOpen(false); setNoteTitleInput(""); setNoteParagraphInput(""); }}>Cancel</button>
              <button
                className="ht-note-action-btn ht-note-save-btn"
                onClick={addNote}
                disabled={!noteTitleInput.trim() && !noteParagraphInput.trim()}
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Note Modal */}
      {editNoteModalOpen && (
        <div
          onClick={cancelEditNote}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ht-card ht-note-modal"
          >
            {/* Modal Header */}
            <div className="ht-note-modal-header">
              <div className="ht-notes-icon-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: 700 }}>Edit Note</div>
              <button className="ht-note-modal-close" onClick={cancelEditNote}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* Modal Body */}
            <div className="ht-note-modal-body">
              <label className="ht-note-modal-label">Title</label>
              <input
                autoFocus
                className="ht-input ht-notes-title-input"
                placeholder="Enter note title..."
                value={editNoteTitleInput}
                onChange={(e) => setEditNoteTitleInput(e.target.value)}
              />
              <label className="ht-note-modal-label" style={{ marginTop: "12px" }}>Note</label>
              <textarea
                className="ht-input ht-notes-textarea"
                placeholder="Write your thoughts here..."
                value={editNoteParagraphInput}
                onChange={(e) => setEditNoteParagraphInput(e.target.value)}
                rows={5}
              />
            </div>
            <div className="ht-note-modal-footer">
              <button className="ht-note-action-btn ht-note-cancel-btn" onClick={cancelEditNote}>Cancel</button>
              <button
                className="ht-note-action-btn ht-note-save-btn"
                onClick={saveEditNote}
                disabled={!editNoteTitleInput.trim() && !editNoteParagraphInput.trim()}
              >
                Save Changes
              </button>
            </div>
          </div>
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

      {/* Add Target popup modal */}
      {targetModalOpen && (
        <div
          onClick={() => { setTargetModalOpen(false); setTargetName(""); setTargetDate(""); }}
          style={{ position: "fixed", inset: 0, background: "rgba(43,42,37,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ht-card"
            style={{ padding: "1.5rem", width: "340px", maxWidth: "90vw" }}
          >
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: 600, marginBottom: "14px" }}>Add target</div>
            <input
              autoFocus
              className="ht-input"
              placeholder="e.g. AWS exam"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              style={{ marginBottom: "10px" }}
            />
            <input
              type="date"
              className="ht-input"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { addTarget(); setTargetModalOpen(false); } }}
              style={{ marginBottom: "14px" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button className="ht-btn" onClick={() => { setTargetModalOpen(false); setTargetName(""); setTargetDate(""); }}>Cancel</button>
              <button className="ht-btn" style={{ background: "var(--text)", color: "var(--page-bg)" }} onClick={() => { addTarget(); setTargetModalOpen(false); }}>Add</button>
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
