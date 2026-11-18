let initializeApp, getAuth, GoogleAuthProvider, onAuthStateChanged;
let signInWithPopup, signInWithRedirect, getRedirectResult, signOut;
let browserLocalPersistence, browserSessionPersistence, setPersistence;
let getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs;
let query, orderBy, limit, where, onSnapshot, serverTimestamp, runTransaction;

const state = { ready: false, configured: false, user: null, profile: null, application: null, error: "", notice: "" };
let auth = null;
let db = null;
let authPersistence = null;
let stopProfile = null;
let stopApplication = null;
let stopPosts = null;
let stopOrders = null;
let stopBroadcasts = null;
let stopPrivateMarkers = null;
let stopGameClock = null;
let stopWorld = null;
let sharedSquads = [];
let wallEntries = [];
let postEntries = [];
let orderEntries = [];
let broadcastEntries = [];
let privateMapMarkers = [];
const DEFAULT_GAME_CLOCK = { turn: 1, year: 1, month: 3, day: 1, advanceValue: 7, advanceUnit: "days" };

function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function normalizeGameClock(value) {
  const source = value || DEFAULT_GAME_CLOCK;
  const year = Math.max(1, Math.floor(Number(source.year) || 1));
  const month = Math.min(12, Math.max(1, Math.floor(Number(source.month) || 3)));
  const day = Math.min(daysInMonth(year, month), Math.max(1, Math.floor(Number(source.day) || 1)));
  const advanceUnit = source.advanceUnit === "months" ? "months" : "days";
  const max = advanceUnit === "months" ? 12 : 366;
  const advanceValue = Math.min(max, Math.max(1, Math.floor(Number(source.advanceValue) || 7)));
  return {
    turn: Math.max(1, Math.floor(Number(source.turn) || 1)),
    year, month, day, advanceValue, advanceUnit
  };
}

function advanceCalendar(clock) {
  const next = { ...clock, turn: clock.turn + 1 };
  if (clock.advanceUnit === "months") {
    const totalMonths = (clock.year - 1) * 12 + clock.month - 1 + clock.advanceValue;
    next.year = Math.floor(totalMonths / 12) + 1;
    next.month = totalMonths % 12 + 1;
    next.day = Math.min(clock.day, daysInMonth(next.year, next.month));
    return next;
  }
  for (let i = 0; i < clock.advanceValue; i++) {
    next.day++;
    if (next.day > daysInMonth(next.year, next.month)) {
      next.day = 1;
      next.month++;
      if (next.month > 12) { next.month = 1; next.year++; }
    }
  }
  return next;
}

function watchGameClock() {
  if (stopGameClock) stopGameClock();
  stopGameClock = onSnapshot(doc(db, "public", "gameClock"), (snap) => {
    const gameClock = snap.exists() ? normalizeGameClock(snap.data()) : null;
    window.dispatchEvent(new CustomEvent("ll:game-clock", { detail: gameClock }));
  }, (error) => { state.error = error.message; publish(); });
}

function watchWorld() {
  if (stopWorld) stopWorld();
  stopWorld = onSnapshot(doc(db, "public", "world"), (snap) => {
    const world = snap.exists() ? snap.data() : null;
    sharedSquads = Array.isArray(world?.squads) ? world.squads : [];
    window.dispatchEvent(new CustomEvent("ll:world-data", {
      detail: world ? { exists: true, ...world } : null
    }));
  }, (error) => {
    window.dispatchEvent(new CustomEvent("ll:world-data", { detail: { error: error.message || "Не удалось загрузить общую карту." } }));
  });
}

function worldDocument(world) {
  const squads = Array.isArray(world?.squads) ? world.squads : null;
  const map = world?.map;
  if (!squads || !map || !["lines", "zones", "labels", "pts"].every((key) => Array.isArray(map[key]))) {
    throw new Error("Не удалось подготовить отряды и карту для общей базы.");
  }
  // Firestore doesn't allow arrays nested inside arrays (map vertices live inside feature arrays).
  // Keep the map payload as JSON text while preserving squads as normal Firestore data.
  const data = JSON.parse(JSON.stringify({ squads, mapJson: JSON.stringify(map) }));
  if (new Blob([JSON.stringify(data)]).size > 850000) {
    throw new Error("Общая карта слишком большая для одной записи. Уменьшите число объектов или разделите их.");
  }
  return { ...data, version: 1, updatedBy: state.user.uid, updatedAt: serverTimestamp() };
}

function newApplicationSquad(squad) {
  const { id, n, l, c, x, y } = squad;
  const name = String(n || "").trim();
  const leader = String(l || "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || !name || name.length > 100 || !leader || leader.length > 100) {
    throw new Error("Проверьте название и имя главы отряда.");
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || !/^#[0-9a-f]{6}$/i.test(c)) {
    throw new Error("Проверьте цвет и координаты отряда на карте.");
  }
  const count = (value, fallback) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  return {
    id, n: name, l: leader, c, x, y,
    r: {
      f: count(squad.r?.f, 1), food: count(squad.r?.food, 20), water: count(squad.r?.water, 20),
      ammo: count(squad.r?.ammo, 30), mats: count(squad.r?.mats, 10), meds: count(squad.r?.meds, 3)
    },
    b: {
      farm: count(squad.b?.farm, 0), well: count(squad.b?.well, 0),
      shop: count(squad.b?.shop, 0), wall: count(squad.b?.wall, 0)
    },
    mor: Math.min(100, count(squad.mor, 70)), lvl: Math.max(1, count(squad.lvl, 1)),
    set: Boolean(squad.set), territoryRadius: Math.max(60, Math.min(350, count(squad.territoryRadius, 145)))
  };
}

function publish() {
  state.ready = true;
  window.LLAuthState = { ...state };
  window.dispatchEvent(new CustomEvent("ll:auth-state", { detail: window.LLAuthState }));
}

function isUsableConfig(config) {
  return !!config && ["apiKey", "authDomain", "projectId", "appId"].every((key) =>
    typeof config[key] === "string" && config[key].trim() && !config[key].includes("REPLACE")
  );
}

async function ensurePlayerProfile(user) {
  const ref = doc(db, "users", user.uid);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName || "Игрок",
      photoURL: user.photoURL || "",
      email: user.email || "",
      role: "player",
      status: "visitor",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

function clearListeners() {
  if (stopProfile) stopProfile();
  if (stopApplication) stopApplication();
  if (stopPosts) stopPosts();
  if (stopOrders) stopOrders();
  if (stopBroadcasts) stopBroadcasts();
  if (stopPrivateMarkers) stopPrivateMarkers();
  stopProfile = stopApplication = null;
  stopPosts = stopOrders = stopBroadcasts = stopPrivateMarkers = null;
  postEntries = orderEntries = broadcastEntries = privateMapMarkers = [];
  wallEntries = [];
  window.dispatchEvent(new CustomEvent("ll:wall-data", { detail: wallEntries }));
  window.dispatchEvent(new CustomEvent("ll:private-markers", { detail: privateMapMarkers }));
}

function dispatchWallEntries() {
  wallEntries = postEntries.concat(orderEntries, broadcastEntries);
  window.dispatchEvent(new CustomEvent("ll:wall-data", { detail: wallEntries }));
}

function startPrivateMarkerListener() {
  if (stopPrivateMarkers) stopPrivateMarkers();
  stopPrivateMarkers = null;
  privateMapMarkers = [];
  if (!db || !state.user) {
    window.dispatchEvent(new CustomEvent("ll:private-markers", { detail: privateMapMarkers }));
    return;
  }
  const master = ["master", "owner"].includes(state.profile?.role);
  const markerQuery = master
    ? query(collection(db, "privateMapMarkers"), limit(200))
    : query(collection(db, "privateMapMarkers"), where("visibleTo", "array-contains", state.user.uid), limit(200));
  stopPrivateMarkers = onSnapshot(markerQuery, (snap) => {
    privateMapMarkers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    window.dispatchEvent(new CustomEvent("ll:private-markers", { detail: privateMapMarkers }));
  }, (error) => { state.error = error.message; publish(); });
}

function startWallListeners() {
  if (!db) return;
  if (stopPosts) stopPosts();
  if (stopOrders) stopOrders();
  if (stopBroadcasts) stopBroadcasts();
  postEntries = orderEntries = broadcastEntries = [];
  stopPosts = onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
    postEntries = snap.docs.map((d) => ({ id: d.id, cloud: true, kind: "post", ...d.data() }));
    dispatchWallEntries();
  }, (error) => { state.error = error.message; publish(); });
  if (state.user) {
    const orderQuery = ["master", "owner"].includes(state.profile?.role)
      ? query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(100))
      : query(collection(db, "orders"), where("authorUid", "==", state.user.uid), limit(100));
    stopOrders = onSnapshot(orderQuery, (snap) => {
      orderEntries = snap.docs.map((d) => ({ id: d.id, cloud: true, kind: "order", ...d.data() }));
      dispatchWallEntries();
    }, (error) => { state.error = error.message; publish(); });
  }
  const master = ["master", "owner"].includes(state.profile?.role);
  const broadcastQueries = master
    ? [query(collection(db, "broadcasts"), limit(100))]
    : [query(collection(db, "broadcasts"), where("audience", "==", "all"), limit(100))];
  if (!master && state.user) broadcastQueries.push(query(collection(db, "broadcasts"), where("visibleTo", "array-contains", state.user.uid), limit(100)));
  const broadcastStreams = broadcastQueries.map(() => new Map());
  const broadcastStops = broadcastQueries.map((broadcastQuery, streamIndex) => onSnapshot(broadcastQuery, (snap) => {
    const rows = broadcastStreams[streamIndex];
    rows.clear();
    snap.docs.forEach((d) => rows.set(d.id, { id: d.id, cloud: true, kind: "broadcast", ...d.data() }));
    broadcastEntries = Array.from(new Map(broadcastStreams.flatMap((stream) => Array.from(stream.entries()))).values());
    dispatchWallEntries();
  }, (error) => { state.error = error.message; publish(); }));
  stopBroadcasts = () => broadcastStops.forEach((stop) => stop());
}

const api = {
  get state() { return { ...state }; },
  async signIn() {
    if (!auth) throw new Error("Google-вход ещё не подключён: сначала нужен Firebase-проект.");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const credential = await signInWithPopup(auth, provider);
      return credential.user;
    }
    catch (error) {
      if (error.code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, provider);
        return null;
      }
      throw error;
    }
  },
  async signOut() { if (auth) await signOut(auth); },
  async saveGameClockStep(value, unit, fallback) {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Настраивать игровое время может только мастер.");
    const advanceUnit = unit === "months" ? "months" : "days";
    const max = advanceUnit === "months" ? 12 : 366;
    const advanceValue = Math.floor(Number(value));
    if (!Number.isFinite(advanceValue) || advanceValue < 1 || advanceValue > max) {
      throw new Error(advanceUnit === "months" ? "Укажите от 1 до 12 месяцев." : "Укажите от 1 до 366 дней.");
    }
    const ref = doc(db, "public", "gameClock");
    return runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const current = normalizeGameClock(snap.exists() ? snap.data() : fallback || DEFAULT_GAME_CLOCK);
      const next = { ...current, advanceValue, advanceUnit };
      transaction.set(ref, { ...next, updatedBy: state.user.uid, updatedAt: serverTimestamp() });
      return next;
    });
  },
  async saveGameDate(year, month, day, fallback) {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Менять игровую дату может только мастер.");
    const gameYear = Math.floor(Number(year));
    const gameMonth = Math.floor(Number(month));
    const gameDay = Math.floor(Number(day));
    if (!Number.isInteger(gameYear) || gameYear < 1 || gameYear > 9999) throw new Error("Укажите год от 1 до 9999.");
    if (!Number.isInteger(gameMonth) || gameMonth < 1 || gameMonth > 12) throw new Error("Выберите месяц от января до декабря.");
    const maxDay = daysInMonth(gameYear, gameMonth);
    if (!Number.isInteger(gameDay) || gameDay < 1 || gameDay > maxDay) throw new Error(`В этом месяце должно быть от 1 до ${maxDay} дней.`);
    const ref = doc(db, "public", "gameClock");
    return runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const current = normalizeGameClock(snap.exists() ? snap.data() : fallback || DEFAULT_GAME_CLOCK);
      const next = { ...current, year: gameYear, month: gameMonth, day: gameDay };
      transaction.set(ref, { ...next, updatedBy: state.user.uid, updatedAt: serverTimestamp() });
      return next;
    });
  },
  async saveWorld(world) {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Публиковать отряды и карту может только мастер.");
    await setDoc(doc(db, "public", "world"), worldDocument(world));
  },
  async initializeWorld(world) {
    if (!db || state.profile?.role !== "owner") throw new Error("Первую общую версию может опубликовать только создатель проекта.");
    const ref = doc(db, "public", "world");
    const payload = worldDocument(world);
    const created = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists()) return false;
      transaction.set(ref, payload);
      return true;
    });
    if (!created) throw new Error("Общая версия уже создана другим мастером. Обновите страницу и продолжайте от неё.");
  },
  async advanceGameClock(fallback) {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Менять игровой ход может только мастер.");
    const ref = doc(db, "public", "gameClock");
    return runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const current = normalizeGameClock(snap.exists() ? snap.data() : fallback || DEFAULT_GAME_CLOCK);
      const next = advanceCalendar(current);
      transaction.set(ref, { ...next, updatedBy: state.user.uid, updatedAt: serverTimestamp() });
      return next;
    });
  },
  async submitApplication(application) {
    const user = state.user;
    if (!user || !db) throw new Error("Сначала войдите через Google.");
    if ((state.profile && state.profile.status === "active") || state.application?.status === "pending") {
      throw new Error("Заявка уже отправлена или доступ уже одобрен.");
    }
    const field = (value, maxLength) => String(value ?? "").trim().slice(0, maxLength);
    const name = field(application.name, 80);
    const callSign = field(application.callSign, 80);
    const entries = application.members;
    if (!name || !callSign) throw new Error("Укажите название отряда и позывной главы.");
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 8) {
      throw new Error("Укажите главу отряда и до семи бойцов.");
    }
    const members = entries.map((member, index) => {
      const n = field(member?.n, 100);
      const bio = field(member?.bio, 2000);
      if (!n || !bio) throw new Error(index === 0
        ? "Укажите имя и описание персонажа, за которого будете играть."
        : `Укажите имя и описание бойца №${index}.`);
      const age = Number(member?.age || 0);
      if (!Number.isInteger(age) || age < 0 || age > 130) throw new Error("Укажите возраст от 1 до 130 лет или оставьте поле пустым.");
      return { n, bio, age, sex: field(member?.sex, 40), spec: field(member?.spec, 100), inv: field(member?.inv, 2000) };
    });
    await setDoc(doc(db, "applications", user.uid), {
      applicantUid: user.uid,
      submittedBy: user.uid,
      squadName: name,
      callSign,
      members,
      status: "pending",
      decisionReason: "",
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  },
  wallEntries() { return wallEntries.slice().sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta;
  }); },
  async createWallEntry(text, imageUrl = "") {
    const user = state.user;
    if (!user || !db) throw new Error("Сначала войдите через Google.");
    const body = String(text || "").trim();
    if (!body) throw new Error("Напишите текст.");
    if (["master", "owner"].includes(state.profile?.role)) {
      await setDoc(doc(collection(db, "posts")), {
        authorUid: user.uid, authorName: "Мастер проекта", text: body, imageUrl: imageUrl || "",
        status: "Событие", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      return;
    }
    if (state.profile?.role !== "player" || state.profile?.status !== "active") {
      throw new Error("Игровые действия откроются после одобрения заявки мастером.");
    }
    if (body.length > 24000) throw new Error("Максимум 24 000 символов вместе с оформлением приказа.");
    const squad = sharedSquads.find((item) => item && item.ownerUid === user.uid && String(item.id) === String(state.profile.squadId))
      || sharedSquads.find((item) => item && item.ownerUid === user.uid);
    await setDoc(doc(collection(db, "orders")), {
      // The existing rules use this order field as another author UID. The assigned squad ID lives in the profile.
      authorUid: user.uid, authorName: squad?.l || state.application?.callSign || "Игрок", squadId: user.uid,
      squadName: squad?.n || state.application?.squadName || "Отряд", text: body, imageUrl: imageUrl || "",
      status: "Ожидает вердикта", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  },
  async uploadArticleMedia(file, readerUid = "") {
    if (!db || !state.user || !(["master", "owner"].includes(state.profile?.role) || state.profile?.status === "active")) {
      throw new Error("Загрузка доступна после назначения отряда.");
    }
    const mime = String(file.type || "").toLowerCase();
    if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp3|mp4|ogg|wav|x-wav|webm|aac|flac))$/.test(mime)) {
      throw new Error("Выберите фотографию, GIF, видео MP4/WebM или аудиофайл.");
    }
    if (!file.size || file.size > 12 * 1024 * 1024) throw new Error("Размер одного вложения — до 12 МБ.");
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
      reader.readAsDataURL(file);
    });
    const ownerUid = state.user.uid;
    if (readerUid && !["master", "owner"].includes(state.profile?.role)) throw new Error("Назначать получателя вложения может только мастер.");
    const ref = doc(collection(db, "orderMedia"));
    const count = Math.ceil(data.length / 400000);
    await setDoc(ref, {
      ownerUid, ...(readerUid ? { readerUid: String(readerUid).slice(0, 128) } : {}), mime, name: String(file.name || "Вложение").slice(0, 160),
      bytes: file.size, count, ready: false, createdAt: serverTimestamp()
    });
    try {
      const results = await Promise.allSettled(Array.from({ length: count }, (_, index) =>
        setDoc(doc(db, "orderMedia", ref.id, "chunks", String(index)), {
          data: data.slice(index * 400000, (index + 1) * 400000)
        })));
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
      await updateDoc(ref, { ready: true });
      return { id: ref.id, mime, name: file.name || "Вложение" };
    } catch (error) {
      await Promise.allSettled(Array.from({ length: count }, (_, index) =>
        deleteDoc(doc(db, "orderMedia", ref.id, "chunks", String(index)))));
      await deleteDoc(ref).catch(() => {});
      throw error;
    }
  },
  async readArticleMedia(id) {
    if (!db || !state.user) throw new Error("Войдите, чтобы открыть вложение.");
    const snap = await getDoc(doc(db, "orderMedia", id));
    if (!snap.exists() || !snap.data().ready) throw new Error("Вложение недоступно.");
    const meta = snap.data();
    if (!Number.isInteger(meta.count) || meta.count < 1 || meta.count > 48) throw new Error("Повреждённое вложение.");
    const chunks = await Promise.all(Array.from({ length: meta.count }, (_, index) =>
      getDoc(doc(db, "orderMedia", id, "chunks", String(index)))));
    const parts = chunks.map((chunk) => {
      if (!chunk.exists()) throw new Error("Не удалось прочитать часть вложения.");
      const raw = atob(chunk.data().data);
      return Uint8Array.from(raw, (character) => character.charCodeAt(0));
    });
    return new Blob(parts, { type: meta.mime });
  },
  async updateWallEntry(id, kind, text) {
    const user = state.user;
    if (!db || !user) throw new Error("Сначала войдите через Google.");
    const body = String(text || "").trim();
    if (!body) throw new Error("Текст публикации не может быть пустым.");
    if (body.length > (kind === "order" ? 24000 : 12000)) throw new Error("Текст слишком длинный. Для приказа доступно 24 000 символов.");
    const isMaster = ["master", "owner"].includes(state.profile?.role);
    const parent = ({ order: "orders", post: "posts", broadcast: "broadcasts" })[kind];
    if (!parent) throw new Error("Неизвестный тип записи.");
    const ref = doc(db, parent, id);
    if (!isMaster) {
      if (kind !== "order" || state.profile?.role !== "player") {
        throw new Error("Редактировать публикации может только её автор или мастер.");
      }
      const snap = await getDoc(ref);
      if (!snap.exists() || snap.data().authorUid !== user.uid) throw new Error("Можно редактировать только свой пост.");
    }
    await updateDoc(ref, { text: body, updatedAt: serverTimestamp() });
  },
  async deleteWallEntry(id, kind) {
    const user = state.user;
    if (!db || !user) throw new Error("Сначала войдите через Google.");
    const isMaster = ["master", "owner"].includes(state.profile?.role);
    const parent = ({ order: "orders", post: "posts", broadcast: "broadcasts" })[kind];
    if (!parent) throw new Error("Неизвестный тип записи.");
    const ref = doc(db, parent, id);
    if (!isMaster) {
      if (kind !== "order" || state.profile?.role !== "player") {
        throw new Error("Удалить публикацию может только её автор или мастер.");
      }
      const snap = await getDoc(ref);
      if (!snap.exists() || snap.data().authorUid !== user.uid) throw new Error("Можно удалить только свой пост.");
    }
    await deleteDoc(ref);
  },
  async createBroadcast(post) {
    if (!db || !state.user || !["master", "owner"].includes(state.profile?.role)) throw new Error("Создавать публикации может только мастер.");
    const text = String(post?.text || "").trim();
    const senderName = String(post?.senderName || "").trim().slice(0, 80);
    const channel = String(post?.channel || "События").trim().slice(0, 40);
    const audience = post?.audience === "selected" ? "selected" : "all";
    const visibleTo = Array.isArray(post?.visibleTo) ? Array.from(new Set(post.visibleTo.map(String).filter(Boolean))).slice(0, 100) : [];
    if (!text) throw new Error("Добавьте текст публикации.");
    if (!senderName) throw new Error("Укажите, от чьего лица публикуется запись.");
    if (audience === "selected" && !visibleTo.length) throw new Error("Выберите хотя бы одного игрока.");
    await setDoc(doc(collection(db, "broadcasts")), {
      authorUid: state.user.uid, senderName, channel, text, imageUrl: String(post?.imageUrl || ""),
      audience, visibleTo: audience === "all" ? [] : visibleTo,
      status: "Событие", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  },
  privateMarkers() { return privateMapMarkers.slice(); },
  async createPrivateMarker(marker) {
    if (!db || !state.user || !["master", "owner"].includes(state.profile?.role)) throw new Error("Создавать личные метки может только мастер.");
    const visibleTo = Array.isArray(marker?.visibleTo) ? Array.from(new Set(marker.visibleTo.map(String).filter(Boolean))).slice(0, 100) : [];
    const x = Number(marker?.x), y = Number(marker?.y);
    const color = /^#[0-9a-f]{6}$/i.test(String(marker?.color || "")) ? marker.color : "#e2b94a";
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 2000 || y < 0 || y > 2000) throw new Error("Не удалось определить точку на карте.");
    if (!visibleTo.length) throw new Error("Выберите игроков, которым будет видна метка.");
    await setDoc(doc(collection(db, "privateMapMarkers")), {
      x, y, symbol: String(marker?.symbol || "post").slice(0, 32),
      title: String(marker?.title || "Личная метка").trim().slice(0, 100),
      caption: String(marker?.caption || "").trim().slice(0, 48),
      description: String(marker?.description || "").trim().slice(0, 1000),
      color, visibleTo, createdBy: state.user.uid,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  },
  async deletePrivateMarker(id) {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Удалять личные метки может только мастер.");
    await deleteDoc(doc(db, "privateMapMarkers", id));
  },
  async decideOrder(id, status, verdict) {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Нет прав мастера.");
    await updateDoc(doc(db, "orders", id), {
      status: String(status), verdict: String(verdict || ""),
      reviewedBy: state.user.uid, updatedAt: serverTimestamp()
    });
  },
  watchPlayerOrders(uid, receive, fail) {
    if (!db || !state.user) return () => {};
    if (state.user.uid !== uid && !["master", "owner"].includes(state.profile?.role)) throw new Error("Нет доступа к приказам другого игрока.");
    return onSnapshot(query(collection(db, "orders"), where("authorUid", "==", uid)), (snap) => {
      const entries = snap.docs.map((entry) => ({ ...entry.data(), id: entry.id, kind: "order", cloud: true }));
      const timestamp = (entry) => entry.createdAt?.toMillis ? entry.createdAt.toMillis() : 0;
      entries.sort((a, b) => timestamp(b) - timestamp(a));
      receive(entries);
    }, fail);
  },
  watchComments(postId, collectionName, receive, fail) {
    if (!db) return () => {};
    const parent = collectionName === "broadcasts" ? "broadcasts" : "posts";
    return onSnapshot(query(collection(db, parent, postId, "comments"), orderBy("createdAt", "asc")), (snap) => {
      receive(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    }, fail);
  },
  async listComments(postId, collectionName = "posts") {
    if (!db) return [];
    const parent = collectionName === "broadcasts" ? "broadcasts" : "posts";
    const snap = await getDocs(query(collection(db, parent, postId, "comments"), orderBy("createdAt", "asc"), limit(100)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  async addComment(postId, text, collectionName = "posts") {
    if (!state.user || !db || (!(["master", "owner"].includes(state.profile?.role)) && state.profile?.status !== "active")) {
      throw new Error("Комментарии доступны после одобрения заявки мастером.");
    }
    const body = String(text || "").trim();
    if (!body) return;
    const parent = collectionName === "broadcasts" ? "broadcasts" : "posts";
    await setDoc(doc(collection(db, parent, postId, "comments")), {
      authorUid: state.user.uid, displayName: ["master", "owner"].includes(state.profile?.role) ? "Мастер проекта" : (state.application?.callSign || "Игрок"),
      text: body, createdAt: serverTimestamp()
    });
  },
  async react(postId, value) {
    if (!state.user || !db || (!(["master", "owner"].includes(state.profile?.role)) && state.profile?.status !== "active")) {
      throw new Error("Реакции доступны после одобрения заявки мастером.");
    }
    await setDoc(doc(db, "posts", postId, "reactions", state.user.uid), {
      authorUid: state.user.uid, value: String(value), updatedAt: serverTimestamp()
    });
  },
  async listApplications() {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Нет доступа к заявкам.");
    const snap = await getDocs(query(collection(db, "applications"), orderBy("submittedAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  async assignApplication(uid, assignment) {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Нет прав мастера.");
    const masterUid = state.user.uid;
    const existingId = String(assignment?.squadId ?? "");
    const newSquad = assignment?.squad ? newApplicationSquad(assignment.squad) : null;
    if ((!existingId && !newSquad) || (existingId && newSquad)) throw new Error("Выберите существующий отряд или создайте новый.");
    const appRef = doc(db, "applications", uid);
    const userRef = doc(db, "users", uid);
    const worldRef = doc(db, "public", "world");
    return runTransaction(db, async (transaction) => {
      const app = (await transaction.get(appRef)).data();
      if (app?.applicantUid !== uid || !["pending", "approved"].includes(app.status)) {
        throw new Error("Заявка больше не доступна для назначения.");
      }
      const world = (await transaction.get(worldRef)).data();
      if (!Array.isArray(world?.squads)) throw new Error("Сначала опубликуйте общую карту во вкладке «Отряды».");
      const squads = world.squads.slice();
      if (squads.some((squad) => squad?.ownerUid === uid)) {
        throw new Error("У этого игрока уже есть отряд. Обновите список заявок.");
      }

      let assigned;
      if (newSquad) {
        if (squads.some((squad) => squad && String(squad.id) === String(newSquad.id))) {
          throw new Error("Такой номер отряда уже занят. Повторите создание.");
        }
        assigned = { ...newSquad, ownerUid: uid, reg: "approved", npc: 0 };
        squads.push(assigned);
      } else {
        const index = squads.findIndex((squad) => squad && String(squad.id) === existingId);
        if (index === -1) throw new Error("Выбранный отряд больше не существует.");
        if (squads[index].ownerUid) throw new Error("Выбранный отряд уже закреплён за другим игроком.");
        assigned = { ...squads[index], ownerUid: uid, reg: "approved", npc: 0 };
        squads[index] = assigned;
      }

      transaction.update(worldRef, { squads, updatedBy: masterUid, updatedAt: serverTimestamp() });
      transaction.update(appRef, {
        status: "approved", decisionReason: "", reviewedBy: masterUid,
        reviewedAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      transaction.update(userRef, {
        status: "active", squadId: String(assigned.id), updatedBy: masterUid, updatedAt: serverTimestamp()
      });
      return assigned;
    });
  },
  async unassignSquad(squadId, expectedOwnerUid) {
    if (!db || !state.user || !["master", "owner"].includes(state.profile?.role)) {
      throw new Error("Снимать игрока с отряда может только мастер.");
    }
    if (!expectedOwnerUid) throw new Error("У отряда нет закреплённого игрока.");
    const masterUid = state.user.uid;
    const worldRef = doc(db, "public", "world");
    return runTransaction(db, async (transaction) => {
      const world = (await transaction.get(worldRef)).data();
      const squads = Array.isArray(world?.squads) ? world.squads.slice() : [];
      const index = squads.findIndex((squad) => squad && String(squad.id) === String(squadId));
      if (index < 0) throw new Error("Отряд больше не существует. Обновите страницу.");
      if (squads[index].ownerUid !== expectedOwnerUid) {
        throw new Error("Привязка отряда уже изменилась. Обновите страницу.");
      }
      const releasedSquad = { ...squads[index], npc: 1 };
      delete releasedSquad.ownerUid;
      squads[index] = releasedSquad;
      const otherSquad = squads.find((squad) => squad?.ownerUid === expectedOwnerUid);
      transaction.update(worldRef, { squads, updatedBy: masterUid, updatedAt: serverTimestamp() });
      transaction.update(doc(db, "users", expectedOwnerUid), {
        status: otherSquad ? "active" : "visitor",
        squadId: otherSquad ? String(otherSquad.id) : "",
        updatedBy: masterUid,
        updatedAt: serverTimestamp()
      });
      return releasedSquad;
    });
  },
  async decideApplication(uid, decision, reason = "") {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Нет прав мастера.");
    if (decision !== "rejected") throw new Error("Для одобрения заявки создайте или выберите отряд игрока.");
    const decisionReason = String(reason).trim();
    if (!decisionReason) throw new Error("Укажите причину отказа.");
    const masterUid = state.user.uid;
    const appRef = doc(db, "applications", uid);
    const userRef = doc(db, "users", uid);
    await runTransaction(db, async (transaction) => {
      const app = (await transaction.get(appRef)).data();
      if (app?.applicantUid !== uid || !["pending", "approved"].includes(app.status)) {
        throw new Error("Эта заявка уже рассмотрена.");
      }
      const world = (await transaction.get(doc(db, "public", "world"))).data();
      if (Array.isArray(world?.squads) && world.squads.some((squad) => squad?.ownerUid === uid)) {
        throw new Error("За игроком уже закреплён отряд. Сначала снимите привязку во вкладке «Отряды».");
      }
      transaction.update(appRef, {
        status: "rejected", decisionReason, reviewedBy: masterUid,
        reviewedAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      transaction.update(userRef, {
        status: "visitor", squadId: "", updatedBy: masterUid, updatedAt: serverTimestamp()
      });
    });
  },
  async listUsers() {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Список игроков доступен только мастерам.");
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(200)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  async listMasterNotes() {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Мастерские заметки доступны только мастерам.");
    const snap = await getDocs(query(collection(db, "masterNotes"), limit(200)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  async saveMasterNote(uid, alias) {
    if (!db || !["master", "owner"].includes(state.profile?.role)) throw new Error("Менять мастерские имена может только мастер.");
    await setDoc(doc(db, "masterNotes", String(uid)), {
      uid: String(uid), alias: String(alias || "").trim().slice(0, 80),
      updatedBy: state.user.uid, updatedAt: serverTimestamp()
    });
  },
  async setUserRole(uid, role) {
    if (!db || state.profile?.role !== "owner" || !["player", "master"].includes(role)) {
      throw new Error("Управлять ролями может только создатель проекта.");
    }
    if (uid === state.user.uid) throw new Error("Свой аккаунт нельзя понизить в роли из этого меню.");
    await updateDoc(doc(db, "users", uid), {
      role,
      updatedBy: state.user.uid,
      updatedAt: serverTimestamp()
    });
  }
};
window.LLAuth = api;

const config = window.LAST_LIGHT_FIREBASE_CONFIG;
if (!isUsableConfig(config)) {
  state.configured = false;
  publish();
} else {
  try {
    const [appSdk, authSdk, firestoreSdk] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js")
    ]);
    ({ initializeApp } = appSdk);
    ({ getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, browserLocalPersistence, browserSessionPersistence, setPersistence } = authSdk);
    ({ getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit, where, onSnapshot, serverTimestamp, runTransaction } = firestoreSdk);
    const app = initializeApp(config);
    auth = getAuth(app);
    try {
      await setPersistence(auth, browserLocalPersistence);
      authPersistence = browserLocalPersistence;
    } catch (error) {
      authPersistence = browserSessionPersistence;
      state.notice = "Браузер не сохранил вход надолго. Используйте обычное окно. В Edge разрешите cookies и данные сайта для hikikamoris.github.io и отключите их удаление при закрытии браузера. Пока вход действует только до закрытия вкладки.";
      await setPersistence(auth, browserSessionPersistence);
    }
    db = getFirestore(app);
    state.configured = true;
    watchGameClock();
    watchWorld();
    getRedirectResult(auth).catch((error) => {
      state.error = error.message || "Не удалось завершить вход Google.";
      publish();
    });
    onAuthStateChanged(auth, async (user) => {
      clearListeners();
      state.user = user;
      state.profile = null;
      state.application = null;
      state.error = "";
      if (!user) { startWallListeners(); publish(); return; }
      try {
        await ensurePlayerProfile(user);
        stopProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
          state.profile = snap.exists() ? snap.data() : null;
          startWallListeners();
          startPrivateMarkerListener();
          publish();
        }, (error) => { state.error = error.message; publish(); });
        stopApplication = onSnapshot(doc(db, "applications", user.uid), (snap) => {
          state.application = snap.exists() ? { id: snap.id, ...snap.data() } : null;
          startWallListeners();
          publish();
        }, (error) => { state.error = error.message; publish(); });
      } catch (error) {
        state.error = error.message || "Не удалось загрузить профиль.";
        publish();
      }
    });
  } catch (error) {
    state.error = error.message || "Не удалось подключить Firebase.";
    publish();
  }
}

