const DB_NAME = "cookbook-pwa-db";
const DB_VERSION = 2;
const DISH_STORE = "dishes";
const MENU_STORE = "menus";
const SETTINGS_STORE = "settings";
const WEEK_DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

let db;
let dishes = [];
let currentMenu = [];
let appSettings = {};
let currentRating = 4;
let photoDataUrl = "";
let photoCrop = { x: 50, y: 50, zoom: 1 };
let selectedDishId = null;
let lastPickId = null;
let selectedMenuIndex = null;
let selectedMenuDishIds = [];
let menuPickerCategory = "全部";
let selectedCategory = "全部";
let isCategoryManaging = false;
let categoryPressTimer = null;
let draggedCategory = null;
let draggedCategoryRow = null;
let librarySortBy = "recent";
let selectedDishTags = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const on = (node, eventName, handler) => {
  if (node) node.addEventListener(eventName, handler);
};

const els = {
  todayText: $("#todayText"),
  dishCount: $("#dishCount"),
  topRatedCount: $("#topRatedCount"),
  menuCount: $("#menuCount"),
  recentList: $("#recentList"),
  dishGrid: $("#dishGrid"),
  weekList: $("#weekList"),
  searchInput: $("#searchInput"),
  categoryList: $("#categoryList"),
  newCategoryInput: $("#newCategoryInput"),
  addCategoryButton: $("#addCategoryButton"),
  sortRecentButton: $("#sortRecentButton"),
  sortRatingButton: $("#sortRatingButton"),
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
  photoAdjuster: $("#photoAdjuster"),
  photoCropX: $("#photoCropX"),
  photoCropY: $("#photoCropY"),
  photoZoom: $("#photoZoom"),
  ratingButtons: $("#ratingButtons"),
  tagButtons: $("#tagButtons"),
  tagInput: $("#tagInput"),
  addTagButton: $("#addTagButton"),
  deleteDish: $("#deleteDish"),
  detailDialog: $("#detailDialog"),
  detailName: $("#detailName"),
  detailPhotoButton: $("#detailPhotoButton"),
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
  originalPhotoDialog: $("#originalPhotoDialog"),
  originalPhotoImage: $("#originalPhotoImage"),
  toast: $("#toast"),
  settingsDialog: $("#settingsDialog"),
  importData: $("#importData"),
  heroImageInput: $("#heroImageInput"),
  resetHeroImage: $("#resetHeroImage"),
  menuPickerDialog: $("#menuPickerDialog"),
  menuPickerTitle: $("#menuPickerTitle"),
  menuSearchInput: $("#menuSearchInput"),
  menuCategoryList: $("#menuCategoryList"),
  menuPickerList: $("#menuPickerList"),
  clearMenuDay: $("#clearMenuDay"),
  saveMenuDay: $("#saveMenuDay"),
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
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
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
  const settingsRows = await getAll(SETTINGS_STORE);
  appSettings = settingsRows.find((row) => row.id === "app") ?? { id: "app" };
  applyHeroImage();
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

function normalizeTag(tag) {
  return tag.trim().replace(/\s+/g, " ").slice(0, 12);
}

function getAllCategories() {
  const saved = Array.isArray(appSettings.categories) ? appSettings.categories : [];
  const fromDishes = dishes.flatMap((dish) => (Array.isArray(dish.tags) ? dish.tags : []));
  const unique = new Set([...saved, ...fromDishes].map(normalizeTag).filter(Boolean));
  return ["全部", ...Array.from(unique)];
}

function startCategoryManage() {
  isCategoryManaging = true;
  renderCategories();
  showToast("已进入分类管理");
}

function stopCategoryManage() {
  isCategoryManaging = false;
  draggedCategory = null;
  renderCategories();
}

async function saveCategoryOrderFromDom() {
  if (!els.categoryList) return;
  const categories = Array.from(els.categoryList.querySelectorAll(".category-row"))
    .map((row) => row.dataset.category)
    .filter((category) => category && category !== "全部");
  await saveSettings({ categories });
  renderAll();
}

async function addCategory(tag) {
  const normalized = normalizeTag(tag);
  if (!normalized || normalized === "全部") return;
  const categories = getAllCategories().filter((item) => item !== "全部");
  if (!categories.includes(normalized)) {
    await saveSettings({ categories: [...categories, normalized] });
  }
}

async function deleteCategory(category) {
  if (!category || category === "全部") return;
  const ok = window.confirm(`删除“${category}”分类？菜品不会删除，只会移除这个分类标签。`);
  if (!ok) return;

  const savedCategories = Array.isArray(appSettings.categories) ? appSettings.categories : [];
  await saveSettings({ categories: savedCategories.filter((item) => item !== category) });

  const changedDishes = dishes.filter((dish) => Array.isArray(dish.tags) && dish.tags.includes(category));
  for (const dish of changedDishes) {
    await put(DISH_STORE, {
      ...dish,
      tags: dish.tags.filter((tag) => tag !== category),
      updatedAt: Date.now(),
    });
  }

  if (selectedCategory === category) selectedCategory = "全部";
  await loadState();
  renderAll();
  showToast(`已删除“${category}”分类`);
}

function applyHeroImage() {
  const image = appSettings.heroImage || "";
  document.documentElement.style.setProperty("--hero-image", image ? `url("${image}")` : 'url("./assets/hero-food.jpg")');
}

function ratingText(rating) {
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

function ratingScoreText(rating) {
  return `★ ${Number(rating || 0).toFixed(1)}`;
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

function getPhotoCrop(dish = {}) {
  const source = dish || {};
  return {
    x: Number.isFinite(Number(source.photoX)) ? Number(source.photoX) : 50,
    y: Number.isFinite(Number(source.photoY)) ? Number(source.photoY) : 50,
    zoom: Number.isFinite(Number(source.photoZoom)) ? Number(source.photoZoom) : 1,
  };
}

function applyPhotoCrop(node, crop = photoCrop) {
  const x = Math.min(100, Math.max(0, Number(crop.x) || 50));
  const y = Math.min(100, Math.max(0, Number(crop.y) || 50));
  const zoom = Math.min(2.2, Math.max(1, Number(crop.zoom) || 1));
  node.style.setProperty("--photo-x", `${x}%`);
  node.style.setProperty("--photo-y", `${y}%`);
  node.style.setProperty("--photo-zoom", zoom);
}

function dishImage(dish, className = "", options = {}) {
  if (!dish.photo) return placeholder(dish.name, className);
  if (options.thumbnail) {
    const frame = document.createElement("div");
    frame.className = `photo-frame ${className}`.trim();
    const img = document.createElement("img");
    img.src = dish.photo;
    img.alt = dish.name;
    applyPhotoCrop(img, getPhotoCrop(dish));
    frame.append(img);
    return frame;
  }
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
  button.append(dishImage(dish, "", { thumbnail: true }));

  const body = document.createElement("div");
  body.className = "dish-card-body";
  body.innerHTML = `
    <h3></h3>
    <span class="rating-text"></span>
  `;
  body.querySelector("h3").textContent = dish.name;
  body.querySelector(".rating-text").textContent = ratingScoreText(dish.rating);
  button.append(body);
  button.addEventListener("click", () => openDetail(dish.id));
  return button;
}

function renderHome() {
  els.dishCount.textContent = dishes.length;
  els.topRatedCount.textContent = dishes.filter((dish) => dish.rating >= 4).length;
  els.menuCount.textContent = countMenuDays();
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

function renderCategories() {
  if (!els.categoryList) return;
  els.categoryList.innerHTML = "";
  const categories = getAllCategories();
  if (!categories.includes(selectedCategory)) selectedCategory = "全部";

  if (isCategoryManaging) {
    const toolbar = document.createElement("div");
    toolbar.className = "category-manage-toolbar";
    toolbar.innerHTML = `
      <span>管理分类</span>
      <button type="button">完成</button>
    `;
    toolbar.querySelector("button").addEventListener("click", stopCategoryManage);
    els.categoryList.append(toolbar);
  }

  categories.forEach((category) => {
    const count = category === "全部"
      ? dishes.length
      : dishes.filter((dish) => Array.isArray(dish.tags) && dish.tags.includes(category)).length;
    const row = document.createElement("div");
    row.className = "category-row";
    row.classList.toggle("active", category === selectedCategory);
    row.classList.toggle("managing", isCategoryManaging);
    row.classList.toggle("dragging", category === draggedCategory);
    row.dataset.category = category;
    const button = document.createElement("button");
    button.className = "category-button";
    button.type = "button";
    button.classList.toggle("active", category === selectedCategory);
    button.innerHTML = `
      <span></span>
      <small></small>
    `;
    button.querySelector("span").textContent = category;
    button.querySelector("small").textContent = count;
    button.addEventListener("click", () => {
      if (isCategoryManaging) return;
      selectedCategory = category;
      renderLibrary();
    });
    button.addEventListener("pointerdown", () => {
      window.clearTimeout(categoryPressTimer);
      categoryPressTimer = window.setTimeout(startCategoryManage, 520);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((eventName) => {
      button.addEventListener(eventName, () => window.clearTimeout(categoryPressTimer));
    });
    row.append(button);

    if (isCategoryManaging && category !== "全部") {
      const handle = document.createElement("button");
      handle.className = "category-drag-handle";
      handle.type = "button";
      handle.setAttribute("aria-label", `拖拽${category}排序`);
      handle.textContent = "☰";
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        draggedCategory = category;
        draggedCategoryRow = row;
        handle.setPointerCapture?.(event.pointerId);
        row.classList.add("dragging");
      });
      handle.addEventListener("pointermove", (event) => {
        if (draggedCategory !== category || !draggedCategoryRow) return;
        const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest(".category-row");
        const target = targetRow?.dataset.category;
        if (target && target !== draggedCategory && target !== "全部") {
          const rect = targetRow.getBoundingClientRect();
          const before = event.clientY < rect.top + rect.height / 2;
          els.categoryList.insertBefore(draggedCategoryRow, before ? targetRow : targetRow.nextSibling);
        }
      });
      ["pointerup", "pointercancel"].forEach((eventName) => {
        handle.addEventListener(eventName, async () => {
          draggedCategory = null;
          draggedCategoryRow = null;
          row.classList.remove("dragging");
          await saveCategoryOrderFromDom();
        });
      });
      row.append(handle);

      const deleteButton = document.createElement("button");
      deleteButton.className = "category-delete";
      deleteButton.type = "button";
      deleteButton.setAttribute("aria-label", `删除${category}分类`);
      deleteButton.textContent = "×";
      deleteButton.addEventListener("click", () => deleteCategory(category));
      row.append(deleteButton);
    }
    els.categoryList.append(row);
  });
}

function renderLibrary() {
  const query = els.searchInput.value.trim().toLowerCase();
  renderCategories();
  els.sortRecentButton?.classList.toggle("active", librarySortBy === "recent");
  els.sortRatingButton?.classList.toggle("active", librarySortBy.startsWith("rating"));
  if (els.sortRatingButton) {
    els.sortRatingButton.textContent = librarySortBy === "rating-asc" ? "评分升序" : "评分降序";
  }

  const filtered = dishes
    .filter((dish) => {
      const tags = Array.isArray(dish.tags) ? dish.tags : [];
      return selectedCategory === "全部" || tags.includes(selectedCategory);
    })
    .filter((dish) => {
      const tags = Array.isArray(dish.tags) ? dish.tags.join(" ") : "";
      const haystack = `${dish.name} ${dish.ingredients} ${dish.notes} ${tags}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      if (librarySortBy === "rating-desc") return b.rating - a.rating || b.updatedAt - a.updatedAt;
      if (librarySortBy === "rating-asc") return a.rating - b.rating || b.updatedAt - a.updatedAt;
      return b.updatedAt - a.updatedAt;
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

function getMenuDishIds(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function getMenuDishes(value) {
  return getMenuDishIds(value).map(getMenuDish).filter(Boolean);
}

function countMenuDays(menu = currentMenu) {
  return menu.filter((item) => getMenuDishIds(item).length > 0).length;
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

  const items = Array.from({ length: 7 }, (_, index) => currentMenu[index] ?? []);
  items.forEach((menuValue, index) => {
    const menuDishes = getMenuDishes(menuValue);
    const row = document.createElement("article");
    row.className = "week-row";
    row.innerHTML = `
      <span class="week-day">${WEEK_DAYS[index]}</span>
      <div class="week-content">
        <h3></h3>
        <div class="week-dishes"></div>
      </div>
      <button class="tiny-button" type="button">安排</button>
    `;
    row.querySelector("h3").textContent = menuDishes.length
      ? menuDishes.map((dish) => dish.name).join("、")
      : "待安排";
    const dishList = row.querySelector(".week-dishes");
    if (menuDishes.length) {
      menuDishes.forEach((dish) => {
        const item = document.createElement("button");
        item.className = "week-dish-chip";
        item.type = "button";
        item.append(dishImage(dish, "week-dish-photo", { thumbnail: true }));
        const name = document.createElement("span");
        name.textContent = dish.name;
        item.append(name);
        item.addEventListener("click", () => openDetail(dish.id));
        dishList.append(item);
      });
    } else {
      const empty = document.createElement("p");
      empty.textContent = "点安排手动选择，或点生成自动排一周";
      dishList.append(empty);
    }
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
  photoCrop = getPhotoCrop(dish);
  selectedDishTags = Array.isArray(dish?.tags) ? [...dish.tags] : [];
  els.dishFormTitle.textContent = dish ? "编辑菜品" : "添加菜品";
  els.dishId.value = dish?.id ?? "";
  els.nameInput.value = dish?.name ?? "";
  els.ingredientsInput.value = dish?.ingredients ?? "";
  els.notesInput.value = dish?.notes ?? "";
  els.deleteDish.classList.toggle("hidden", !dish);
  updatePhotoPreview();
  renderRatingButtons();
  renderTagButtons();
  els.dishDialog.showModal();
  window.setTimeout(() => els.nameInput.focus(), 60);
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function updatePhotoPreview() {
  els.photoPicker.classList.toggle("has-photo", Boolean(photoDataUrl));
  els.photoAdjuster?.classList.toggle("hidden", !photoDataUrl);
  els.photoPreview.src = photoDataUrl || "";
  applyPhotoCrop(els.photoPreview, photoCrop);
  if (els.photoCropX) els.photoCropX.value = Math.round(photoCrop.x);
  if (els.photoCropY) els.photoCropY.value = Math.round(photoCrop.y);
  if (els.photoZoom) els.photoZoom.value = Math.round(photoCrop.zoom * 100);
  els.photoHint.textContent = photoDataUrl ? "更换照片" : "选择照片";
}

function updatePhotoCropFromControls() {
  photoCrop = {
    x: Number(els.photoCropX?.value ?? 50),
    y: Number(els.photoCropY?.value ?? 50),
    zoom: Number(els.photoZoom?.value ?? 100) / 100,
  };
  applyPhotoCrop(els.photoPreview, photoCrop);
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

function renderTagButtons() {
  if (!els.tagButtons) return;
  els.tagButtons.innerHTML = "";
  const categories = getAllCategories().filter((category) => category !== "全部");

  if (!categories.length) {
    const empty = document.createElement("p");
    empty.className = "tag-empty";
    empty.textContent = "还没有分类，可以先新增一个";
    els.tagButtons.append(empty);
    return;
  }

  categories.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tag;
    button.classList.toggle("active", selectedDishTags.includes(tag));
    button.addEventListener("click", () => {
      selectedDishTags = selectedDishTags.includes(tag)
        ? selectedDishTags.filter((item) => item !== tag)
        : [...selectedDishTags, tag];
      renderTagButtons();
    });
    els.tagButtons.append(button);
  });
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

async function saveSettings(nextSettings) {
  appSettings = {
    ...appSettings,
    ...nextSettings,
    id: "app",
    updatedAt: Date.now(),
  };
  await put(SETTINGS_STORE, appSettings);
  applyHeroImage();
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
    photoX: photoCrop.x,
    photoY: photoCrop.y,
    photoZoom: photoCrop.zoom,
    tags: [...selectedDishTags],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (!dish.name) {
    showToast("先写菜名");
    return;
  }

  await put(DISH_STORE, dish);
  if (selectedDishTags.length) {
    const categories = getAllCategories().filter((item) => item !== "全部");
    await saveSettings({ categories });
  }
  await loadState();
  renderAll();
  closeDialog(els.dishDialog);
  showToast(existing ? "已更新" : "已添加");
}

async function deleteDish() {
  if (!selectedDishId) return;
  await remove(DISH_STORE, selectedDishId);
  currentMenu = currentMenu.map((value) => {
    const remaining = getMenuDishIds(value).filter((id) => id !== selectedDishId);
    return remaining;
  });
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
  els.detailPhotoButton?.classList.toggle("has-photo", Boolean(dish.photo));
  if (els.detailPhotoButton) els.detailPhotoButton.disabled = !dish.photo;
  els.detailDialog.showModal();
}

function openOriginalPhoto() {
  const dish = dishes.find((item) => item.id === selectedDishId);
  if (!dish?.photo || !els.originalPhotoImage || !els.originalPhotoDialog) return;
  els.originalPhotoImage.src = dish.photo;
  els.originalPhotoImage.alt = dish.name;
  els.originalPhotoDialog.showModal();
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
    result.push([pick.id]);
  }

  while (result.length < 7) {
    result.push([sorted[result.length % sorted.length].id]);
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
  const used = new Set(currentMenu.flatMap(getMenuDishIds));
  getMenuDishIds(currentMenu[index]).forEach((id) => used.delete(id));
  const available = dishes.filter((dish) => !used.has(dish.id));
  const dish = available[Math.floor(Math.random() * available.length)] ?? chooseRandomDish(getMenuDishIds(currentMenu[index])[0]);
  currentMenu = currentMenu.length ? [...currentMenu] : Array(7).fill([]);
  currentMenu[index] = [dish.id];
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
  selectedMenuDishIds = getMenuDishIds(currentMenu[index]);
  menuPickerCategory = "全部";
  if (els.menuSearchInput) els.menuSearchInput.value = "";
  els.menuPickerTitle.textContent = `安排${WEEK_DAYS[index]}`;
  renderMenuPickerCategories();
  renderMenuPickerOptions();
  els.menuPickerDialog.showModal();
}

function renderMenuPickerCategories() {
  if (!els.menuCategoryList) return;
  els.menuCategoryList.innerHTML = "";
  const categories = getAllCategories();
  if (!categories.includes(menuPickerCategory)) menuPickerCategory = "全部";

  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-category-button";
    button.classList.toggle("active", category === menuPickerCategory);
    button.textContent = category;
    button.addEventListener("click", () => {
      menuPickerCategory = category;
      renderMenuPickerCategories();
      renderMenuPickerOptions();
    });
    els.menuCategoryList.append(button);
  });
}

function renderMenuPickerOptions() {
  if (!els.menuPickerList) return;
  els.menuPickerList.innerHTML = "";
  const query = (els.menuSearchInput?.value ?? "").trim().toLowerCase();
  const filtered = dishes.filter((dish) => {
    const tags = Array.isArray(dish.tags) ? dish.tags : [];
    const categoryMatch = menuPickerCategory === "全部" || tags.includes(menuPickerCategory);
    const haystack = `${dish.name} ${dish.ingredients} ${dish.notes} ${tags.join(" ")}`.toLowerCase();
    return categoryMatch && haystack.includes(query);
  });

  if (!filtered.length) {
    els.menuPickerList.innerHTML = `
      <article class="empty-state">
        <h3>没找到这道菜</h3>
        <p>换个关键词或分类试试。</p>
      </article>
    `;
    return;
  }

  filtered.forEach((dish) => {
    const button = document.createElement("button");
    button.className = "menu-picker-item";
    button.type = "button";
    button.classList.toggle("active", selectedMenuDishIds.includes(dish.id));
    button.append(dishImage(dish, "menu-picker-photo", { thumbnail: true }));

    const body = document.createElement("span");
    body.className = "menu-picker-body";
    body.innerHTML = `
      <strong></strong>
      <small></small>
    `;
    body.querySelector("strong").textContent = dish.name;
    body.querySelector("small").textContent = Array.isArray(dish.tags) && dish.tags.length
      ? `${dish.tags.join(" / ")} · ${ratingScoreText(dish.rating)}`
      : ratingScoreText(dish.rating);
    button.append(body);

    button.addEventListener("click", () => toggleMenuDish(dish.id));
    els.menuPickerList.append(button);
  });
}

function toggleMenuDish(dishId) {
  selectedMenuDishIds = selectedMenuDishIds.includes(dishId)
    ? selectedMenuDishIds.filter((id) => id !== dishId)
    : [...selectedMenuDishIds, dishId];
  renderMenuPickerOptions();
}

async function saveMenuDay() {
  if (selectedMenuIndex === null) return;
  currentMenu = currentMenu.length ? [...currentMenu] : Array(7).fill([]);
  currentMenu[selectedMenuIndex] = [...selectedMenuDishIds];
  await saveCurrentMenu();
  renderAll();
  closeDialog(els.menuPickerDialog);
  showToast(`${WEEK_DAYS[selectedMenuIndex]}已安排`);
  selectedMenuIndex = null;
  selectedMenuDishIds = [];
}

async function clearMenuDay() {
  if (selectedMenuIndex === null) return;
  currentMenu = currentMenu.length ? [...currentMenu] : Array(7).fill([]);
  currentMenu[selectedMenuIndex] = [];
  await saveCurrentMenu();
  renderAll();
  closeDialog(els.menuPickerDialog);
  showToast("已清空当天");
  selectedMenuIndex = null;
  selectedMenuDishIds = [];
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
    settings: { ...appSettings },
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
  await clearStore(SETTINGS_STORE);
  for (const dish of payload.dishes) {
    await put(DISH_STORE, dish);
  }
  currentMenu = Array.isArray(payload.menu) ? payload.menu : [];
  await saveCurrentMenu();
  if (payload.settings && typeof payload.settings === "object") {
    await saveSettings({ ...payload.settings, id: "app" });
  }
  await loadState();
  renderAll();
  showToast("备份已导入");
}

function bindEvents() {
  $$(".tab[data-tab]").forEach((tab) => on(tab, "click", () => setActiveTab(tab.dataset.tab)));
  $$("[data-tab-target]").forEach((button) => on(button, "click", () => setActiveTab(button.dataset.tabTarget)));
  on($("#addTab"), "click", () => openDishForm());
  on($("#openAddDish"), "click", () => openDishForm());
  on($("#randomButton"), "click", openPick);
  on($("#pickAgain"), "click", openPick);
  on($("#generateMenu"), "click", generateMenu);
  on($("#settingsButton"), "click", () => els.settingsDialog.showModal());
  on($("#exportData"), "click", exportData);
  on(els.sortRecentButton, "click", () => {
    librarySortBy = "recent";
    renderLibrary();
  });
  on(els.sortRatingButton, "click", () => {
    librarySortBy = librarySortBy === "rating-desc" ? "rating-asc" : "rating-desc";
    renderLibrary();
  });
  on(els.addCategoryButton, "click", async () => {
    const tag = normalizeTag(els.newCategoryInput?.value ?? "");
    if (!tag) return;
    await addCategory(tag);
    selectedCategory = tag;
    if (els.newCategoryInput) els.newCategoryInput.value = "";
    renderLibrary();
  });
  on(els.addTagButton, "click", async () => {
    const tag = normalizeTag(els.tagInput?.value ?? "");
    if (!tag) return;
    await addCategory(tag);
    if (!selectedDishTags.includes(tag)) selectedDishTags = [...selectedDishTags, tag];
    if (els.tagInput) els.tagInput.value = "";
    renderTagButtons();
    renderLibrary();
  });
  on(els.resetHeroImage, "click", async () => {
    await saveSettings({ heroImage: "" });
    showToast("首页背景图已恢复默认");
  });
  on(els.menuSearchInput, "input", renderMenuPickerOptions);
  on(els.saveMenuDay, "click", saveMenuDay);
  on(els.clearMenuDay, "click", clearMenuDay);

  on(els.searchInput, "input", renderLibrary);
  on(els.dishForm, "submit", saveDish);
  on(els.deleteDish, "click", deleteDish);
  [els.photoCropX, els.photoCropY, els.photoZoom].forEach((input) => {
    on(input, "input", updatePhotoCropFromControls);
  });
  on(els.detailPhotoButton, "click", openOriginalPhoto);
  on(els.editFromDetail, "click", () => {
    const dish = dishes.find((item) => item.id === selectedDishId);
    closeDialog(els.detailDialog);
    openDishForm(dish);
  });

  on(els.photoInput, "change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    photoDataUrl = await resizeImage(file);
    photoCrop = { x: 50, y: 50, zoom: 1 };
    updatePhotoPreview();
    event.target.value = "";
  });

  on(els.importData, "change", async (event) => {
    try {
      await importData(event.target.files?.[0]);
      closeDialog(els.settingsDialog);
    } catch {
      showToast("备份文件无法导入");
    } finally {
      event.target.value = "";
    }
  });

  on(els.heroImageInput, "change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const image = await resizeImage(file);
    await saveSettings({ heroImage: image });
    showToast("首页背景图已更换");
    event.target.value = "";
  });

  $$("[data-close-dialog]").forEach((button) => on(button, "click", () => closeDialog(els.dishDialog)));
  $$("[data-close-detail]").forEach((button) => on(button, "click", () => closeDialog(els.detailDialog)));
  $$("[data-close-pick]").forEach((button) => on(button, "click", () => closeDialog(els.pickDialog)));
  $$("[data-close-settings]").forEach((button) => on(button, "click", () => closeDialog(els.settingsDialog)));
  $$("[data-close-menu-picker]").forEach((button) => on(button, "click", () => {
    selectedMenuIndex = null;
    selectedMenuDishIds = [];
    closeDialog(els.menuPickerDialog);
  }));
  $$("[data-close-original-photo]").forEach((button) => on(button, "click", () => closeDialog(els.originalPhotoDialog)));
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
