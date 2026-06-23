const DB_NAME = "cookbook-pwa-db";
const DB_VERSION = 1;
const DISH_STORE = "dishes";
const MENU_STORE = "menus";
const WEEK_DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

let db;
let dishes = [];
let currentMenu = [];
let currentRating = 4;
let photoDataUrl = "";
let selectedDishId = null;
let lastPickId = null;
let selectedMenuIndex = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  todayText: $("#todayText"),
  dishCount: $("#dishCount"),
  topRatedCount: $("#topRatedCount"),
  menuCount: $("#menuCount"),
  recentList: $("#recentList"),
  dishGrid: $("#dishGrid"),
  weekList: $("#weekList"),
  searchInput: $("#searchInput"),
  dishDialog: $("#dishDialog"),
  dishForm: $("#dishForm"),
  dishFormTitle: $("#dishFormTitle"),
  dishId: $("#dishId"),
  nameInput: $("#nameInput"),
  ingredientsInput: $("#ingredientsInput"),
  notesInput: $("#notesInput"),
  photoInput: $("#photoInput"),
  photoPicker: $("#photoPicker"),
  photoPreview: $("#photoPreview"),
  photoHint: $("#photoHint"),
  ratingButtons: $("#ratingButtons"),
  deleteDish: $("#deleteDish"),
  detailDialog: $("#detailDialog"),
  detailName: $("#detailName"),
  detailPhoto: $("#detailPhoto"),
  detailRating: $("#detailRating"),
  detailDate: $("#detailDate"),
  detailIngredients: $("#detailIngredients"),
  detailNotes: $("#detailNotes"),
  editFromDetail: $("#editFromDetail"),
  pickDialog: $("#pickDialog"),
  pickPhoto: $("#pickPhoto"),
  pickName: $("#pickName"),
  pickIngredients: $("#pickIngredients"),
  toast: $("#toast"),
  settingsDialog: $("#settingsDialog"),
  importData: $("#importData"),
  menuPickerDialog: $("#menuPickerDialog"),
  menuPickerTitle: $("#menuPickerTitle"),
  menuPickerList: $("#menuPickerList"),
  clearMenuDay: $("#clearMenuDay"),
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DISH_STORE)) {
        database.createObjectStore(DISH_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(MENU_STORE)) {
        database.createObjectStore(MENU_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function remove(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadState() {
  dishes = (await getAll(DISH_STORE)).sort((a, b) => b.updatedAt - a.updatedAt);
  const menuRows = await getAll(MENU_STORE);
  currentMenu = menuRows.find((row) => row.id === "current")?.items ?? [];
}

function formatDate(ts) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(ts));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function ratingText(rating) {
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

function initials(name) {
  return (name || "菜").trim().slice(0, 2);
}

function placeholder(name, className = "") {
  const node = document.createElement("div");
  node.className = `placeholder-photo ${className}`.trim();
  node.textContent = initials(name);
  return node;
}

function dishImage(dish, className = "") {
  if (!dish.photo) return placeholder(dish.name, className);
  const img = document.createElement("img");
  img.src = dish.photo;
  img.alt = dish.name;
  if (className) img.className = className;
  return img;
}

function dishCard(dish) {
  const button = document.createElement("button");
  button.className = "dish-card";
  button.type = "button";
  button.append(dishImage(dish));

  const body = document.createElement("div");
  body.className = "dish-card-body";
  body.innerHTML = `
    <h3></h3>
    <p></p>
    <span class="rating-text"></span>
  `;
  body.querySelector("h3").textContent = dish.name;
  body.querySelector("p").textContent = dish.ingredients || "还没有记录食材";
  body.querySelector(".rating-text").textContent = ratingText(dish.rating);
  button.append(body);
  button.addEventListener("click", () => openDetail(dish.id));
  return button;
}

function renderHome() {
  els.dishCount.textContent = dishes.length;
  els.topRatedCount.textContent = dishes.filter((dish) => dish.rating >= 4).length;
  els.menuCount.textContent = currentMenu.filter(Boolean).length;
  els.recentList.innerHTML = "";

  if (!dishes.length) {
    els.recentList.innerHTML = `
      <article class="empty-state">
        <h3>先加第一道菜</h3>
        <p>把你最近做过的一道菜记下来，之后就能随机推荐和生成菜单了。</p>
      </article>
    `;
    return;
  }

  dishes.slice(0, 8).forEach((dish) => els.recentList.append(dishCard(dish)));
}

function renderLibrary() {
  const query = els.searchInput.value.trim().toLowerCase();
  const filtered = dishes.filter((dish) => {
    const haystack = `${dish.name} ${dish.ingredients} ${dish.notes}`.toLowerCase();
    return haystack.includes(query);
  });

  els.dishGrid.innerHTML = "";
  if (!filtered.length) {
    els.dishGrid.innerHTML = `
      <article class="empty-state">
        <h3>${dishes.length ? "没找到这道菜" : "菜品库还是空的"}</h3>
        <p>${dishes.length ? "换个菜名或食材再试试。" : "点击添加，记录菜名、照片、食材、评分和备注。"}</p>
      </article>
    `;
    return;
  }

  filtered.forEach((dish) => els.dishGrid.append(dishCard(dish)));
}

function getMenuDish(id) {
  return dishes.find((dish) => dish.id === id);
}

function renderMenu() {
  els.weekList.innerHTML = "";

  if (!dishes.length) {
    els.weekList.innerHTML = `
      <article class="empty-state">
        <h3>还不能排菜单</h3>
        <p>先记录几道菜，再生成近一周菜单。</p>
      </article>
    `;
    return;
  }

  const items = currentMenu.length ? currentMenu : Array(7).fill(null);
  items.forEach((dishId, index) => {
    const dish = getMenuDish(dishId);
    const row = document.createElement("article");
    row.className = "week-row";
    row.innerHTML = `
      <span class="week-day">${WEEK_DAYS[index]}</span>
      <div>
        <h3></h3>
        <p></p>
      </div>
      <button class="tiny-button" type="button">安排</button>
    `;
    row.querySelector("h3").textContent = dish?.name ?? "待安排";
    row.querySelector("p").textContent = dish?.ingredients ?? "点安排手动选择，或点生成自动排一周";
    row.querySelector("button").addEventListener("click", () => openMenuPicker(index));
    els.weekList.append(row);
  });
}

function renderAll() {
  renderHome();
  renderLibrary();
  renderMenu();
}

function setActiveTab(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$(".tab[data-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
}

function openDishForm(dish = null) {
  selectedDishId = dish?.id ?? null;
  currentRating = dish?.rating ?? 4;
  photoDataUrl = dish?.photo ?? "";
  els.dishFormTitle.textContent = dish ? "编辑菜品" : "添加菜品";
  els.dishId.value = dish?.id ?? "";
  els.nameInput.value = dish?.name ?? "";
  els.ingredientsInput.value = dish?.ingredients ?? "";
  els.notesInput.value = dish?.notes ?? "";
  els.deleteDish.classList.toggle("hidden", !dish);
  updatePhotoPreview();
  renderRatingButtons();
  els.dishDialog.showModal();
  window.setTimeout(() => els.nameInput.focus(), 60);
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function updatePhotoPreview() {
  els.photoPicker.classList.toggle("has-photo", Boolean(photoDataUrl));
  els.photoPreview.src = photoDataUrl || "";
  els.photoHint.textContent = photoDataUrl ? "更换照片" : "选择照片";
}

function renderRatingButtons() {
  els.ratingButtons.innerHTML = "";
  for (let value = 1; value <= 5; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${value}★`;
    button.setAttribute("aria-label", `${value}星`);
    button.title = ratingText(value);
    button.classList.toggle("active", value === currentRating);
    button.addEventListener("click", () => {
      currentRating = value;
      renderRatingButtons();
    });
    els.ratingButtons.append(button);
  }
}

async function resizeImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = dataUrl;
  });

  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function saveDish(event) {
  event.preventDefault();
  const now = Date.now();
  const existing = dishes.find((dish) => dish.id === selectedDishId);
  const dish = {
    id: existing?.id ?? crypto.randomUUID(),
    name: els.nameInput.value.trim(),
    ingredients: els.ingredientsInput.value.trim(),
    notes: els.notesInput.value.trim(),
    rating: currentRating,
    photo: photoDataUrl,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (!dish.name) {
    showToast("先写菜名");
    return;
  }

  await put(DISH_STORE, dish);
  await loadState();
  renderAll();
  closeDialog(els.dishDialog);
  showToast(existing ? "已更新" : "已添加");
}

async function deleteDish() {
  if (!selectedDishId) return;
  await remove(DISH_STORE, selectedDishId);
  currentMenu = currentMenu.map((id) => (id === selectedDishId ? null : id));
  await saveCurrentMenu();
  await loadState();
  renderAll();
  closeDialog(els.dishDialog);
  closeDialog(els.detailDialog);
  showToast("已删除");
}

function openDetail(id) {
  const dish = dishes.find((item) => item.id === id);
  if (!dish) return;
  selectedDishId = id;
  els.detailName.textContent = dish.name;
  els.detailRating.textContent = ratingText(dish.rating);
  els.detailDate.textContent = `更新于 ${formatDate(dish.updatedAt)}`;
  els.detailIngredients.textContent = dish.ingredients || "还没有记录食材";
  els.detailNotes.textContent = dish.notes || "还没有备注";
  els.detailPhoto.replaceWith(dishImage(dish, "detail-photo"));
  els.detailPhoto = $(".detail-photo");
  els.detailDialog.showModal();
}

function chooseRandomDish(excludeId = null) {
  if (!dishes.length) return null;
  const pool = dishes.filter((dish) => dish.id !== excludeId);
  const source = pool.length ? pool : dishes;
  const weighted = source.flatMap((dish) => Array(Math.max(1, dish.rating)).fill(dish));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function openPick() {
  const dish = chooseRandomDish(lastPickId);
  if (!dish) {
    showToast("先添加一道菜");
    openDishForm();
    return;
  }
  lastPickId = dish.id;
  els.pickName.textContent = dish.name;
  els.pickIngredients.textContent = dish.ingredients || "还没有记录食材";
  els.pickPhoto.replaceWith(dishImage(dish, "detail-photo"));
  els.pickPhoto = $("#pickDialog .detail-photo");
  els.pickDialog.showModal();
}

function buildWeeklyMenu() {
  if (!dishes.length) return [];
  const sorted = [...dishes].sort((a, b) => b.rating - a.rating || b.updatedAt - a.updatedAt);
  const result = [];
  const used = new Set();

  while (result.length < 7 && used.size < dishes.length) {
    const available = sorted.filter((dish) => !used.has(dish.id));
    const topSlice = available.slice(0, Math.min(4, available.length));
    const pick = topSlice[Math.floor(Math.random() * topSlice.length)];
    used.add(pick.id);
    result.push(pick.id);
  }

  while (result.length < 7) {
    result.push(sorted[result.length % sorted.length].id);
  }

  return result;
}

async function saveCurrentMenu() {
  await put(MENU_STORE, {
    id: "current",
    items: currentMenu,
    updatedAt: Date.now(),
  });
}

async function generateMenu() {
  if (!dishes.length) {
    showToast("先添加几道菜");
    return;
  }
  currentMenu = buildWeeklyMenu();
  await saveCurrentMenu();
  renderAll();
  showToast("本周菜单已生成");
}

async function replaceMenuDay(index) {
  if (!dishes.length) return;
  const used = new Set(currentMenu.filter(Boolean));
  used.delete(currentMenu[index]);
  const available = dishes.filter((dish) => !used.has(dish.id));
  const dish = available[Math.floor(Math.random() * available.length)] ?? chooseRandomDish(currentMenu[index]);
  currentMenu = currentMenu.length ? [...currentMenu] : Array(7).fill(null);
  currentMenu[index] = dish.id;
  await saveCurrentMenu();
  renderAll();
  showToast(`${WEEK_DAYS[index]}已替换`);
}

function openMenuPicker(index) {
  if (!dishes.length) {
    showToast("先添加几道菜");
    return;
  }

  selectedMenuIndex = index;
  els.menuPickerTitle.textContent = `安排${WEEK_DAYS[index]}`;
  renderMenuPickerOptions();
  els.menuPickerDialog.showModal();
}

function renderMenuPickerOptions() {
  els.menuPickerList.innerHTML = "";
  const currentDishId = selectedMenuIndex === null ? null : currentMenu[selectedMenuIndex];

  dishes.forEach((dish) => {
    const button = document.createElement("button");
    button.className = "menu-picker-item";
    button.type = "button";
    button.classList.toggle("active", dish.id === currentDishId);
    button.append(dishImage(dish, "menu-picker-photo"));

    const body = document.createElement("span");
    body.className = "menu-picker-body";
    body.innerHTML = `
      <strong></strong>
      <small></small>
    `;
    body.querySelector("strong").textContent = dish.name;
    body.querySelector("small").textContent = dish.ingredients || ratingText(dish.rating);
    button.append(body);

    button.addEventListener("click", () => setMenuDay(dish.id));
    els.menuPickerList.append(button);
  });
}

async function setMenuDay(dishId) {
  if (selectedMenuIndex === null) return;
  currentMenu = currentMenu.length ? [...currentMenu] : Array(7).fill(null);
  currentMenu[selectedMenuIndex] = dishId;
  await saveCurrentMenu();
  renderAll();
  closeDialog(els.menuPickerDialog);
  showToast(`${WEEK_DAYS[selectedMenuIndex]}已安排`);
  selectedMenuIndex = null;
}

async function clearMenuDay() {
  if (selectedMenuIndex === null) return;
  currentMenu = currentMenu.length ? [...currentMenu] : Array(7).fill(null);
  currentMenu[selectedMenuIndex] = null;
  await saveCurrentMenu();
  renderAll();
  closeDialog(els.menuPickerDialog);
  showToast("已清空当天");
  selectedMenuIndex = null;
}

function exportData() {
  const photoCount = dishes.filter((dish) => Boolean(dish.photo)).length;
  const payload = {
    backupVersion: 2,
    app: "今天做啥",
    exportedAt: new Date().toISOString(),
    photoCount,
    dishes: dishes.map((dish) => ({ ...dish })),
    menu: currentMenu,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `今天做啥-备份-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast(`已导出完整备份，包含${photoCount}张照片`);
}

async function importData(file) {
  if (!file) return;
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!Array.isArray(payload.dishes)) throw new Error("Invalid backup");
  await clearStore(DISH_STORE);
  await clearStore(MENU_STORE);
  for (const dish of payload.dishes) {
    await put(DISH_STORE, dish);
  }
  currentMenu = Array.isArray(payload.menu) ? payload.menu : [];
  await saveCurrentMenu();
  await loadState();
  renderAll();
  showToast("备份已导入");
}

function bindEvents() {
  $$(".tab[data-tab]").forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));
  $$("[data-tab-target]").forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tabTarget)));
  $("#addTab").addEventListener("click", () => openDishForm());
  $("#openAddDish").addEventListener("click", () => openDishForm());
  $("#randomButton").addEventListener("click", openPick);
  $("#pickAgain").addEventListener("click", openPick);
  $("#generateMenu").addEventListener("click", generateMenu);
  $("#settingsButton").addEventListener("click", () => els.settingsDialog.showModal());
  $("#exportData").addEventListener("click", exportData);
  els.clearMenuDay.addEventListener("click", clearMenuDay);

  els.searchInput.addEventListener("input", renderLibrary);
  els.dishForm.addEventListener("submit", saveDish);
  els.deleteDish.addEventListener("click", deleteDish);
  els.editFromDetail.addEventListener("click", () => {
    const dish = dishes.find((item) => item.id === selectedDishId);
    closeDialog(els.detailDialog);
    openDishForm(dish);
  });

  els.photoInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    photoDataUrl = await resizeImage(file);
    updatePhotoPreview();
    event.target.value = "";
  });

  els.importData.addEventListener("change", async (event) => {
    try {
      await importData(event.target.files?.[0]);
      closeDialog(els.settingsDialog);
    } catch {
      showToast("备份文件无法导入");
    } finally {
      event.target.value = "";
    }
  });

  $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialog(els.dishDialog)));
  $$("[data-close-detail]").forEach((button) => button.addEventListener("click", () => closeDialog(els.detailDialog)));
  $$("[data-close-pick]").forEach((button) => button.addEventListener("click", () => closeDialog(els.pickDialog)));
  $$("[data-close-settings]").forEach((button) => button.addEventListener("click", () => closeDialog(els.settingsDialog)));
  $$("[data-close-menu-picker]").forEach((button) => button.addEventListener("click", () => closeDialog(els.menuPickerDialog)));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch {
    // The app still works without offline caching.
  }
}

async function init() {
  els.todayText.textContent = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  renderRatingButtons();
  bindEvents();
  db = await openDb();
  await loadState();
  renderAll();
  registerServiceWorker();
}

init();
