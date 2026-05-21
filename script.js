const CURRENCY_API = "https://open.er-api.com/v6/latest/USD";
const STORAGE_KEY = "currency_rates_cache_v1";

const currencyNames = new Intl.DisplayNames(["ru"], { type: "currency" });

const unitDefinitions = {
  length: {
    label: "Длина",
    base: "meter",
    units: {
      meter: { label: "Метр", factor: 1 },
      kilometer: { label: "Километр", factor: 1000 },
      centimeter: { label: "Сантиметр", factor: 0.01 },
      millimeter: { label: "Миллиметр", factor: 0.001 },
      mile: { label: "Миля", factor: 1609.344 },
      yard: { label: "Ярд", factor: 0.9144 },
      foot: { label: "Фут", factor: 0.3048 },
      inch: { label: "Дюйм", factor: 0.0254 }
    }
  },
  weight: {
    label: "Вес",
    base: "kilogram",
    units: {
      kilogram: { label: "Килограмм", factor: 1 },
      gram: { label: "Грамм", factor: 0.001 },
      milligram: { label: "Миллиграмм", factor: 0.000001 },
      pound: { label: "Фунт", factor: 0.45359237 },
      ounce: { label: "Унция", factor: 0.028349523125 },
      ton: { label: "Тонна", factor: 1000 }
    }
  },
  temperature: {
    label: "Температура",
    base: "celsius",
    units: {
      celsius: { label: "°C" },
      fahrenheit: { label: "°F" },
      kelvin: { label: "K" }
    }
  },
  area: {
    label: "Площадь",
    base: "square_meter",
    units: {
      square_meter: { label: "м²", factor: 1 },
      square_kilometer: { label: "км²", factor: 1_000_000 },
      hectare: { label: "Гектар", factor: 10_000 },
      acre: { label: "Акр", factor: 4046.8564224 },
      square_foot: { label: "фт²", factor: 0.09290304 }
    }
  }
};

let ratesData = null;
let selectedFromCurrency = "USD";
let selectedToCurrency = "EUR";

const els = {
  liveClock: document.getElementById("liveClock"),
  dataStatus: document.getElementById("dataStatus"),
  amount: document.getElementById("amount"),
  fromCurrencySearch: document.getElementById("fromCurrencySearch"),
  toCurrencySearch: document.getElementById("toCurrencySearch"),
  currencyList: document.getElementById("currencyList"),
  swapBtn: document.getElementById("swapBtn"),
  currencyResult: document.getElementById("currencyResult"),
  ratesInfo: document.getElementById("ratesInfo"),
  unitCategory: document.getElementById("unitCategory"),
  unitAmount: document.getElementById("unitAmount"),
  fromUnit: document.getElementById("fromUnit"),
  toUnit: document.getElementById("toUnit"),
  unitResult: document.getElementById("unitResult")
};

function updateClock() {
  const now = new Date();
  els.liveClock.textContent = now.toLocaleString("ru-RU", {
    dateStyle: "full",
    timeStyle: "medium"
  });
}

function capitalizeFirst(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function currencyDisplay(code) {
  try {
    const display = currencyNames.of(code);
    const normalized = display ? capitalizeFirst(display) : code;
    return `${code} — ${normalized}`;
  } catch {
    return code;
  }
}

function populateCurrencies(codes) {
  const sorted = [...codes].sort();
  els.currencyList.innerHTML = "";

  sorted.forEach((code) => {
    const option = document.createElement("option");
    option.value = currencyDisplay(code);
    els.currencyList.append(option);
  });

  selectedFromCurrency = sorted.includes("USD") ? "USD" : sorted[0];
  selectedToCurrency = sorted.includes("EUR") ? "EUR" : sorted[1] || sorted[0];

  els.fromCurrencySearch.value = currencyDisplay(selectedFromCurrency);
  els.toCurrencySearch.value = currencyDisplay(selectedToCurrency);
}

function resolveCurrencyFromInput(value, { strict = false } = {}) {
  if (!ratesData) return null;
  const raw = value.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const codes = Object.keys(ratesData.rates);

  const directCode = raw.match(/^[A-Za-z]{3}$/) ? upper : null;
  if (directCode && codes.includes(directCode)) return directCode;

  const byPrefix = raw.split("—")[0]?.trim().toUpperCase();
  if (byPrefix && codes.includes(byPrefix)) return byPrefix;

  const exactDisplay = codes.find((code) => currencyDisplay(code).toUpperCase() === upper);
  if (exactDisplay) return exactDisplay;

  if (strict) return null;

  return codes.find((code) => currencyDisplay(code).toUpperCase().includes(upper)) || null;
}

function applyCurrencySearch(searchValue, target, { strict = false, commit = false } = {}) {
  const match = resolveCurrencyFromInput(searchValue, { strict });
  if (!match) return;

  if (target === "from") {
    selectedFromCurrency = match;
    if (commit) els.fromCurrencySearch.value = currencyDisplay(match);
  } else {
    selectedToCurrency = match;
    if (commit) els.toCurrencySearch.value = currencyDisplay(match);
  }
  convertCurrency();
}

function convertCurrency() {
  if (!ratesData) return;

  const amount = Number(els.amount.value);
  if (amount < 0) {
    els.currencyResult.textContent = "Сумма не может быть отрицательной.";
    return;
  }
  const from = selectedFromCurrency;
  const to = selectedToCurrency;

  if (!Number.isFinite(amount)) {
    els.currencyResult.textContent = "Введите корректное число.";
    return;
  }

  const fromRate = ratesData.rates[from];
  const toRate = ratesData.rates[to];

  if (!fromRate || !toRate) {
    els.currencyResult.textContent = "Нет данных для выбранной валюты.";
    return;
  }

  const usdAmount = amount / fromRate;
  const result = usdAmount * toRate;

  els.currencyResult.textContent = `${amount.toLocaleString("ru-RU")} ${from} = ${result.toLocaleString("ru-RU", {
    maximumFractionDigits: 6
  })} ${to}`;

  const ts = new Date(ratesData.time_last_update_unix * 1000);
  els.ratesInfo.textContent = `Обновление курсов: ${ts.toLocaleString("ru-RU")}. Источник: ${ratesData.provider}.`;
}

async function loadRates() {
  let usedCache = false;
  try {
    const response = await fetch(CURRENCY_API, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.rates || data.result !== "success") throw new Error("Некорректный формат данных");

    ratesData = {
      rates: data.rates,
      time_last_update_unix: data.time_last_update_unix,
      provider: "open.er-api.com (online)"
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(ratesData));
    els.dataStatus.textContent = "Онлайн-режим: актуальные курсы загружены.";
  } catch (error) {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) {
      els.dataStatus.textContent = `Ошибка загрузки и нет кэша: ${error.message}`;
      return;
    }

    ratesData = JSON.parse(cached);
    usedCache = true;
    els.dataStatus.textContent = "Офлайн-режим: используются последние сохранённые курсы.";
  }

  populateCurrencies(Object.keys(ratesData.rates));
  convertCurrency();

  if (usedCache) {
    els.dataStatus.style.color = "#fbbf24";
  } else {
    els.dataStatus.style.color = "#22c55e";
  }
}

function populateUnitCategories() {
  Object.entries(unitDefinitions).forEach(([key, def]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = def.label;
    els.unitCategory.append(option);
  });
  els.unitCategory.value = "length";
}

function populateUnitsForCategory() {
  const category = unitDefinitions[els.unitCategory.value];
  const units = Object.entries(category.units);

  [els.fromUnit, els.toUnit].forEach((select) => {
    select.innerHTML = "";
    units.forEach(([key, unit]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = unit.label;
      select.append(option);
    });
  });

  els.fromUnit.value = units[0][0];
  els.toUnit.value = units[1]?.[0] || units[0][0];
  convertUnits();
}

function convertTemperature(value, from, to) {
  let celsius;
  if (from === "celsius") celsius = value;
  if (from === "fahrenheit") celsius = ((value - 32) * 5) / 9;
  if (from === "kelvin") celsius = value - 273.15;

  if (to === "celsius") return celsius;
  if (to === "fahrenheit") return (celsius * 9) / 5 + 32;
  return celsius + 273.15;
}

function convertUnits() {
  const categoryKey = els.unitCategory.value;
  const category = unitDefinitions[categoryKey];
  const value = Number(els.unitAmount.value);
  if (categoryKey !== "temperature" && value < 0) {
    els.unitResult.textContent = "Для этой категории значение не должно быть отрицательным.";
    return;
  }
  const from = els.fromUnit.value;
  const to = els.toUnit.value;

  if (!Number.isFinite(value)) {
    els.unitResult.textContent = "Введите корректное значение.";
    return;
  }

  let result;
  if (categoryKey === "temperature") {
    result = convertTemperature(value, from, to);
  } else {
    const fromFactor = category.units[from].factor;
    const toFactor = category.units[to].factor;
    result = (value * fromFactor) / toFactor;
  }

  els.unitResult.textContent = `${value.toLocaleString("ru-RU")} ${category.units[from].label} = ${result.toLocaleString("ru-RU", {
    maximumFractionDigits: 8
  })} ${category.units[to].label}`;
}

function bindEvents() {
  els.amount.addEventListener("input", convertCurrency);
  els.fromCurrencySearch.addEventListener("input", (e) => applyCurrencySearch(e.target.value, "from", { strict: true }));
  els.toCurrencySearch.addEventListener("input", (e) => applyCurrencySearch(e.target.value, "to", { strict: true }));

  els.fromCurrencySearch.addEventListener("change", (e) => applyCurrencySearch(e.target.value, "from", { commit: true }));
  els.toCurrencySearch.addEventListener("change", (e) => applyCurrencySearch(e.target.value, "to", { commit: true }));

  els.fromCurrencySearch.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyCurrencySearch(e.target.value, "from", { commit: true });
  });
  els.toCurrencySearch.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyCurrencySearch(e.target.value, "to", { commit: true });
  });

  els.swapBtn.addEventListener("click", () => {
    const from = selectedFromCurrency;
    selectedFromCurrency = selectedToCurrency;
    selectedToCurrency = from;
    els.fromCurrencySearch.value = currencyDisplay(selectedFromCurrency);
    els.toCurrencySearch.value = currencyDisplay(selectedToCurrency);
    convertCurrency();
  });

  els.unitCategory.addEventListener("change", populateUnitsForCategory);
  els.unitAmount.addEventListener("input", convertUnits);
  [els.fromUnit, els.toUnit].forEach((el) => el.addEventListener("change", convertUnits));
}

function init() {
  updateClock();
  setInterval(updateClock, 1000);
  populateUnitCategories();
  populateUnitsForCategory();
  bindEvents();
  loadRates();
}

init();
