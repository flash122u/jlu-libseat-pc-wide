// ==UserScript==
// @name         JLU LibSeat PC Wide Layout
// @namespace    local.libseat.pcwide
// @version      1.14.2
// @description  Improve libseat.jlu.edu.cn desktop layout, seat map scale, cover images, and time inputs.
// @match        https://libseat.jlu.edu.cn/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  "use strict";

  const SEAT_MAP_MAX_SCALE = 0.70;
  const SEAT_MAP_MIN_SCALE = 0.45;
  const SEAT_MAP_PADDING = 24;
  const FACILITY_DOM_STABLE_MS = 120;
  const FACILITY_REVEAL_FALLBACK_MS = 450;
  const SCRIPT_VERSION = "1.14.2";
  const DAY_OPEN_TIME = "08:00";
  const DAY_CLOSE_TIME = "22:00";
  const DEFAULT_MIN_RESERVATION_MINUTES = 30;
  const TOMORROW_DEFAULT_AFTER_MINUTES = 21 * 60;
  const RESERVATION_SUBMIT_PATH = "/v1/seat-applications";
  const ACTIVE_RESERVATIONS_PATH = "/v1/users/reservations/active";
  const SEAT_RESERVATIONS_BY_DATE_PREFIX = "/v1/seats";
  const DEFAULT_RESERVATION_RETRIES = 3;
  const DEFAULT_RESERVATION_RETRY_INTERVAL_MS = 500;
  const AUTO_RESERVATION_SUBMIT_MINUTES = 21 * 60;
  const AUTO_RESERVATION_MAX_TIMER_MS = 60 * 1000;
  const RESERVATION_SUCCESS_STATUSES = new Set(["AUTO_APPROVED", "APPROVED", "RESERVED"]);
  const FACILITY_IMAGE_BY_TYPE = {
    BOOKSHELF: "/static/images/seat/bookshelf.png",
    WALL: "/static/images/seat/wall.png",
    DOOR: "/static/images/seat/door.png",
    TOILET: "/static/images/seat/toilet.png",
    STAIR: "/static/images/seat/stair.png",
    ELEVATOR: "/static/images/seat/elevator.png",
    GATEWAY: "/static/images/seat/gateway.png",
  };
  const FACILITY_IMAGE_URLS = Object.keys(FACILITY_IMAGE_BY_TYPE).map((type) => FACILITY_IMAGE_BY_TYPE[type]);
  let replacementIndex = 0;
  let enhanceQueued = false;
  let seatMapLayoutQueued = false;
  const RANGE_PICKER_SELECTOR =
    "body > uni-app > uni-page > uni-page-wrapper > uni-page-body > uni-view > uni-view.paging > uni-view > uni-view";
  const PAGE_BRIDGE_SCRIPT_ID = "libseat-pc-wide-page-bridge";
  const css = `
    @media screen and (min-width: 768px) {
      :root {
        --h5-shell-width: min(98vw, 1600px) !important;
      }

      html,
      body {
        width: 100% !important;
        min-width: 1024px !important;
        overflow-x: auto !important;
        background: #f5f7fa !important;
      }

      uni-app,
      uni-page,
      uni-page-wrapper,
      uni-page-body,
      #app {
        width: var(--h5-shell-width) !important;
        max-width: none !important;
        margin-left: auto !important;
        margin-right: auto !important;
        box-sizing: border-box !important;
      }

      uni-app {
        box-shadow: none !important;
        background: #fff !important;
      }

      .container {
        max-width: none !important;
        width: 100% !important;
      }

      .uni-tabbar {
        width: var(--h5-shell-width) !important;
      }

      .paging {
        width: 100% !important;
        box-sizing: border-box !important;
      }

      .wapper-pc,
      .wapper {
        width: 100% !important;
        max-width: none !important;
        margin: 0 auto !important;
        box-sizing: border-box !important;
      }

      .seat-area-pc {
        width: 100% !important;
        height: calc(100vh - 178px) !important;
        min-height: 560px !important;
        overflow: auto !important;
        background: #f3f4f6 !important;
      }

      .seat-area-pc .seat-container {
        position: relative !important;
        min-width: 100% !important;
        min-height: 100% !important;
      }

      .seatBox-pc {
        position: absolute !important;
        transform-origin: top left !important;
        margin: 0 !important;
        will-change: transform !important;
        transition: none !important;
      }

      .seatBox-pc:not([data-libseat-scale]) {
        opacity: 0 !important;
      }

      .seatBox-pc .libseat-facility-overlay,
      .seatBox .libseat-facility-overlay {
        position: absolute !important;
        inset: 0 !important;
        pointer-events: none !important;
        z-index: 6 !important;
      }

      .seatBox-pc .libseat-facility-overlay-item,
      .seatBox .libseat-facility-overlay-item {
        position: absolute !important;
        width: 40px !important;
        height: 40px !important;
        margin: 5px !important;
        box-sizing: border-box !important;
        border: 1px solid #d1d5db !important;
        border-radius: 4px !important;
        background-color: #e5e7eb !important;
        background-image: var(--libseat-facility-image) !important;
        background-size: contain !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
      }

      .seatClass-pc.libseat-facility-class,
      .seatClass.libseat-facility-class {
        pointer-events: none !important;
        cursor: default !important;
        transform: none !important;
        transition: none !important;
        z-index: auto !important;
      }

      .seatClass-pc.libseat-facility-class:hover,
      .seatClass.libseat-facility-class:hover {
        transform: none !important;
        z-index: auto !important;
      }

      .seatClass-pc.libseat-facility-class .seat-pc,
      .seatClass.libseat-facility-class .seat {
        cursor: default !important;
        transition: none !important;
        transform: none !important;
        box-shadow: none !important;
      }

      .seatClass-pc .seat-pc,
      .seatClass .seat {
        contain: paint !important;
      }

      .seatClass-pc .seat-pc:has(.seat-img),
      .seatClass .seat:has(.seat-img),
      .seat-pc.libseat-facility-cell,
      .seat.libseat-facility-cell,
      .seatClass-pc.libseat-facility-cell,
      .seatClass.libseat-facility-cell {
        background: #e5e7eb !important;
        border-color: #d1d5db !important;
      }

      .seatBox-pc:not(.libseat-assets-ready) .seatClass-pc:has(uni-image.seat-img),
      .seatBox:not(.libseat-assets-ready) .seatClass:has(uni-image.seat-img),
      .seatBox-pc:not(.libseat-assets-ready) .seat-pc:has(uni-image.seat-img),
      .seatBox:not(.libseat-assets-ready) .seat:has(uni-image.seat-img),
      .seatBox-pc.libseat-assets-pending .libseat-facility-cell,
      .seatBox.libseat-assets-pending .libseat-facility-cell {
        opacity: 0 !important;
      }

      .seatBox-pc.libseat-assets-ready .libseat-facility-cell,
      .seatBox.libseat-assets-ready .libseat-facility-cell {
        opacity: 1 !important;
      }

      uni-image.seat-img,
      uni-image.seat-img > div,
      uni-image.seat-img img {
        width: 100% !important;
        height: 100% !important;
        display: block !important;
        object-fit: contain !important;
        background-size: contain !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
      }

      uni-image.seat-img img {
        opacity: 1 !important;
      }

      uni-image.seat-img.libseat-facility-bg {
        background-image: var(--libseat-facility-image) !important;
        background-size: contain !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
      }

      uni-image.seat-img.libseat-facility-bg > div,
      uni-image.seat-img.libseat-facility-bg img {
        opacity: 0 !important;
        visibility: hidden !important;
      }

      .seatBox-pc.libseat-overlay-ready uni-image.seat-img,
      .seatBox.libseat-overlay-ready uni-image.seat-img {
        opacity: 0 !important;
        visibility: hidden !important;
      }

      .seat-tips {
        position: sticky !important;
        top: 0 !important;
        z-index: 20 !important;
        background: #f3f4f6 !important;
      }

      .range-picker {
        margin-bottom: 12px !important;
      }

      .seat-reserve-modal .seat-modal-body {
        width: min(720px, 90vw) !important;
      }

      .function-item-image,
      .function-item-image > div,
      .function-item-image img {
        object-fit: contain !important;
        background-size: contain !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
      }

      .function-item-image img {
        width: 100% !important;
        height: 100% !important;
      }

      .libseat-original-time-picker-hidden {
        display: none !important;
      }

      .libseat-time-replacement {
        background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%);
        border: 1px solid #e6ebf2;
        border-radius: 8px;
        padding: 16px 18px;
        margin-bottom: 14px;
        box-sizing: border-box;
        box-shadow: 0 8px 24px rgba(31, 41, 55, 0.06);
      }

      .libseat-time-replacement-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .libseat-time-replacement-title {
        font-size: 16px;
        font-weight: 700;
        color: #1f2937;
      }

      .libseat-time-replacement-hint {
        color: #7b8794;
        font-size: 12px;
        white-space: nowrap;
      }

      .libseat-reserve-main-grid {
        display: grid;
        grid-template-columns:
          minmax(180px, 1.15fr)
          minmax(78px, 0.55fr)
          minmax(78px, 0.55fr)
          minmax(120px, 0.8fr)
          minmax(160px, 1.05fr)
          auto
          minmax(160px, 1.15fr);
        align-items: end;
        gap: 12px;
      }

      .libseat-reserve-submit {
        display: flex;
        align-items: end;
      }

      .libseat-auto-reserve-panel {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        min-height: 42px;
        margin-top: 12px;
        padding: 9px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: #f8fafc;
        box-sizing: border-box;
      }

      .libseat-reserve-auto {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #475569;
        font-size: 13px;
        font-weight: 600;
        user-select: none;
      }

      .libseat-reserve-auto input {
        width: 16px;
        height: 16px;
        accent-color: #16a6d9;
      }

      .libseat-auto-hint {
        color: #64748b;
        font-size: 12px;
        line-height: 1.35;
        text-align: right;
      }

      .libseat-time-field {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
      }

      .libseat-time-field label {
        color: #475569;
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
      }

      .libseat-time-field input {
        height: 42px;
        min-width: 0;
        border: 1px solid #d6dde8;
        border-radius: 6px;
        padding: 0 12px;
        box-sizing: border-box;
        background: #fff;
        color: #111827;
        font-size: 15px;
        font-variant-numeric: tabular-nums;
        outline: none;
        transition: border-color .15s ease, box-shadow .15s ease, background-color .15s ease;
      }

      .libseat-time-field input:focus {
        border-color: #65cafd;
        box-shadow: 0 0 0 2px rgba(101, 202, 253, 0.18);
      }

      .libseat-time-field input::placeholder {
        color: #a0a8b4;
      }

      .libseat-reserve-button {
        height: 42px;
        min-width: 108px;
        border: 1px solid #16a6d9;
        border-radius: 6px;
        background: #16a6d9;
        color: #fff;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: background-color .15s ease, border-color .15s ease, box-shadow .15s ease, opacity .15s ease;
      }

      .libseat-reserve-button:hover:not(:disabled) {
        border-color: #0284c7;
        background: #0284c7;
        box-shadow: 0 0 0 2px rgba(101, 202, 253, 0.16);
      }

      .libseat-reserve-button:disabled {
        cursor: not-allowed;
        opacity: 0.62;
      }

      .libseat-reserve-status {
        min-height: 42px;
        min-width: 0;
        display: flex;
        align-items: center;
        padding: 7px 12px;
        border-radius: 6px;
        box-sizing: border-box;
        background: #f8fafc;
        color: #475569;
        font-size: 13px;
        line-height: 1.35;
        overflow: hidden;
        overflow-wrap: anywhere;
      }

      .libseat-reserve-status.success {
        background: #ecfdf5;
        color: #047857;
      }

      .libseat-reserve-status.warn {
        background: #fffbeb;
        color: #92400e;
      }

      .libseat-reserve-status.error {
        background: #fef2f2;
        color: #b91c1c;
      }

      .libseat-date-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        min-width: 0;
      }

      .libseat-date-button {
        height: 42px;
        min-width: 0;
        border: 1px solid #d6dde8;
        border-radius: 6px;
        padding: 0 8px;
        background: #fff;
        color: #344054;
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease;
      }

      .libseat-date-button:hover {
        border-color: #65cafd;
        background: #f2fbff;
      }

      .libseat-date-button.active {
        border-color: #16a6d9;
        background: #e8f8ff;
        color: #075985;
        box-shadow: 0 0 0 2px rgba(101, 202, 253, 0.14);
      }

      .libseat-slot-replacement {
        background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%);
        border: 1px solid #e6ebf2;
        border-radius: 8px;
        padding: 16px 18px;
        margin-bottom: 14px;
        box-sizing: border-box;
        box-shadow: 0 8px 24px rgba(31, 41, 55, 0.06);
      }

      .libseat-slot-grid {
        display: grid;
        grid-template-columns:
          minmax(230px, 1.35fr)
          minmax(180px, 1.05fr)
          minmax(86px, 0.55fr)
          minmax(86px, 0.55fr);
        align-items: end;
        gap: 12px;
      }

      .libseat-slot-select {
        height: 42px;
        min-width: 0;
        width: 100%;
        border: 1px solid #d6dde8;
        border-radius: 6px;
        padding: 0 12px;
        box-sizing: border-box;
        background: #fff;
        color: #111827;
        font-size: 15px;
        font-variant-numeric: tabular-nums;
        outline: none;
      }

      .libseat-slot-select:focus {
        border-color: #65cafd;
        box-shadow: 0 0 0 2px rgba(101, 202, 253, 0.18);
      }

      .libseat-slot-empty {
        height: 42px;
        display: flex;
        align-items: center;
        padding: 0 12px;
        border-radius: 6px;
        background: #fff7ed;
        color: #9a3412;
        font-size: 14px;
        box-sizing: border-box;
      }

      .libseat-slot-empty.loading {
        background: #eef6ff;
        color: #075985;
      }

      .seat-pc.libseat-seat-in-use,
      .seat-pc.seat-pc--normal.libseat-seat-in-use,
      .seat.libseat-seat-in-use,
      .seat.seat--normal.libseat-seat-in-use,
      .seat-pc.libseat-seat-disabled,
      .seat-pc.seat-pc--normal.libseat-seat-disabled,
      .seat.libseat-seat-disabled {
        background: #f44336 !important;
        border-color: #d32f2f !important;
      }

      .seat-pc.libseat-seat-free-30,
      .seat-pc.seat-pc--normal.libseat-seat-free-30,
      .seat-pc.seat-pc--sold.libseat-seat-free-30,
      .seat-pc.seat-pc--half-occupied.libseat-seat-free-30,
      .seat.libseat-seat-free-30,
      .seat.seat--normal.libseat-seat-free-30,
      .seat.seat--sold.libseat-seat-free-30,
      .seat.seat--half-occupied.libseat-seat-free-30 {
        background: #f59e0b !important;
        border-color: #d97706 !important;
      }

      .seat-pc.libseat-seat-free-60,
      .seat-pc.seat-pc--normal.libseat-seat-free-60,
      .seat-pc.seat-pc--sold.libseat-seat-free-60,
      .seat-pc.seat-pc--half-occupied.libseat-seat-free-60,
      .seat.libseat-seat-free-60,
      .seat.seat--normal.libseat-seat-free-60,
      .seat.seat--sold.libseat-seat-free-60,
      .seat.seat--half-occupied.libseat-seat-free-60 {
        background: #facc15 !important;
        border-color: #eab308 !important;
      }

      .seat-pc.libseat-seat-free-120,
      .seat-pc.seat-pc--normal.libseat-seat-free-120,
      .seat-pc.seat-pc--selected.libseat-seat-free-120,
      .seat-pc.seat-pc--disabled.libseat-seat-free-120,
      .seat-pc.seat-pc--sold.libseat-seat-free-120,
      .seat-pc.seat-pc--half-occupied.libseat-seat-free-120,
      .seat-pc.libseat-seat-free-120[style],
      .seat.libseat-seat-free-120,
      .seat.seat--normal.libseat-seat-free-120,
      .seat.seat--selected.libseat-seat-free-120,
      .seat.seat--disabled.libseat-seat-free-120,
      .seat.seat--sold.libseat-seat-free-120,
      .seat.seat--half-occupied.libseat-seat-free-120,
      .seat.libseat-seat-free-120[style] {
        background: #22c55e !important;
        border-color: #16a34a !important;
      }

      .seat-pc.libseat-seat-free-30 .seat-number,
      .seat.libseat-seat-free-30 .seat-number,
      .seat-pc.libseat-seat-free-60 .seat-number,
      .seat.libseat-seat-free-60 .seat-number,
      .seat-pc.libseat-seat-free-120 .seat-number,
      .seat.libseat-seat-free-120 .seat-number,
      .seat-pc.libseat-seat-in-use .seat-number,
      .seat.libseat-seat-in-use .seat-number,
      .seat-pc.libseat-seat-disabled .seat-number,
      .seat.libseat-seat-disabled .seat-number {
        color: #fff !important;
      }

      .seat-pc.libseat-seat-free-60 .seat-number,
      .seat.libseat-seat-free-60 .seat-number {
        color: #3f3f46 !important;
      }

      .libseat-seat-legend {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 24px;
        padding: 16px 0;
        background: #f3f4f6;
      }

      .libseat-seat-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #666;
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
      }

      .libseat-seat-legend-box {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        border: 1px solid #ccc;
        box-sizing: border-box;
      }

      .libseat-seat-legend-box.in-use {
        background: #f44336;
        border-color: #d32f2f;
      }

      .libseat-seat-legend-box.free-30 {
        background: #f59e0b;
        border-color: #d97706;
      }

      .libseat-seat-legend-box.free-60 {
        background: #facc15;
        border-color: #eab308;
      }

      .libseat-seat-legend-box.free-120 {
        background: #22c55e;
        border-color: #16a34a;
      }

      .libseat-seat-legend-box.disabled {
        background: grey;
        border-color: grey;
      }
    }
  `;

  function injectStyle() {
    if (document.getElementById("libseat-pc-wide-style")) return;

    if (typeof GM_addStyle === "function") {
      const style = GM_addStyle(css);
      if (style) style.id = "libseat-pc-wide-style";
      return;
    }

    const style = document.createElement("style");
    style.id = "libseat-pc-wide-style";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function applyPcWideClass() {
    document.documentElement.classList.add("libseat-pc-wide");
  }

  function debugStartup() {
    debugFacilityAssets("script loaded", { version: SCRIPT_VERSION });
  }

  function preloadFacilityImages() {
    if (preloadFacilityImages.done) return;
    preloadFacilityImages.done = true;
    FACILITY_IMAGE_URLS.forEach((src) => {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = src;
      (document.head || document.documentElement).appendChild(link);

      const image = new Image();
      image.decoding = "async";
      image.src = src;
    });
  }

  function debugFacilityAssets(message, detail) {
    try {
      if (window.localStorage.getItem("libseatPcWideDebug") === "1") {
        console.debug("[libseat-pc-wide]", message, detail || "");
      }
    } catch (error) {
      // localStorage can be unavailable in restricted browser modes.
    }
  }

  function facilityDebugSnapshot() {
    const now = Date.now();
    return Array.from(document.querySelectorAll(".seatBox-pc, .seatBox")).map((box, index) => {
      const facilityImages = Array.from(box.querySelectorAll("uni-image.seat-img"));
      const innerImages = Array.from(box.querySelectorAll("uni-image.seat-img img"));
      const snapshot = pageSeatListSnapshot(box);
      const seatElements = Array.from(box.querySelectorAll(".seat-pc, .seat"));
      const firstSeenAt = Number(box.dataset.libseatAssetFirstSeenAt || 0);
      const stableAt = Number(box.dataset.libseatAssetStableAt || 0);

      return {
        version: SCRIPT_VERSION,
        index,
        facilityCount: facilityImages.length,
        overlayDataCount: snapshot && Array.isArray(snapshot.seats)
          ? snapshot.seats.filter((seat) => facilityTypeImage(seat.type)).length
          : null,
        backgroundCount: facilityImages.filter((image) => image.classList.contains("libseat-facility-bg")).length,
        overlayCount: box.querySelectorAll(":scope > .libseat-facility-overlay .libseat-facility-overlay-item").length,
        overlayReady: box.classList.contains("libseat-overlay-ready"),
        ready: box.classList.contains("libseat-assets-ready"),
        pending: box.classList.contains("libseat-assets-pending"),
        dataReady: box.dataset.libseatAssetsReady || "",
        firstSeenAgeMs: firstSeenAt ? now - firstSeenAt : null,
        stableAgeMs: stableAt ? now - stableAt : null,
        innerImgCount: innerImages.length,
        loadedInnerImgCount: innerImages.filter((image) => image.complete && image.naturalWidth > 0).length,
        zeroNaturalWidthCount: innerImages.filter((image) => image.complete && image.naturalWidth === 0).length,
        free120ClassCount: seatElements.filter((element) => element.classList.contains("libseat-seat-free-120")).length,
        free120WhiteCount: seatElements.filter(
          (element) =>
            element.classList.contains("libseat-seat-free-120") &&
            getComputedStyle(element).backgroundColor === "rgb(255, 255, 255)"
        ).length,
      };
    });
  }

  function seatDomLabelMaps(box, snapshot) {
    const byId = new Map();
    const byPosition = new Map();
    const cellStep = Number(snapshot && snapshot.positionDistin) || 50;

    if (!box) return { byId, byPosition };

    box.querySelectorAll(".seatClass-pc, .seatClass").forEach((node) => {
      const label = node.querySelector(".seat-number");
      const text = label && label.textContent ? label.textContent.trim() : "";
      if (!text) return;

      const key = node.getAttribute("key");
      if (key && /^\d+$/.test(key)) byId.set(Number(key), text);

      const left = Math.round(pxNumber(node.style.left));
      const top = Math.round(pxNumber(node.style.top));
      byPosition.set(`${Math.round(left / cellStep) - 1}:${Math.round(top / cellStep) - 1}`, text);
    });

    return { byId, byPosition };
  }

  function currentSeatSnapshot() {
    const box = document.querySelector(".seatBox-pc, .seatBox");
    const snapshot = box ? pageSeatListSnapshot(box) : null;
    if (!snapshot || !Array.isArray(snapshot.seats)) return [];

    const labels = seatDomLabelMaps(box, snapshot);
    return snapshot.seats
      .filter((seat) => seat && seat.type === "SEAT")
      .map((seat) => {
        const displayName =
          labels.byPosition.get(`${Number(seat.x)}:${Number(seat.y)}`) ||
          labels.byId.get(Number(seat.id)) ||
          seat.name;
        return {
          id: seat.id,
          name: seat.name,
          displayName,
          parentNamePath:
            seat.parentNamePath ||
            (snapshot.readingRoom && (snapshot.readingRoom.parentNamePath || snapshot.readingRoom.name)) ||
            "",
          parentIdPath: seat.parentIdPath || (snapshot.readingRoom && snapshot.readingRoom.parentIdPath) || "",
          roomId: seat.roomId || (snapshot.readingRoom && (snapshot.readingRoom.roomId || snapshot.readingRoom.id)) || "",
          enabled: seat.enabled,
          status: seat.status,
          x: seat.x,
          y: seat.y,
          availableSlots: seat.availableSlots || [],
        };
      });
  }

  function findSeatIdByName(name) {
    const target = String(name).trim();
    const seat = currentSeatSnapshot().find(
      (item) => String(item.name).trim() === target || String(item.displayName).trim() === target
    );
    return seat ? seat.id : null;
  }

  function parseJsonOrNull(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function pageWindow() {
    return typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  }

  function unwrapStorageValue(value) {
    if (!value) return null;
    if (typeof value === "object") return value.data && typeof value.data === "object" ? value.data : value;

    const parsed = parseJsonOrNull(String(value));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
  }

  function readStoredUserInfo() {
    const page = pageWindow();
    const candidates = [];

    try {
      if (page.uni && typeof page.uni.getStorageSync === "function") {
        candidates.push(page.uni.getStorageSync("info"));
      }
    } catch (error) {
      // The page storage bridge can throw before UniApp finishes booting.
    }

    try {
      candidates.push(window.localStorage.getItem("info"));
    } catch (error) {
      // localStorage can be unavailable in restricted browser modes.
    }

    for (const candidate of candidates) {
      const info = unwrapStorageValue(candidate);
      if (info && typeof info === "object") return info;
    }
    return null;
  }

  function currentAuthorizationHeader() {
    const info = readStoredUserInfo();
    if (!info) return "";

    const values = Object.keys(info)
      .map((key) => info[key])
      .filter((value) => typeof value === "string")
      .map((value) => value.trim());
    const fullHeader = values.find((value) => /^junyue-server\s+/i.test(value));
    if (fullHeader) return fullHeader;

    const token =
      info.token ||
      info.accessToken ||
      info.authToken ||
      info.loginToken ||
      info.userToken ||
      info.authorizationToken ||
      info.authCode ||
      info.loginCode ||
      info.code;
    const tenantId = info.tenantId || info.tenantID || 1;
    const userId = info.id || info.userId;
    if (!userId || !token || typeof window.btoa !== "function") return "";

    return `junyue-server ${window.btoa(encodeURI(`${tenantId}:${userId}:${token}`))}`;
  }

  function reservationHeaders(hasBody) {
    const headers = {
      Accept: "*/*",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      SPACE: "LIBRARY",
    };
    if (hasBody) headers["Content-Type"] = "application/json";

    const authorization = currentAuthorizationHeader();
    if (authorization) headers.Authorization = authorization;
    return headers;
  }

  async function fetchReservationJson(path, options) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutMs = options && options.timeoutMs ? options.timeoutMs : 8000;
    const timer = controller
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const response = await window.fetch(path, {
        method: options.method || "GET",
        headers: options.headers || {},
        body: options.body,
        credentials: "include",
        cache: "no-store",
        signal: controller ? controller.signal : undefined,
      });
      const bodyText = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        bodyText,
        data: parseJsonOrNull(bodyText),
      };
    } catch (error) {
      return {
        ok: false,
        status: null,
        bodyText: "",
        data: null,
        error: error && error.name === "AbortError" ? "请求超时" : String((error && error.message) || error),
      };
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function formatReservationDateTime(date, time) {
    return `${date} ${time}`;
  }

  function expectedActiveTime(startTime, endTime) {
    const start = String(startTime).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/);
    const end = String(endTime).match(/(\d{2}:\d{2})/);
    if (!start || !end) return "";
    return `${Number(start[1])}年${Number(start[2])}月${Number(start[3])}日 ${start[4]}-${end[1]}`;
  }

  function findMatchingActiveReservation(data, seatId, expectedTime) {
    if (!Array.isArray(data)) return null;

    return (
      data.find((item) => {
        const resource = item && item.resource;
        return (
          resource &&
          Number(resource.id) === Number(seatId) &&
          String(item.time || "") === expectedTime
        );
      }) || null
    );
  }

  function submitResponseSuccess(result, seatId) {
    if (!result || !result.ok || !result.data || typeof result.data !== "object") return null;
    const data = result.data;
    const responseSeat = data.seat && typeof data.seat === "object" ? data.seat : null;
    if (!data.id || !RESERVATION_SUCCESS_STATUSES.has(String(data.status || ""))) return null;
    if (responseSeat && responseSeat.id !== undefined && Number(responseSeat.id) !== Number(seatId)) return null;
    return data;
  }

  function responseMessage(result) {
    if (!result) return "请求失败";
    if (result.error) return result.error;

    const data = result.data;
    if (data && typeof data === "object") {
      const message = data.message || data.msg || data.error || data.errorMessage || data.description;
      if (message) return String(message);
    }

    const text = String(result.bodyText || "").trim();
    if (text) return text.length > 160 ? `${text.slice(0, 160)}...` : text;
    return result.status ? `HTTP ${result.status}` : "请求失败";
  }

  function sleepMs(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function seatTrailingNumber(value) {
    const match = String(value || "").trim().match(/(\d+)$/);
    return match ? match[1] : "";
  }

  function parseSeatCandidates(value) {
    return String(value || "")
      .split(/[,，;；\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function resolveSeatForReservation(value) {
    const raw = String(value || "").trim();
    if (!raw) return { error: "请输入座位号" };

    const seats = currentSeatSnapshot();
    const idMatch = raw.match(/^(?:id[:：#]?|#)\s*(\d+)$/i);
    if (idMatch) {
      const id = Number(idMatch[1]);
      const seat = seats.find((item) => Number(item.id) === id) || null;
      return {
        id,
        seat,
        label: seat ? String(seat.displayName || seat.name || id) : `ID ${id}`,
      };
    }

    const exact = seats.find(
      (item) =>
        String(item.displayName || "").trim() === raw ||
        String(item.name || "").trim() === raw
    );
    if (exact) {
      return {
        id: Number(exact.id),
        seat: exact,
        label: String(exact.displayName || exact.name || exact.id),
      };
    }

    if (/^\d+$/.test(raw)) {
      const trailingMatches = seats.filter(
        (item) => seatTrailingNumber(item.displayName || item.name) === raw
      );
      if (trailingMatches.length === 1) {
        const seat = trailingMatches[0];
        return {
          id: Number(seat.id),
          seat,
          label: String(seat.displayName || seat.name || seat.id),
        };
      }

      const idSeat = seats.find((item) => Number(item.id) === Number(raw));
      if (idSeat) {
        return {
          id: Number(idSeat.id),
          seat: idSeat,
          label: String(idSeat.displayName || idSeat.name || idSeat.id),
        };
      }
    }

    return {
      error: seats.length ? `当前地图没有找到座位 ${raw}` : "还没有读取到当前座位地图",
    };
  }

  function resolveSeatCandidates(value) {
    const candidates = parseSeatCandidates(value);
    if (!candidates.length) return { seats: [], errors: ["请输入座位号"] };

    const resolved = [];
    const errors = [];
    const seen = new Set();
    candidates.forEach((candidate) => {
      const seat = resolveSeatForReservation(candidate);
      if (seat.error) {
        errors.push(seat.error);
        return;
      }
      if (seen.has(Number(seat.id))) return;
      seen.add(Number(seat.id));
      resolved.push(seat);
    });

    return { seats: resolved, errors };
  }

  function reservationSeatObject(seat, submitData, verify) {
    if (submitData && submitData.seat && typeof submitData.seat === "object") return submitData.seat;
    if (verify && verify.match && verify.match.resource && typeof verify.match.resource === "object") {
      return verify.match.resource;
    }
    return seat && seat.seat && typeof seat.seat === "object" ? seat.seat : {};
  }

  function cleanReservationText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function reservationDetailText(seat, range, submitData, verify) {
    const detailSeat = reservationSeatObject(seat, submitData, verify);
    const location = cleanReservationText(detailSeat.parentNamePath);
    const seatName = cleanReservationText(detailSeat.name || (seat && seat.label) || (seat && seat.id));
    const target = cleanReservationText([location, seatName].filter(Boolean).join(" "));
    return `${target || "座位"} ${range.date} ${range.startTime}-${range.endTime}`;
  }

  function reservationCandidatesDetailText(resolvedSeats, range) {
    if (!resolvedSeats.length) return "";
    const first = reservationDetailText(resolvedSeats[0], range);
    return resolvedSeats.length > 1 ? `${first}；共 ${resolvedSeats.length} 个候选，按顺序尝试` : first;
  }

  function currentReservationRule() {
    const box = document.querySelector(".seatBox-pc, .seatBox");
    const snapshot = box ? pageSeatListSnapshot(box) : null;
    return snapshot && snapshot.rule ? snapshot.rule : null;
  }

  function reservationRangeFromControls(block, controls, dateOverride) {
    const pickerValue = currentRangePickerValue(block);
    const date = String(dateOverride || controls.date || pickerValue.date || "").trim();
    const startTime = String(controls.start.value || pickerValue.startTime || "").trim();
    const endTime = String(controls.end.value || pickerValue.endTime || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "日期格式不正确" };
    if (!isTimeText(startTime) || !isTimeText(endTime)) return { error: "时间格式不正确" };

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    if (endMinutes <= startMinutes) return { error: "结束时间必须晚于开始时间" };

    const minDuration = reservationMinDurationMinutes(currentReservationRule());
    if (endMinutes - startMinutes < minDuration) {
      return { error: `预约时长不能少于 ${minDuration} 分钟` };
    }

    return {
      date,
      startTime,
      endTime,
      startDateTime: formatReservationDateTime(date, startTime),
      endDateTime: formatReservationDateTime(date, endTime),
    };
  }

  function reservationDateAfter(value, days) {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return formatDateText(date);
  }

  function autoReservationDateForSubmitTime(submitTime) {
    return reservationDateAfter(submitTime, 1);
  }

  async function submitSeatReservation(seatId, startTime, endTime) {
    return fetchReservationJson(RESERVATION_SUBMIT_PATH, {
      method: "POST",
      headers: reservationHeaders(true),
      body: JSON.stringify({
        seatId,
        startTime,
        endTime,
        needMaterial: false,
        scan: false,
        use: false,
      }),
      timeoutMs: 8000,
    });
  }

  function seatReservationsByDatePath(seatId, date) {
    return `${SEAT_RESERVATIONS_BY_DATE_PREFIX}/${encodeURIComponent(seatId)}/reservations/by-date?date=${encodeURIComponent(date)}`;
  }

  async function fetchSeatReservationsByDate(seatId, date) {
    return fetchReservationJson(seatReservationsByDatePath(seatId, date), {
      method: "GET",
      headers: reservationHeaders(false),
      timeoutMs: 8000,
    });
  }

  async function verifyActiveReservation(seatId, startTime, endTime) {
    const result = await fetchReservationJson(ACTIVE_RESERVATIONS_PATH, {
      method: "GET",
      headers: reservationHeaders(false),
      timeoutMs: 8000,
    });
    if (!result.ok) {
      return { ok: false, result, message: responseMessage(result) };
    }

    const expectedTime = expectedActiveTime(startTime, endTime);
    const match = findMatchingActiveReservation(result.data, seatId, expectedTime);
    return {
      ok: !!match,
      result,
      match,
      expectedTime,
      message: match ? "验证成功" : "当前预约列表没有找到匹配记录",
    };
  }

  function installDebugApi() {
    window.libseatPcWideDebug = facilityDebugSnapshot;
    window.libseatPcWideDebug.version = SCRIPT_VERSION;
    window.libseatPcWideSeats = currentSeatSnapshot;
    window.libseatPcWideSeatId = findSeatIdByName;
    window.libseatPcWideAuth = currentAuthorizationHeader;
    window.libseatPcWideResolveSeat = resolveSeatForReservation;
    window.libseatPcWideResolveSeats = resolveSeatCandidates;
    window.libseatPcWideSeatReservations = fetchSeatReservationsByDate;
    window.libseatPcWideReserveSeat = (seat, date, startTime, endTime) => {
      const resolved = resolveSeatForReservation(seat);
      if (resolved.error) return Promise.resolve({ ok: false, error: resolved.error });
      return submitSeatReservation(
        resolved.id,
        formatReservationDateTime(date, startTime),
        formatReservationDateTime(date, endTime)
      );
    };
    if (typeof unsafeWindow !== "undefined") {
      unsafeWindow.libseatPcWideDebug = facilityDebugSnapshot;
      unsafeWindow.libseatPcWideDebug.version = SCRIPT_VERSION;
      unsafeWindow.libseatPcWideSeats = currentSeatSnapshot;
      unsafeWindow.libseatPcWideSeatId = findSeatIdByName;
      unsafeWindow.libseatPcWideAuth = currentAuthorizationHeader;
      unsafeWindow.libseatPcWideResolveSeat = resolveSeatForReservation;
      unsafeWindow.libseatPcWideResolveSeats = resolveSeatCandidates;
      unsafeWindow.libseatPcWideSeatReservations = fetchSeatReservationsByDate;
      unsafeWindow.libseatPcWideReserveSeat = window.libseatPcWideReserveSeat;
    }
  }

  function installPageBridge() {
    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    if (pageWindow.__libseatPcWideBridge && pageWindow.__libseatPcWideBridge.version === SCRIPT_VERSION) return;

    const script = document.createElement("script");
    script.id = PAGE_BRIDGE_SCRIPT_ID;
    script.textContent = `
      (function () {
        if (window.__libseatPcWideBridge && window.__libseatPcWideBridge.version === "${SCRIPT_VERSION}") return;

        function findSeatListVm(root) {
          var node = root;
          while (node) {
            var vm = node.__vue__;
            while (vm) {
              if (Array.isArray(vm.seatList) && vm.seatList.length) return vm;
              vm = vm.$parent;
            }
            node = node.parentElement;
          }
          return null;
        }

        function findContextVm(vm) {
          while (vm) {
            if (vm.timeRange && (vm.readingRoom || Array.isArray(vm.seatList) || vm.selectedSeat)) return vm;
            vm = vm.$parent;
          }
          return null;
        }

        function copySlots(slots) {
          if (!Array.isArray(slots)) return null;
          return slots.map(function (slot) {
            return {
              start: slot && slot.start,
              end: slot && slot.end,
              startTime: slot && slot.startTime,
              endTime: slot && slot.endTime
            };
          });
        }

        function copySeat(seat) {
          if (!seat) return null;
          return {
            id: seat.id,
            name: seat.name,
            type: seat.type,
            parentNamePath: seat.parentNamePath,
            parentIdPath: seat.parentIdPath,
            roomId: seat.roomId,
            x: seat.x,
            y: seat.y,
            enabled: seat.enabled,
            status: seat.status,
            availableSlots: copySlots(seat.availableSlots)
          };
        }

        function copyRule(rule) {
          if (!rule) return {};
          return {
            minDurationMinutes: rule.minDurationMinutes,
            maxDurationMinutes: rule.maxDurationMinutes,
            availableStartTime: rule.availableStartTime,
            availableEndTime: rule.availableEndTime
          };
        }

        function snapshot(root) {
          var vm = findSeatListVm(root);
          if (!vm || !Array.isArray(vm.seatList)) return null;
          var context = findContextVm(vm);
          var readingRoom = context && context.readingRoom ? context.readingRoom : {};
          return {
            positionDistin: Number(vm.positionDistin) || 50,
            width: Number(vm.width) || 50,
            height: Number(vm.height) || 50,
            readingRoom: {
              id: readingRoom.id,
              name: readingRoom.name,
              parentNamePath: readingRoom.parentNamePath,
              parentIdPath: readingRoom.parentIdPath,
              roomId: readingRoom.roomId
            },
            timeRange: context && context.timeRange ? {
              date: context.timeRange.date,
              startTime: context.timeRange.startTime,
              endTime: context.timeRange.endTime
            } : null,
            openTime: readingRoom.openTime,
            closeTime: readingRoom.closeTime,
            rule: copyRule(readingRoom.rule),
            selectedSeat: copySeat(context && context.selectedSeat),
            seats: vm.seatList.map(copySeat)
          };
        }

        function modalSnapshot(root) {
          var node = root;
          while (node) {
            var vm = node.__vue__;
            while (vm) {
              if (Array.isArray(vm.reservations) && vm.timeRange && vm.seat) {
                var context = findContextVm(vm);
                return {
                  timeRange: {
                    date: vm.timeRange.date,
                    startTime: vm.timeRange.startTime,
                    endTime: vm.timeRange.endTime
                  },
                  sourceTimeRange: context && context.timeRange ? {
                    date: context.timeRange.date,
                    startTime: context.timeRange.startTime,
                    endTime: context.timeRange.endTime
                  } : null,
                  rule: copyRule(vm.rule || (vm.seat && vm.seat.rule)),
                  selectedSeat: copySeat((context && context.selectedSeat) || vm.seat),
                  reservationsLoaded: Array.isArray(vm.reservations),
                  reservationCount: Array.isArray(vm.reservations) ? vm.reservations.length : 0
                };
              }
              vm = vm.$parent;
            }
            node = node.parentElement;
          }
          return null;
        }

        window.__libseatPcWideBridge = {
          version: "${SCRIPT_VERSION}",
          snapshot: snapshot,
          modalSnapshot: modalSnapshot
        };
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  function cssUrl(value) {
    const text = String(value || "").trim();
    const match = text.match(/^url\((['"]?)(.*?)\1\)$/);
    return match ? match[2] : text;
  }

  function facilityImageUrl(image) {
    const backgroundNode = image.querySelector("div");
    const background =
      backgroundNode && (backgroundNode.style.backgroundImage || getComputedStyle(backgroundNode).backgroundImage);
    const fromBackground = background && background !== "none" ? cssUrl(background) : "";
    if (fromBackground) return fromBackground;

    const img = image.querySelector("img");
    return (img && (img.currentSrc || img.src || img.getAttribute("src"))) || "";
  }

  function queueFacilityRevealCheck(box, delay) {
    if (box.dataset.libseatAssetCheckQueued === "1") return;
    box.dataset.libseatAssetCheckQueued = "1";
    window.setTimeout(() => {
      box.dataset.libseatAssetCheckQueued = "0";
      if (box.isConnected) stabilizeFacilityImages();
    }, delay);
  }

  function pxNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function applySeatMapScale() {
    document.querySelectorAll(".seat-area-pc").forEach((area) => {
      const container = area.querySelector(".seat-container");
      const seatBox = area.querySelector(".seatBox-pc");
      if (!container || !seatBox) return;

      const boxWidth = pxNumber(seatBox.style.width) || seatBox.offsetWidth;
      const boxHeight = pxNumber(seatBox.style.height) || seatBox.offsetHeight;
      const areaWidth = area.clientWidth - SEAT_MAP_PADDING * 2;
      const areaHeight = area.clientHeight - SEAT_MAP_PADDING * 2;
      if (!boxWidth || !boxHeight || areaWidth <= 0 || areaHeight <= 0) return;

      const fitScale = Math.min(areaWidth / boxWidth, areaHeight / boxHeight, SEAT_MAP_MAX_SCALE);
      const scale = Math.max(SEAT_MAP_MIN_SCALE, Math.min(SEAT_MAP_MAX_SCALE, fitScale));
      const scaledWidth = Math.ceil(boxWidth * scale);
      const scaledHeight = Math.ceil(boxHeight * scale);
      const left = Math.max(SEAT_MAP_PADDING, Math.floor((area.clientWidth - scaledWidth) / 2));

      container.style.width = `${Math.max(scaledWidth + SEAT_MAP_PADDING * 2, area.clientWidth)}px`;
      container.style.height = `${Math.max(scaledHeight + SEAT_MAP_PADDING * 2, area.clientHeight)}px`;
      container.style.minWidth = container.style.width;
      container.style.minHeight = container.style.height;

      seatBox.style.transform = `scale(${scale})`;
      seatBox.style.left = `${left}px`;
      seatBox.style.top = `${SEAT_MAP_PADDING}px`;
      seatBox.dataset.libseatScale = scale.toFixed(3);
    });
  }

  function findRangePickerVm(block) {
    let node = block;
    while (node) {
      let vm = node.__vue__;
      while (vm) {
        if (vm.value && "startTime" in vm.value && "endTime" in vm.value && typeof vm.$emit === "function") {
          return vm;
        }
        vm = vm.$parent;
      }
      node = node.parentElement;
    }
    return null;
  }

  function emitRangePickerChange(block, field, value) {
    return emitRangePickerRange(block, { [field]: value }, field === "date");
  }

  function emitRangePickerRange(block, updates, emitDateChange) {
    if (block.dataset.libseatTopReplacement === "1") {
      const owner = findTimeRangeOwnerVm(block);
      const current = owner && owner.timeRange ? owner.timeRange : currentRangePickerValue(block);
      return updateOwnerTimeRange(block, Object.assign({}, current, updates), emitDateChange);
    }

    const vm = findRangePickerVm(block);
    if (!vm) return false;

    const next = Object.assign({}, vm.value || {}, updates);
    vm.$emit("input", next);
    vm.$emit("change", next);
    if (emitDateChange) vm.$emit("change-date");
    updateOwnerTimeRange(block, next, emitDateChange);
    return true;
  }

  function findTimeRangeOwnerVm(block) {
    let node = block;
    while (node) {
      let vm = node.__vue__;
      while (vm) {
        if (vm.timeRange && typeof vm.timeRange === "object") return vm;
        vm = vm.$parent;
      }
      node = node.parentElement;
    }
    return null;
  }

  function updateOwnerTimeRange(block, next, emitDateChange) {
    const owner = findTimeRangeOwnerVm(block);
    if (!owner || !owner.timeRange) return false;

    const merged = Object.assign({}, owner.timeRange, next);
    if (typeof owner.$set === "function") {
      owner.$set(owner, "timeRange", merged);
    } else {
      owner.timeRange = merged;
    }

    if (emitDateChange && typeof owner.getSeatReservations === "function") {
      setTimeout(() => owner.getSeatReservations(), 0);
    } else if (typeof owner.getSeats === "function") {
      setTimeout(() => owner.getSeats(), 0);
    }
    return true;
  }

  function todayText() {
    return formatDateText(new Date());
  }

  function tomorrowText() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return formatDateText(date);
  }

  function defaultDateText() {
    return currentMinuteOfDay() >= TOMORROW_DEFAULT_AFTER_MINUTES ? tomorrowText() : todayText();
  }

  function defaultStartMinutesForDate(date) {
    if (date !== todayText()) return timeToMinutes(DAY_OPEN_TIME);

    const open = timeToMinutes(DAY_OPEN_TIME);
    const close = timeToMinutes(DAY_CLOSE_TIME);
    const latestStart = close - DEFAULT_MIN_RESERVATION_MINUTES;
    return Math.min(latestStart, Math.max(open, currentMinuteOfDay()));
  }

  function defaultEndMinutesForDate() {
    return timeToMinutes(DAY_CLOSE_TIME);
  }

  function formatDateText(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isTimeText(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function timeToMinutes(value) {
    if (!value) return null;
    const match = String(value).match(/(\d{2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function minutesToTime(value) {
    const hour = String(Math.floor(value / 60)).padStart(2, "0");
    const minute = String(value % 60).padStart(2, "0");
    return `${hour}:${minute}`;
  }

  function currentMinuteOfDay() {
    const date = new Date();
    return date.getHours() * 60 + date.getMinutes() + (date.getSeconds() > 0 ? 1 : 0);
  }

  function effectiveOpenMinutes(date) {
    const open = timeToMinutes(DAY_OPEN_TIME);
    const close = timeToMinutes(DAY_CLOSE_TIME);
    if (date !== todayText()) return open;
    return Math.min(close, Math.max(open, currentMinuteOfDay()));
  }

  function hideOriginalPicker(block) {
    block.classList.add("libseat-original-time-picker-hidden");
    block.style.setProperty("display", "none", "important");
    block.style.setProperty("height", "0", "important");
    block.style.setProperty("margin", "0", "important");
    block.style.setProperty("padding", "0", "important");
    block.style.setProperty("overflow", "hidden", "important");
  }

  function currentRangePickerValue(block) {
    const vm = findRangePickerVm(block);
    if (vm && vm.value) return vm.value;

    const pickers = Array.from(block.querySelectorAll("uni-picker"));
    const datePicker = pickers.find((picker) => picker.getAttribute("mode") === "date");
    const timePickers = pickers.filter((picker) => picker.getAttribute("mode") === "time");
    const dateInput = datePicker ? datePicker.querySelector("input") : null;
    const startInput = timePickers[0] ? timePickers[0].querySelector("input") : null;
    const endInput = timePickers[1] ? timePickers[1].querySelector("input") : null;

    return {
      date: dateInput ? dateInput.value : "",
      startTime: startInput ? startInput.value : "",
      endTime: endInput ? endInput.value : "",
    };
  }

  function findReservationModalVm(block) {
    let node = block;
    while (node) {
      let vm = node.__vue__;
      while (vm) {
        if (Array.isArray(vm.reservations) && vm.timeRange && vm.seat) return vm;
        vm = vm.$parent;
      }
      node = node.parentElement;
    }
    return null;
  }

  function findSeatListVm(root) {
    let node = root;
    while (node) {
      let vm = node.__vue__;
      while (vm) {
        if (Array.isArray(vm.seatList) && vm.seatList.length) return vm;
        vm = vm.$parent;
      }
      node = node.parentElement;
    }
    return null;
  }

  function facilityTypeImage(type) {
    return FACILITY_IMAGE_BY_TYPE[String(type || "").toUpperCase()] || "";
  }

  function pageSeatListSnapshot(box) {
    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const bridge = pageWindow.__libseatPcWideBridge;
    if (!bridge || typeof bridge.snapshot !== "function") return null;

    try {
      return bridge.snapshot(box);
    } catch (error) {
      debugFacilityAssets("facility bridge snapshot failed", { message: error && error.message });
      return null;
    }
  }

  function pageModalSnapshot(root) {
    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const bridge = pageWindow.__libseatPcWideBridge;
    if (!bridge || typeof bridge.modalSnapshot !== "function") return null;

    try {
      return bridge.modalSnapshot(root);
    } catch (error) {
      debugFacilityAssets("modal bridge snapshot failed", { message: error && error.message });
      return null;
    }
  }

  function dateTextFromValue(value) {
    const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : "";
  }

  function reservationMinDurationMinutes(rule) {
    const candidates = [
      rule && rule.minDurationMinutes,
      rule && rule.minDuration,
      rule && rule.minReserveMinutes,
      rule && rule.minReservationMinutes,
    ];
    for (const value of candidates) {
      const minutes = Number(value);
      if (Number.isFinite(minutes) && minutes > 0) return minutes;
    }
    return DEFAULT_MIN_RESERVATION_MINUTES;
  }

  function normalizedAvailableSlotMinutes(slot, date) {
    if (!slot) return 0;

    const startText = String(slot.start || slot.startTime || "");
    const endText = String(slot.end || slot.endTime || "");
    const slotDate = dateTextFromValue(startText) || dateTextFromValue(endText);
    if (date && slotDate && slotDate !== date) return 0;

    let start = timeToMinutes(startText);
    let end = timeToMinutes(endText);
    if (start === null || end === null || end <= start) return 0;

    const open = effectiveOpenMinutes(date);
    const close = timeToMinutes(DAY_CLOSE_TIME);
    start = Math.max(open, start);
    end = Math.min(close, end);
    return Math.max(0, end - start);
  }

  function renderFacilityOverlay(box) {
    const snapshot = pageSeatListSnapshot(box);
    const vm = snapshot ? null : findSeatListVm(box);
    const seatList = snapshot ? snapshot.seats : vm && vm.seatList;
    if (!Array.isArray(seatList) || !seatList.length) return false;

    const facilities = seatList.filter((seat) => facilityTypeImage(seat.type));
    if (!facilities.length) return false;

    const positionDistin = Number(snapshot && snapshot.positionDistin) || Number(vm && vm.positionDistin) || 50;
    const width = Number(snapshot && snapshot.width) || Number(vm && vm.width) || 50;
    const height = Number(snapshot && snapshot.height) || Number(vm && vm.height) || 50;
    const innerWidth = Math.round(width * 0.8);
    const innerHeight = Math.round(height * 0.8);
    const insetX = Math.round((width - innerWidth) / 2);
    const insetY = Math.round((height - innerHeight) / 2);
    const signature = facilities
      .map((seat) => [seat.id, seat.type, seat.x, seat.y].join(":"))
      .join("|");

    if (box.dataset.libseatOverlaySignature === signature) {
      box.classList.add("libseat-overlay-ready");
      return true;
    }

    let overlay = box.querySelector(":scope > .libseat-facility-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "libseat-facility-overlay";
      box.appendChild(overlay);
    }

    overlay.textContent = "";
    facilities.forEach((seat) => {
      const item = document.createElement("div");
      item.className = "libseat-facility-overlay-item";
      item.style.left = `${(Number(seat.x) + 1) * positionDistin + insetX}px`;
      item.style.top = `${(Number(seat.y) + 1) * positionDistin + insetY}px`;
      item.style.width = `${innerWidth}px`;
      item.style.height = `${innerHeight}px`;
      item.style.setProperty("--libseat-facility-image", `url("${facilityTypeImage(seat.type)}")`);
      overlay.appendChild(item);
    });

    box.dataset.libseatOverlaySignature = signature;
    box.classList.add("libseat-overlay-ready");
    box.classList.add("libseat-assets-ready");
    box.classList.remove("libseat-assets-pending");
    box.dataset.libseatAssetsReady = "1";
    box.dataset.libseatAssetCount = String(facilities.length);
    debugFacilityAssets("facility overlay rendered", {
      version: SCRIPT_VERSION,
      count: facilities.length,
      source: snapshot ? "page-bridge" : "sandbox",
    });
    return true;
  }

  function availableSlotMinutes(slot, date) {
    return normalizedAvailableSlotMinutes(slot, date);
  }

  function longestAvailableMinutes(seat, date) {
    if (!Array.isArray(seat.availableSlots)) return seat.status === "FREE" ? 24 * 60 : 0;
    return seat.availableSlots.reduce((max, slot) => Math.max(max, availableSlotMinutes(slot, date)), 0);
  }

  function seatAvailabilityClass(seat, context) {
    if (!seat || seat.type !== "SEAT") return "";
    if (!seat.enabled) return "libseat-seat-disabled";

    const date = context && context.date ? context.date : todayText();
    const minDuration = reservationMinDurationMinutes(context && context.rule);
    const minutes = longestAvailableMinutes(seat, date);
    if (minutes < minDuration) return "libseat-seat-in-use";
    if (minutes >= 120) return "libseat-seat-free-120";
    if (minutes >= 60) return "libseat-seat-free-60";
    return "libseat-seat-free-30";
  }

  function clearSeatAvailabilityClasses(element) {
    element.classList.remove(
      "libseat-seat-in-use",
      "libseat-seat-free-30",
      "libseat-seat-free-60",
      "libseat-seat-free-120",
      "libseat-seat-disabled"
    );
  }

  function markFacilitySeatClasses(box, seatList, positionDistin) {
    const cellStep = Number(positionDistin) || 50;
    const facilityPositions = new Set();
    seatList.forEach((seat) => {
      if (!seat || !facilityTypeImage(seat.type)) return;
      facilityPositions.add(`${Number(seat.x) + 1}:${Number(seat.y) + 1}`);
    });

    box.querySelectorAll(".seatClass-pc, .seatClass").forEach((node) => {
      const left = Math.round(pxNumber(node.style.left));
      const top = Math.round(pxNumber(node.style.top));
      const positionKey = `${Math.round(left / cellStep)}:${Math.round(top / cellStep)}`;
      const isFacility = facilityPositions.has(positionKey) || !!node.querySelector("uni-image.seat-img");

      node.classList.toggle("libseat-facility-class", isFacility);
      if (isFacility && !node.dataset.libseatFacilityClickBlocked) {
        node.dataset.libseatFacilityClickBlocked = "1";
        node.addEventListener(
          "click",
          (event) => {
            if (!node.classList.contains("libseat-facility-class")) return;
            event.preventDefault();
            event.stopImmediatePropagation();
          },
          true
        );
      }
    });
  }

  function classifySeatMap() {
    document.querySelectorAll(".seatBox-pc, .seatBox").forEach((box) => {
      const snapshot = pageSeatListSnapshot(box);
      const vm = snapshot ? null : findSeatListVm(box);
      const seatList = snapshot ? snapshot.seats : vm && vm.seatList;
      if (!Array.isArray(seatList) || !seatList.length) return;
      markFacilitySeatClasses(
        box,
        seatList,
        (snapshot && snapshot.positionDistin) || (vm && vm.positionDistin)
      );

      const context = {
        date: snapshot && snapshot.timeRange && snapshot.timeRange.date ? snapshot.timeRange.date : todayText(),
        rule: snapshot && snapshot.rule ? snapshot.rule : null,
      };
      const cellStep = Number((snapshot && snapshot.positionDistin) || (vm && vm.positionDistin)) || 50;
      const byId = new Map();
      const byName = new Map();
      const byPosition = new Map();
      seatList.forEach((seat) => {
        if (!seat) return;
        byId.set(Number(seat.id), seat);
        byPosition.set(`${Number(seat.x)}:${Number(seat.y)}`, seat);
        if (seat.type === "SEAT" && seat.name) byName.set(String(seat.name), seat);
      });

      box.querySelectorAll(".seatClass-pc, .seatClass").forEach((node) => {
        const key = node.getAttribute("key");
        const seatId = key && /^\d+$/.test(key) ? Number(key) : null;
        const label = node.querySelector(".seat-number");
        const left = Math.round(pxNumber(node.style.left));
        const top = Math.round(pxNumber(node.style.top));
        const idSeat = seatId !== null ? byId.get(seatId) : null;
        const nameSeat = label && byName.get(label.textContent.trim());
        const positionSeat = byPosition.get(`${Math.round(left / cellStep) - 1}:${Math.round(top / cellStep) - 1}`);
        const seat = positionSeat || idSeat || nameSeat;
        const seatElement = node.querySelector(".seat-pc, .seat");
        if (!seatElement || !seat || seat.type !== "SEAT") return;

        clearSeatAvailabilityClasses(seatElement);
        seatElement.classList.add(seatAvailabilityClass(seat, context));
      });
    });
  }

  function queueClassifySeatMap() {
    requestAnimationFrame(() => classifySeatMap());
  }

  function stabilizeFacilityImages() {
    document.querySelectorAll(".seatBox-pc, .seatBox").forEach(renderFacilityOverlay);

    document.querySelectorAll("uni-image.seat-img").forEach((image) => {
      const cell = image.closest(".seat-pc, .seat, .seatClass-pc, .seatClass");
      if (cell) cell.classList.add("libseat-facility-cell");

      const url = facilityImageUrl(image);
      if (url) {
        image.style.setProperty("--libseat-facility-image", `url("${url}")`);
        image.classList.add("libseat-facility-bg");
      }

      const img = image.querySelector("img");
      if (img) {
        img.loading = "eager";
        img.decoding = "async";
        img.draggable = false;
      }
    });

    document.querySelectorAll(".seatBox-pc, .seatBox").forEach(waitForFacilityImagesThenReveal);
  }

  function waitForFacilityImagesThenReveal(box) {
    const facilityImages = Array.from(box.querySelectorAll("uni-image.seat-img"));
    if (!facilityImages.length) return;

    const count = facilityImages.length;
    const now = Date.now();
    const countChanged = box.dataset.libseatAssetCount !== String(count);
    const wasReady = box.dataset.libseatAssetsReady === "1";
    let firstSeenAt = Number(box.dataset.libseatAssetFirstSeenAt || 0);
    if (!firstSeenAt) {
      firstSeenAt = now;
      box.dataset.libseatAssetFirstSeenAt = String(now);
    }

    if (countChanged) {
      box.dataset.libseatAssetCount = String(count);
      box.dataset.libseatAssetStableAt = String(now);
      if (!wasReady) {
        box.dataset.libseatAssetsReady = "0";
        box.classList.remove("libseat-assets-ready");
        box.classList.add("libseat-assets-pending");
      }
      debugFacilityAssets("facility count changed", { count, wasReady });
      if (wasReady) return;
      if (now - firstSeenAt < FACILITY_REVEAL_FALLBACK_MS) {
        queueFacilityRevealCheck(
          box,
          Math.min(FACILITY_DOM_STABLE_MS + 20, FACILITY_REVEAL_FALLBACK_MS - (now - firstSeenAt) + 20)
        );
        return;
      }
    }

    if (wasReady) return;

    box.classList.add("libseat-assets-pending");

    const stableAt = Number(box.dataset.libseatAssetStableAt || 0);
    if (now - stableAt >= FACILITY_DOM_STABLE_MS || now - firstSeenAt >= FACILITY_REVEAL_FALLBACK_MS) {
      requestAnimationFrame(() => requestAnimationFrame(() => markFacilityImagesReady(box)));
    } else {
      queueFacilityRevealCheck(box, Math.max(20, FACILITY_DOM_STABLE_MS - (now - stableAt) + 20));
    }
  }

  function markFacilityImagesReady(box) {
    box.dataset.libseatAssetsReady = "1";
    box.classList.remove("libseat-assets-pending");
    box.classList.add("libseat-assets-ready");
    debugFacilityAssets("facility assets revealed", {
      version: SCRIPT_VERSION,
      count: Number(box.dataset.libseatAssetCount || 0),
      elapsed: Date.now() - Number(box.dataset.libseatAssetFirstSeenAt || Date.now()),
    });
  }

  function replaceSeatLegend() {
    document.querySelectorAll(".seat-tips").forEach((tips) => {
      if (tips.dataset.libseatLegendEnhanced === "1") return;
      tips.dataset.libseatLegendEnhanced = "1";
      tips.innerHTML = `
        <div class="libseat-seat-legend">
          <div class="libseat-seat-legend-item"><span class="libseat-seat-legend-box in-use"></span><span>无可预约时间</span></div>
          <div class="libseat-seat-legend-item"><span class="libseat-seat-legend-box free-30"></span><span>30分钟-1小时</span></div>
          <div class="libseat-seat-legend-item"><span class="libseat-seat-legend-box free-60"></span><span>1小时以上</span></div>
          <div class="libseat-seat-legend-item"><span class="libseat-seat-legend-box free-120"></span><span>2小时以上</span></div>
          <div class="libseat-seat-legend-item"><span class="libseat-seat-legend-box disabled"></span><span>不可用</span></div>
        </div>
      `;
    });
  }

  function syncReplacementInputs(block, controls) {
    if (controls.focused) return;
    const value = currentRangePickerValue(block);
    updateDateButtons(controls, value.date);
    if (value.startTime && controls.start.value !== value.startTime) controls.start.value = value.startTime;
    if (value.endTime && controls.end.value !== value.endTime) controls.end.value = value.endTime;
    if (controls.seat && controls.button && controls.status) updateReserveButtonDetail(block, controls);
  }

  function updateDateButtons(controls, dateValue) {
    const value = dateValue || controls.date;
    controls.date = value;
    controls.todayButton.classList.toggle("active", value === controls.todayButton.dataset.date);
    controls.tomorrowButton.classList.toggle("active", value === controls.tomorrowButton.dataset.date);
  }

  function bindDateButton(block, controls, button) {
    if (button.dataset.libseatBound) return;
    button.dataset.libseatBound = "1";
    button.addEventListener("click", () => {
      const value = button.dataset.date;
      controls.date = value;
      updateDateButtons(controls, value);
      emitRangePickerChange(block, "date", value);
    });
  }

  function bindTimeInput(block, nativeInput, field) {
    if (nativeInput.dataset.libseatBound) return;
    nativeInput.dataset.libseatBound = "1";
    nativeInput.addEventListener("focus", () => {
      const wrapper = nativeInput.closest(".libseat-time-replacement, .libseat-slot-replacement");
      if (wrapper) wrapper.dataset.libseatFocused = "1";
    });
    nativeInput.addEventListener("blur", () => {
      const wrapper = nativeInput.closest(".libseat-time-replacement, .libseat-slot-replacement");
      if (wrapper) wrapper.dataset.libseatFocused = "";
      const value = nativeInput.value.trim();
      if (!isTimeText(value)) return;
      nativeInput.value = value;
      emitRangePickerChange(block, field, value);
    });
    nativeInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      nativeInput.blur();
    });
  }

  function bindReserveSeatInput(input) {
    input.addEventListener("focus", () => {
      input.closest(".libseat-time-replacement").dataset.libseatFocused = "1";
    });
    input.addEventListener("blur", () => {
      input.closest(".libseat-time-replacement").dataset.libseatFocused = "";
      input.value = input.value.trim();
    });
    input.addEventListener("input", () => {
      input.dataset.libseatUserEdited = "1";
    });
  }

  function setReserveStatus(controls, text, tone) {
    controls.status.textContent = text;
    controls.status.classList.remove("success", "warn", "error");
    controls.status.dataset.libseatTone = tone || "";
    if (tone) controls.status.classList.add(tone);
  }

  function updateReserveButtonDetail(block, controls, force) {
    if (controls.busy) return;

    const range = reservationRangeFromControls(block, controls);
    const resolved = resolveSeatCandidates(controls.seat.value);
    const canUpdateStatus = force || !controls.status.dataset.libseatTone;
    if (range.error || !resolved.seats.length) {
      controls.button.removeAttribute("title");
      controls.button.setAttribute("aria-label", "预约座位");
      if (!canUpdateStatus) return;
      if (range.error) {
        setReserveStatus(controls, range.error, "error");
      } else if (controls.seat.value.trim()) {
        setReserveStatus(controls, resolved.errors[0] || "请输入座位号", "error");
      } else {
        setReserveStatus(controls, "输入座位号后使用当前日期和时间提交", "");
      }
      return;
    }

    const detail = reservationCandidatesDetailText(resolved.seats, range);
    controls.button.title = detail;
    controls.button.setAttribute("aria-label", `预约座位：${detail}`);
    if (canUpdateStatus) {
      setReserveStatus(controls, `将预约：${detail}`, "");
    }
  }

  function currentReservationDate(block, controls) {
    const pickerValue = currentRangePickerValue(block);
    return String(controls.date || pickerValue.date || "").trim();
  }

  function setReserveSlotEmpty(controls, text, loading) {
    controls.slotSelect.style.display = "none";
    controls.slotEmpty.style.display = "flex";
    controls.slotEmpty.classList.toggle("loading", !!loading);
    controls.slotEmpty.textContent = text;
  }

  function applyReserveSlot(block, controls) {
    if (!controls.slotSelect.value) return;

    const [startTime, endTime] = controls.slotSelect.value.split("|");
    controls.applyingSlot = true;
    controls.start.value = startTime;
    controls.end.value = endTime;
    emitRangePickerRange(block, { startTime, endTime }, false);
    controls.applyingSlot = false;
    updateReserveButtonDetail(block, controls);
  }

  function renderReserveSlots(block, controls, seat, slots) {
    const previous = controls.slotSelect.value;
    controls.slotSelect.innerHTML = "";

    if (!slots.length) {
      setReserveSlotEmpty(controls, `${seat.label} 当前日期没有可预约时间段`, false);
      updateReserveButtonDetail(block, controls);
      return;
    }

    controls.slotSelect.style.display = "";
    controls.slotEmpty.style.display = "none";
    controls.slotEmpty.classList.remove("loading");

    slots.forEach((slot) => {
      const option = document.createElement("option");
      option.value = slotValue(slot);
      option.textContent = `${seat.label} ${minutesToTime(slot.start)} - ${minutesToTime(slot.end)}`;
      controls.slotSelect.appendChild(option);
    });

    const selected = Array.from(controls.slotSelect.options).some((option) => option.value === previous)
      ? previous
      : controls.slotSelect.options[0].value;
    controls.slotSelect.value = selected;
    if (!controls.timeManuallyEdited && (selected !== previous || controls.slotSeatId !== Number(seat.id))) {
      controls.slotSeatId = Number(seat.id);
      applyReserveSlot(block, controls);
    } else {
      controls.slotSeatId = Number(seat.id);
    }
    updateReserveButtonDetail(block, controls);
  }

  async function updateReserveSlotSelect(block, controls) {
    const requestId = (controls.slotRequestId || 0) + 1;
    controls.slotRequestId = requestId;

    const date = currentReservationDate(block, controls);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setReserveSlotEmpty(controls, "日期格式不正确", false);
      return;
    }

    const resolved = resolveSeatCandidates(controls.seat.value);
    const seat = resolved.seats[0];
    if (!seat) {
      setReserveSlotEmpty(controls, resolved.errors[0] || "请输入座位号", false);
      return;
    }
    if (resolved.seats.length > 1) {
      setReserveStatus(controls, `时间段显示 ${seat.label}；提交时会按 ${resolved.seats.length} 个候选依次尝试`, "");
    }

    const rule = currentReservationRule();
    const optimisticSlots = availableSlotsFromSeat(seat.seat, date, rule);
    if (optimisticSlots.length) {
      renderReserveSlots(block, controls, seat, optimisticSlots);
    } else {
      setReserveSlotEmpty(controls, `正在读取 ${seat.label} 预约情况`, true);
    }

    const result = await fetchSeatReservationsByDate(seat.id, date);
    if (controls.slotRequestId !== requestId) return;

    if (!result.ok || !Array.isArray(result.data)) {
      if (!optimisticSlots.length) {
        setReserveSlotEmpty(controls, `读取失败：${responseMessage(result)}`, false);
      } else {
        setReserveStatus(controls, `预约情况读取失败，暂用地图时间段：${responseMessage(result)}`, "warn");
      }
      return;
    }

    renderReserveSlots(block, controls, seat, availableSlots({ reservations: result.data, rule }, date));
  }

  function queueReserveSlotUpdate(block, controls, delay) {
    window.clearTimeout(controls.slotUpdateTimer);
    controls.slotUpdateTimer = window.setTimeout(() => updateReserveSlotSelect(block, controls), delay);
  }

  function submitSuccessStatusText(submitData, seat, range, verify) {
    const detail = reservationDetailText(seat, range, submitData, verify);
    return verify && verify.ok
      ? `预约成功并已确认：${detail}`
      : `预约成功：${detail}${verify ? `；${verify.message}` : ""}`;
  }

  async function submitResolvedSeatsWithRetries(resolvedSeats, range, onStatus) {
    let lastResult = null;

    for (let attempt = 1; attempt <= DEFAULT_RESERVATION_RETRIES; attempt += 1) {
      for (let index = 0; index < resolvedSeats.length; index += 1) {
        const seat = resolvedSeats[index];
        onStatus(
          `第 ${attempt}/${DEFAULT_RESERVATION_RETRIES} 次提交：${reservationDetailText(seat, range)}`,
          "warn"
        );

        const result = await submitSeatReservation(seat.id, range.startDateTime, range.endDateTime);
        lastResult = result;
        const success = submitResponseSuccess(result, seat.id);
        if (success) {
          const verify = await verifyActiveReservation(seat.id, range.startDateTime, range.endDateTime);
          return {
            ok: true,
            seat,
            submitData: success,
            verify,
            tone: verify.ok ? "success" : "warn",
            message: submitSuccessStatusText(success, seat, range, verify),
          };
        }

        if (index < resolvedSeats.length - 1 || attempt < DEFAULT_RESERVATION_RETRIES) {
          await sleepMs(DEFAULT_RESERVATION_RETRY_INTERVAL_MS);
        }
      }
    }

    for (const seat of resolvedSeats) {
      const verify = await verifyActiveReservation(seat.id, range.startDateTime, range.endDateTime);
      if (verify.ok) {
        return {
          ok: true,
          seat,
          submitData: null,
          verify,
          tone: "success",
          message: `预约已在当前预约列表确认：${reservationDetailText(seat, range, null, verify)}`,
        };
      }
    }

    return {
      ok: false,
      message: `预约失败：${responseMessage(lastResult)}`,
      tone: "error",
    };
  }

  function nextAutoSubmitDelay() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(Math.floor(AUTO_RESERVATION_SUBMIT_MINUTES / 60), AUTO_RESERVATION_SUBMIT_MINUTES % 60, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return {
      target,
      delay: Math.max(0, target.getTime() - now.getTime()),
    };
  }

  function scheduleAutoReservation(block, controls) {
    const next = nextAutoSubmitDelay();
    const timerDelay = Math.min(next.delay, AUTO_RESERVATION_MAX_TIMER_MS);
    controls.autoTargetTime = next.target;
    controls.autoTimer = window.setTimeout(() => {
      if (!controls.autoEnabled) return;
      if (Date.now() >= controls.autoTargetTime.getTime()) {
        runAutoSeatReservation(block, controls, controls.autoTargetTime);
      } else {
        scheduleAutoReservation(block, controls);
      }
    }, timerDelay);
    return next;
  }

  function formatAutoSubmitTarget(target) {
    return `${formatDateText(target)} ${minutesToTime(AUTO_RESERVATION_SUBMIT_MINUTES)}`;
  }

  function setAutoReserveEnabled(block, controls, enabled) {
    controls.autoEnabled = enabled;
    controls.autoToggle.checked = enabled;
    window.clearTimeout(controls.autoTimer);
    controls.autoTimer = null;

    if (!enabled) {
      setReserveStatus(controls, "已关闭 21:00 自动预约", "");
      return;
    }

    const preview = nextAutoSubmitDelay();
    const autoRange = reservationRangeFromControls(block, controls, autoReservationDateForSubmitTime(preview.target));
    const resolved = resolveSeatCandidates(controls.seat.value);
    if (autoRange.error) {
      controls.autoToggle.checked = false;
      controls.autoEnabled = false;
      setReserveStatus(controls, autoRange.error, "error");
      return;
    }
    if (!resolved.seats.length) {
      controls.autoToggle.checked = false;
      controls.autoEnabled = false;
      setReserveStatus(controls, resolved.errors[0] || "请输入座位号", "error");
      return;
    }
    if (!currentAuthorizationHeader()) {
      controls.autoToggle.checked = false;
      controls.autoEnabled = false;
      setReserveStatus(controls, "没有读取到登录令牌，请刷新页面或重新登录后再试", "error");
      return;
    }

    const next = scheduleAutoReservation(block, controls);
    setReserveStatus(
      controls,
      `已开启 21:00 自动预约次日座位：${formatAutoSubmitTarget(next.target)} 提交；${reservationCandidatesDetailText(resolved.seats, autoRange)}`,
      "warn"
    );
  }

  async function runAutoSeatReservation(block, controls, submitTime) {
    controls.autoTimer = null;
    if (!controls.autoEnabled) return;

    if (controls.busy) {
      controls.autoTimer = window.setTimeout(() => runAutoSeatReservation(block, controls, submitTime), 1000);
      return;
    }

    const effectiveSubmitTime = submitTime || new Date();
    const reserveDate = autoReservationDateForSubmitTime(effectiveSubmitTime);
    const range = reservationRangeFromControls(block, controls, reserveDate);
    const resolved = resolveSeatCandidates(controls.seat.value);
    if (range.error || !resolved.seats.length || !currentAuthorizationHeader()) {
      controls.autoEnabled = false;
      controls.autoToggle.checked = false;
      setReserveStatus(controls, range.error || resolved.errors[0] || "自动预约配置不完整", "error");
      return;
    }

    controls.busy = true;
    controls.button.disabled = true;
    controls.button.textContent = "自动中";

    try {
      setReserveStatus(controls, `21:00 自动预约开始：${reservationCandidatesDetailText(resolved.seats, range)}`, "warn");
      const result = await submitResolvedSeatsWithRetries(resolved.seats, range, (message, tone) =>
        setReserveStatus(controls, message, tone)
      );
      setReserveStatus(controls, result.message, result.tone);

      if (result.ok) {
        controls.autoEnabled = false;
        controls.autoToggle.checked = false;
      } else if (controls.autoEnabled) {
        scheduleAutoReservation(block, controls);
      }
    } finally {
      controls.busy = false;
      controls.button.disabled = false;
      controls.button.textContent = "预约座位";
    }
  }

  async function runSeatReservation(block, controls) {
    if (controls.busy) return;

    const range = reservationRangeFromControls(block, controls);
    if (range.error) {
      setReserveStatus(controls, range.error, "error");
      return;
    }

    const resolved = resolveSeatCandidates(controls.seat.value);
    if (!resolved.seats.length) {
      setReserveStatus(controls, resolved.errors[0] || "请输入座位号", "error");
      return;
    }

    if (!currentAuthorizationHeader()) {
      setReserveStatus(controls, "没有读取到登录令牌，请刷新页面或重新登录后再试", "error");
      return;
    }

    controls.busy = true;
    controls.button.disabled = true;
    controls.button.textContent = "提交中";
    setReserveStatus(controls, `准备预约：${reservationCandidatesDetailText(resolved.seats, range)}`, "warn");

    try {
      const result = await submitResolvedSeatsWithRetries(resolved.seats, range, (message, tone) =>
        setReserveStatus(controls, message, tone)
      );
      setReserveStatus(controls, result.message, result.tone);
      if (result.ok && controls.autoEnabled) {
        controls.autoEnabled = false;
        controls.autoToggle.checked = false;
        window.clearTimeout(controls.autoTimer);
        controls.autoTimer = null;
      }
    } finally {
      controls.busy = false;
      controls.button.disabled = false;
      controls.button.textContent = "预约座位";
    }
  }

  function enhanceTimePicker(block) {
    hideOriginalPicker(block);
    if (block.dataset.libseatTimeEnhanced) return;

    const value = currentRangePickerValue(block);
    const today = todayText();
    const tomorrow = tomorrowText();
    const defaultDate = defaultDateText();
    const dateValue = defaultDate;
    const defaultStart = defaultStartMinutesForDate(dateValue);
    const defaultEnd = defaultEndMinutesForDate();
    const startValue =
      value.date === dateValue && value.startTime && isTimeText(value.startTime)
        ? value.startTime
        : minutesToTime(defaultStart);
    const endValue =
      value.date === dateValue && value.endTime && isTimeText(value.endTime)
        ? value.endTime
        : minutesToTime(defaultEnd);

    const wrapper = document.createElement("div");
    const index = ++replacementIndex;
    const startId = `libseat-start-input-${index}`;
    const endId = `libseat-end-input-${index}`;
    const seatId = `libseat-seat-input-${index}`;
    const reserveSlotId = `libseat-reserve-slot-select-${index}`;
    const autoId = `libseat-auto-reserve-${index}`;
    wrapper.className = "libseat-time-replacement";
    wrapper.innerHTML = `
      <div class="libseat-time-replacement-head">
        <div class="libseat-time-replacement-title">预约座位</div>
        <div class="libseat-time-replacement-hint">手动输入后按 Enter 或失焦生效</div>
      </div>
      <div class="libseat-reserve-main-grid">
        <div class="libseat-time-field">
          <label>日期</label>
          <div class="libseat-date-buttons">
            <button class="libseat-date-button libseat-today-button" type="button" data-date="${today}">今天 ${today.slice(5)}</button>
            <button class="libseat-date-button libseat-tomorrow-button" type="button" data-date="${tomorrow}">明天 ${tomorrow.slice(5)}</button>
          </div>
        </div>
        <div class="libseat-time-field">
          <label for="${startId}">开始</label>
          <input id="${startId}" name="libseat_start_${index}" class="libseat-start-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="开始时间">
        </div>
        <div class="libseat-time-field">
          <label for="${endId}">结束</label>
          <input id="${endId}" name="libseat_end_${index}" class="libseat-end-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="结束时间">
        </div>
        <div class="libseat-time-field">
          <label for="${seatId}">座位</label>
          <input id="${seatId}" name="libseat_seat_${index}" class="libseat-seat-input" type="text" inputmode="text" autocomplete="off" placeholder="62, 63 或 id:44" aria-label="座位号">
        </div>
        <div class="libseat-time-field">
          <label for="${reserveSlotId}">可预约时间段</label>
          <select id="${reserveSlotId}" name="libseat_reserve_slot_${index}" class="libseat-slot-select" aria-label="可预约时间段"></select>
          <div class="libseat-slot-empty" style="display:none;">输入座位号后读取时间段</div>
        </div>
        <div class="libseat-reserve-submit">
          <button class="libseat-reserve-button" type="button">预约座位</button>
        </div>
        <div class="libseat-reserve-status" aria-live="polite">输入座位号后使用当前日期和时间提交</div>
      </div>
      <div class="libseat-auto-reserve-panel">
        <label class="libseat-reserve-auto" for="${autoId}">
          <input id="${autoId}" class="libseat-auto-toggle" type="checkbox">
          <span>21:00 自动预约次日座位</span>
        </label>
        <div class="libseat-auto-hint">使用上面的座位和开始/结束时间；可填多个座位，成功一个即停止</div>
      </div>
    `;

    const controls = {
      date: dateValue,
      todayButton: wrapper.querySelector(".libseat-today-button"),
      tomorrowButton: wrapper.querySelector(".libseat-tomorrow-button"),
      start: wrapper.querySelector(".libseat-start-input"),
      end: wrapper.querySelector(".libseat-end-input"),
      seat: wrapper.querySelector(".libseat-seat-input"),
      slotSelect: wrapper.querySelector(".libseat-slot-select"),
      slotEmpty: wrapper.querySelector(".libseat-slot-empty"),
      button: wrapper.querySelector(".libseat-reserve-button"),
      autoToggle: wrapper.querySelector(".libseat-auto-toggle"),
      status: wrapper.querySelector(".libseat-reserve-status"),
      busy: false,
      autoEnabled: false,
      autoTimer: null,
      slotUpdateTimer: null,
      slotRequestId: 0,
      slotSeatId: null,
      timeManuallyEdited: false,
      applyingSlot: false,
      get focused() {
        return wrapper.dataset.libseatFocused === "1";
      },
    };

    controls.start.value = startValue;
    controls.end.value = endValue;
    updateDateButtons(controls, dateValue);
    if (dateValue !== value.date || startValue !== value.startTime || endValue !== value.endTime) {
      emitRangePickerRange(block, { date: dateValue, startTime: startValue, endTime: endValue }, dateValue !== value.date);
    }
    bindDateButton(block, controls, controls.todayButton);
    bindDateButton(block, controls, controls.tomorrowButton);
    bindTimeInput(block, controls.start, "startTime");
    bindTimeInput(block, controls.end, "endTime");
    controls.start.addEventListener("input", () => {
      if (!controls.applyingSlot) controls.timeManuallyEdited = true;
      updateReserveButtonDetail(block, controls, true);
    });
    controls.end.addEventListener("input", () => {
      if (!controls.applyingSlot) controls.timeManuallyEdited = true;
      updateReserveButtonDetail(block, controls, true);
    });
    bindReserveSeatInput(controls.seat);
    setReserveSlotEmpty(controls, "输入座位号后读取时间段", false);
    controls.seat.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      runSeatReservation(block, controls);
    });
    controls.seat.addEventListener("input", () => {
      queueReserveSlotUpdate(block, controls, 350);
      updateReserveButtonDetail(block, controls, true);
      if (controls.autoEnabled) setAutoReserveEnabled(block, controls, true);
    });
    controls.slotSelect.addEventListener("change", () => {
      applyReserveSlot(block, controls);
      updateReserveButtonDetail(block, controls, true);
    });
    controls.todayButton.addEventListener("click", () => {
      queueReserveSlotUpdate(block, controls, 500);
      setTimeout(() => updateReserveButtonDetail(block, controls, true), 0);
      if (controls.autoEnabled) setAutoReserveEnabled(block, controls, true);
    });
    controls.tomorrowButton.addEventListener("click", () => {
      queueReserveSlotUpdate(block, controls, 500);
      setTimeout(() => updateReserveButtonDetail(block, controls, true), 0);
      if (controls.autoEnabled) setAutoReserveEnabled(block, controls, true);
    });
    controls.start.addEventListener("blur", () => {
      updateReserveButtonDetail(block, controls, true);
      if (controls.autoEnabled) setAutoReserveEnabled(block, controls, true);
    });
    controls.end.addEventListener("blur", () => {
      updateReserveButtonDetail(block, controls, true);
      if (controls.autoEnabled) setAutoReserveEnabled(block, controls, true);
    });
    controls.autoToggle.addEventListener("change", () => setAutoReserveEnabled(block, controls, controls.autoToggle.checked));
    controls.button.addEventListener("click", () => runSeatReservation(block, controls));

    block.parentNode.insertBefore(wrapper, block);
    block.dataset.libseatTopReplacement = "1";
    block.dataset.libseatTimeEnhanced = "1";

    setInterval(() => {
      syncReplacementInputs(block, controls);
    }, 1500);
  }

  function reservationIntervals(modalVm, date) {
    const open = timeToMinutes(DAY_OPEN_TIME);
    const close = timeToMinutes(DAY_CLOSE_TIME);
    const intervals = [];

    for (const item of modalVm.reservations || []) {
      if (!item || item.status === "CANCELLED") continue;

      const startText = String(item.startTime || item.time || "");
      const endText = String(item.endTime || "");
      if (date && item.startTime && !String(item.startTime).startsWith(date)) continue;

      const start = timeToMinutes(startText);
      const end = timeToMinutes(endText);
      if (start === null || end === null || end <= start) continue;

      intervals.push({
        start: Math.max(open, start),
        end: Math.min(close, end),
      });
    }

    intervals.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const interval of intervals) {
      if (interval.end <= interval.start) continue;
      const last = merged[merged.length - 1];
      if (!last || interval.start > last.end) {
        merged.push(interval);
      } else {
        last.end = Math.max(last.end, interval.end);
      }
    }
    return merged;
  }

  function availableSlots(modalVm, date) {
    const open = effectiveOpenMinutes(date);
    const close = timeToMinutes(DAY_CLOSE_TIME);
    const occupied = reservationIntervals(modalVm, date);
    const slots = [];
    let cursor = open;

    for (const interval of occupied) {
      if (interval.start > cursor) {
        slots.push({ start: cursor, end: interval.start });
      }
      cursor = Math.max(cursor, interval.end);
    }

    if (cursor < close) {
      slots.push({ start: cursor, end: close });
    }

    const minDuration = reservationMinDurationMinutes(modalVm.rule);
    return slots.filter((slot) => slot.end - slot.start >= minDuration);
  }

  function availableSlotsFromSeat(seat, date, rule) {
    if (!seat || !Array.isArray(seat.availableSlots)) return [];

    const close = timeToMinutes(DAY_CLOSE_TIME);
    const minDuration = reservationMinDurationMinutes(rule);
    return seat.availableSlots
      .map((slot) => {
        const startText = String(slot.start || slot.startTime || "");
        const endText = String(slot.end || slot.endTime || "");
        const slotDate = dateTextFromValue(startText) || dateTextFromValue(endText);
        if (date && slotDate && slotDate !== date) return null;

        let start = timeToMinutes(startText);
        let end = timeToMinutes(endText);
        if (start === null || end === null || end <= start) return null;

        start = Math.max(effectiveOpenMinutes(date), start);
        end = Math.min(close, end);
        return end - start >= minDuration ? { start, end } : null;
      })
      .filter(Boolean);
  }

  function slotValue(slot) {
    return `${minutesToTime(slot.start)}|${minutesToTime(slot.end)}`;
  }

  function updateSlotSelect(block, controls) {
    const modalVm = findReservationModalVm(block);
    const snapshot = pageModalSnapshot(block);
    if (!modalVm && !snapshot) return;

    const date =
      (modalVm && modalVm.timeRange && modalVm.timeRange.date) ||
      (snapshot && snapshot.timeRange && snapshot.timeRange.date) ||
      controls.date;
    controls.date = date;
    updateDateButtons(controls, date);

    if (
      modalVm &&
      typeof modalVm.getSeatReservations === "function" &&
      controls.requestedReservationDate !== date
    ) {
      controls.requestedReservationDate = date;
      setTimeout(() => modalVm.getSeatReservations(), 0);
    }

    const selectedSeat =
      snapshot &&
      snapshot.sourceTimeRange &&
      snapshot.sourceTimeRange.date === date
        ? snapshot.selectedSeat
        : null;
    const rule = (snapshot && snapshot.rule) || (modalVm && modalVm.rule);
    const optimisticSlots = availableSlotsFromSeat(selectedSeat, date, rule);
    const reservationSlots = modalVm ? availableSlots(modalVm, date) : [];
    const hasOptimisticData = !!selectedSeat && Array.isArray(selectedSeat.availableSlots);
    const useOptimisticSlots = hasOptimisticData && (!modalVm || !modalVm.reservations.length);
    const slots = useOptimisticSlots ? optimisticSlots : reservationSlots;
    const previous = controls.select.value;
    controls.select.innerHTML = "";

    if (!slots.length) {
      controls.select.style.display = "none";
      controls.empty.style.display = "flex";
      controls.empty.classList.toggle("loading", !modalVm && !hasOptimisticData);
      controls.empty.textContent = !modalVm && !hasOptimisticData ? "正在读取预约情况" : "当前日期没有可预约时间段";
      return;
    }

    controls.select.style.display = "";
    controls.empty.style.display = "none";
    controls.empty.classList.remove("loading");

    for (const slot of slots) {
      const option = document.createElement("option");
      option.value = slotValue(slot);
      option.textContent = `${minutesToTime(slot.start)} - ${minutesToTime(slot.end)}`;
      controls.select.appendChild(option);
    }

    const selected = Array.from(controls.select.options).some((option) => option.value === previous)
      ? previous
      : controls.select.options[0].value;
    controls.select.value = selected;
    if (!controls.timeManuallyEdited && selected !== previous) {
      applySelectedSlot(block, controls);
    }
  }

  function applySelectedSlot(block, controls) {
    if (!controls.select.value) return;

    const [startTime, endTime] = controls.select.value.split("|");
    controls.applyingSlot = true;
    controls.start.value = startTime;
    controls.end.value = endTime;
    emitRangePickerRange(block, { startTime, endTime }, false);
    controls.applyingSlot = false;
  }

  function enhanceModalTimePicker(block) {
    hideOriginalPicker(block);
    if (block.dataset.libseatSlotEnhanced) return;

    const modalVm = findReservationModalVm(block);
    const value = currentRangePickerValue(block);
    const today = todayText();
    const tomorrow = tomorrowText();
    const defaultDate = defaultDateText();
    const dateValue = defaultDate;

    const wrapper = document.createElement("div");
    const index = ++replacementIndex;
    const selectId = `libseat-slot-select-${index}`;
    const startId = `libseat-modal-start-input-${index}`;
    const endId = `libseat-modal-end-input-${index}`;
    wrapper.className = "libseat-slot-replacement";
    wrapper.innerHTML = `
      <div class="libseat-time-replacement-head">
        <div class="libseat-time-replacement-title">可用时间段</div>
        <div class="libseat-time-replacement-hint">今天从当前时间开始，明天 ${DAY_OPEN_TIME}-${DAY_CLOSE_TIME}</div>
      </div>
      <div class="libseat-slot-grid">
        <div class="libseat-time-field">
          <label>日期</label>
          <div class="libseat-date-buttons">
            <button class="libseat-date-button libseat-today-button" type="button" data-date="${today}">今天 ${today.slice(5)}</button>
            <button class="libseat-date-button libseat-tomorrow-button" type="button" data-date="${tomorrow}">明天 ${tomorrow.slice(5)}</button>
          </div>
        </div>
        <div class="libseat-time-field">
          <label for="${selectId}">时间段</label>
          <select id="${selectId}" name="libseat_slot_${index}" class="libseat-slot-select" aria-label="可用时间段"></select>
          <div class="libseat-slot-empty" style="display:none;">当前日期没有可预约时间段</div>
        </div>
        <div class="libseat-time-field">
          <label for="${startId}">开始</label>
          <input id="${startId}" name="libseat_modal_start_${index}" class="libseat-start-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="开始时间">
        </div>
        <div class="libseat-time-field">
          <label for="${endId}">结束</label>
          <input id="${endId}" name="libseat_modal_end_${index}" class="libseat-end-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="结束时间">
        </div>
      </div>
    `;

    const controls = {
      date: dateValue,
      todayButton: wrapper.querySelector(".libseat-today-button"),
      tomorrowButton: wrapper.querySelector(".libseat-tomorrow-button"),
      select: wrapper.querySelector(".libseat-slot-select"),
      empty: wrapper.querySelector(".libseat-slot-empty"),
      start: wrapper.querySelector(".libseat-start-input"),
      end: wrapper.querySelector(".libseat-end-input"),
      requestedReservationDate: "",
      timeManuallyEdited: false,
      applyingSlot: false,
    };

    controls.start.value = value.startTime && isTimeText(value.startTime) ? value.startTime : "";
    controls.end.value = value.endTime && isTimeText(value.endTime) ? value.endTime : "";
    updateDateButtons(controls, dateValue);
    if (dateValue !== value.date) {
      emitRangePickerChange(block, "date", dateValue);
    }
    bindDateButton(block, controls, controls.todayButton);
    bindDateButton(block, controls, controls.tomorrowButton);
    bindTimeInput(block, controls.start, "startTime");
    bindTimeInput(block, controls.end, "endTime");
    controls.start.addEventListener("input", () => {
      if (!controls.applyingSlot) controls.timeManuallyEdited = true;
    });
    controls.end.addEventListener("input", () => {
      if (!controls.applyingSlot) controls.timeManuallyEdited = true;
    });
    controls.todayButton.addEventListener("click", () => setTimeout(() => updateSlotSelect(block, controls), 500));
    controls.tomorrowButton.addEventListener("click", () => setTimeout(() => updateSlotSelect(block, controls), 500));
    controls.select.addEventListener("change", () => applySelectedSlot(block, controls));

    block.parentNode.insertBefore(wrapper, block);
    block.dataset.libseatSlotEnhanced = "1";

    updateSlotSelect(block, controls);
    applySelectedSlot(block, controls);
    setInterval(() => updateSlotSelect(block, controls), 1200);
  }

  function enhanceTimePickers() {
    document
      .querySelectorAll(".seat-reserve-modal .seat-time-picker .time-block")
      .forEach(enhanceModalTimePicker);

    const blocks = new Set(
      Array.from(document.querySelectorAll(".range-picker.time-block")).filter(
        (block) => !block.closest(".seat-reserve-modal")
      )
    );
    const exactBlock = document.querySelector(RANGE_PICKER_SELECTOR);
    if (exactBlock && exactBlock.classList.contains("range-picker")) blocks.add(exactBlock);
    blocks.forEach(enhanceTimePicker);
  }

  function enhancePage() {
    injectStyle();
    applyPcWideClass();
    installPageBridge();
    applySeatMapScale();
    stabilizeFacilityImages();
    classifySeatMap();
    queueClassifySeatMap();
    replaceSeatLegend();
    enhanceTimePickers();
  }

  function queueEnhancePage() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        enhanceQueued = false;
        enhancePage();
      });
    }, 60);
  }

  function queueSeatMapLayout() {
    if (seatMapLayoutQueued) return;
    seatMapLayoutQueued = true;
    requestAnimationFrame(() => {
      applySeatMapScale();
      document.querySelectorAll(".seatBox-pc, .seatBox").forEach(renderFacilityOverlay);
      requestAnimationFrame(() => {
        seatMapLayoutQueued = false;
        applySeatMapScale();
        document.querySelectorAll(".seatBox-pc, .seatBox").forEach(renderFacilityOverlay);
      });
    });
  }

  injectStyle();
  applyPcWideClass();
  installDebugApi();
  installPageBridge();
  debugStartup();
  preloadFacilityImages();

  document.addEventListener("DOMContentLoaded", () => {
    enhancePage();
  });

  const observer = new MutationObserver(() => {
    queueSeatMapLayout();
    queueEnhancePage();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("resize", queueSeatMapLayout);
  window.setInterval(applySeatMapScale, 1500);
  window.setInterval(classifySeatMap, 1500);
  window.setInterval(stabilizeFacilityImages, 2000);
})();
