// ==UserScript==
// @name         JLU LibSeat PC Wide Layout
// @namespace    local.libseat.pcwide
// @version      1.18.8
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
  const SCRIPT_VERSION = "1.18.8";
  const RESERVE_CONFIG_STORAGE_KEY = "libseatPcWideReserveConfig";
  const DAY_OPEN_TIME = "08:00";
  const DAY_CLOSE_TIME = "22:00";
  const DEFAULT_MIN_RESERVATION_MINUTES = 30;
  const TOMORROW_DEFAULT_AFTER_MINUTES = 21 * 60;
  const RESERVATION_SUBMIT_PATH = "/v1/seat-applications";
  const ACTIVE_RESERVATIONS_PATH = "/v1/users/reservations/active";
  const SEAT_RESERVATIONS_BY_DATE_PREFIX = "/v1/seats";
  const MEETING_ROOM_PATH = "/v1/meeting-room";
  const MEETING_APPLICATION_PATH = "/v1/meeting-applications";
  const USER_DETAIL_PREFIX = "/v1/users";
  const SEAT_RESERVE_ROUTE_PREFIX = "/pages/reserve/seat-reserve/";
  const SEAT_ROOM_ROUTE = "/pages/reserve/seat-reserve/seat-reserve-v2";
  const RESERVE_HOME_ROUTE = "/pages/reserve/reserve";
  const USER_HOME_ROUTE = "/pages/user/user";
  const MEETING_RESERVE_ROUTE = "/pages/reserve/meeting-reserve/meeting-reserve-v2";
  const HOME_TOP_LOGO_URL = "https://lib.jlu.edu.cn/engine2/file/download/bf62f62b55d86111f0083c35b3969617bdc7";
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
  const userDetailCache = new Map();
  let lastReadingRoomLabel = "";
  let replacementIndex = 0;
  let enhanceQueued = false;
  let seatMapLayoutQueued = false;
  let meetingRoomState = null;
  let meetingModalContext = null;
  const RANGE_PICKER_SELECTOR =
    "body > uni-app > uni-page > uni-page-wrapper > uni-page-body > uni-view > uni-view.paging > uni-view > uni-view";
  const REQUEST_TIME_GUARD_SCRIPT_ID = "libseat-pc-wide-request-time-guard";
  const PAGE_BRIDGE_SCRIPT_ID = "libseat-pc-wide-page-bridge";
  const css = `
    @media screen and (min-width: 768px), screen and (hover: hover) and (pointer: fine) {
      :root {
        --h5-shell-width: min(max(98vw, 1024px), 1600px) !important;
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

      .libseat-home-page,
      .libseat-reserve-entry-page,
      .libseat-user-page {
        --h5-shell-width: min(max(90vw, 900px), 1120px) !important;
      }

      .libseat-home-page uni-page-body {
        background: #f5f7fa !important;
      }

      .libseat-home-page .container {
        max-width: 1040px !important;
        min-height: calc(100vh - 64px) !important;
        padding: 24px 32px 40px !important;
        background: #f5f7fa !important;
      }

      .libseat-home-page .top-img {
        display: block !important;
        width: min(100%, 980px) !important;
        height: 150px !important;
        margin: 0 auto !important;
        border-radius: 8px !important;
        background: #0f3f6f !important;
        background-image: url("${HOME_TOP_LOGO_URL}") !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
        background-size: min(68%, 480px) auto !important;
        object-fit: contain !important;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08) !important;
      }

      .libseat-home-page .top-img img {
        object-fit: contain !important;
      }

      .libseat-home-page .top-img > div {
        background-position: center !important;
        background-repeat: no-repeat !important;
        background-size: min(68%, 480px) auto !important;
      }

      .libseat-home-page .message {
        position: relative !important;
        top: auto !important;
        width: min(100%, 980px) !important;
        height: 44px !important;
        margin: 12px auto 0 !important;
        padding: 0 14px !important;
        border: 1px solid #e5e7eb !important;
        border-radius: 8px !important;
        background: #fff !important;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04) !important;
        box-sizing: border-box !important;
      }

      .libseat-home-page .message .message-icon {
        width: 18px !important;
        height: 18px !important;
        margin-left: 0 !important;
      }

      .libseat-home-page .message .message-text,
      .libseat-home-page .message .message-more-text {
        font-size: 13px !important;
        line-height: 20px !important;
      }

      .libseat-home-page .message .message-more .more-icon {
        width: 10px !important;
        height: 10px !important;
      }

      .libseat-home-page .function-list {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 18px !important;
        width: min(100%, 980px) !important;
        margin: 18px auto 0 !important;
        z-index: auto !important;
      }

      .libseat-home-page .function-list .function-item {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        width: auto !important;
        min-height: 250px !important;
        padding: 16px !important;
        border: 1px solid #e5e7eb !important;
        border-radius: 8px !important;
        background: #fff !important;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05) !important;
        box-sizing: border-box !important;
        cursor: pointer !important;
      }

      .libseat-home-page .function-list .function-item:hover {
        border-color: #65cafd !important;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08) !important;
      }

      .libseat-home-page .function-list .function-item-image {
        width: min(100%, 500px) !important;
        height: 300px !important;
        border-radius: 8px !important;
        object-fit: contain !important;
        box-shadow: none !important;
      }

      .libseat-home-page .function-list .function-item-image > div,
      .libseat-home-page .function-list .function-item-image img {
        width: 100% !important;
        height: 100% !important;
        object-fit: contain !important;
        background-size: contain !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }

      .libseat-home-page .function-list .function-item-text {
        margin-top: 14px !important;
        color: #1f2937 !important;
        font-family: "Microsoft YaHei UI", "PingFang SC", "Segoe UI", Arial, sans-serif !important;
        font-size: 18px !important;
        font-weight: 600 !important;
        line-height: 26px !important;
        text-align: center !important;
      }

      .libseat-reserve-entry-page uni-app,
      .libseat-reserve-entry-page uni-page,
      .libseat-reserve-entry-page uni-page-wrapper,
      .libseat-reserve-entry-page uni-page-body,
      .libseat-user-page uni-app,
      .libseat-user-page uni-page,
      .libseat-user-page uni-page-wrapper,
      .libseat-user-page uni-page-body {
        background: #f5f7fa !important;
      }

      .libseat-reserve-entry-page uni-page-body,
      .libseat-user-page uni-page-body {
        background: #f5f7fa !important;
      }

      .libseat-reserve-entry-page .container,
      .libseat-user-page .container {
        max-width: 1040px !important;
        min-height: calc(100vh - 64px) !important;
        padding-left: 28px !important;
        padding-right: 28px !important;
        background: #f5f7fa !important;
      }

      .libseat-user-page uni-page-wrapper::after {
        display: none !important;
        content: none !important;
      }

      .libseat-seat-room-page uni-page-body {
        background: #f5f7fa !important;
      }

      .libseat-seat-room-page .paging.container {
        max-width: 1180px !important;
        margin: 0 auto !important;
        padding: 18px 28px 28px !important;
        background: #f5f7fa !important;
      }

      .libseat-seat-room-page .header {
        width: min(100%, 1120px) !important;
        margin: 0 auto 14px !important;
        padding: 14px 16px !important;
        border: 1px solid #e5e7eb !important;
        border-radius: 8px !important;
        background: #fff !important;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04) !important;
        box-sizing: border-box !important;
      }

      .libseat-seat-room-page .header .title {
        margin-bottom: 10px !important;
        color: #111827 !important;
        font-size: 18px !important;
        font-weight: 700 !important;
        line-height: 26px !important;
      }

      .libseat-seat-room-page .room-page-header {
        margin: 0 !important;
      }

      .libseat-seat-room-page .zp-scroll-view-super {
        width: min(100%, 1120px) !important;
        margin: 0 auto !important;
      }

      .libseat-seat-room-page .reading-room > .list {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 12px !important;
        width: min(100%, 1120px) !important;
        margin: 0 auto !important;
      }

      .libseat-seat-room-page .reading-room-item {
        min-height: 136px !important;
        margin-bottom: 0 !important;
        padding: 14px !important;
        border: 1px solid #e5e7eb !important;
        border-radius: 8px !important;
        background: #fff !important;
        background-image: none !important;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04) !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
      }

      .libseat-seat-room-page .reading-room-item:hover {
        border-color: #65cafd !important;
        box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07) !important;
      }

      .libseat-seat-room-page .reading-room-item__cover {
        width: 76px !important;
        height: 76px !important;
        border-radius: 8px !important;
        object-fit: cover !important;
      }

      .libseat-seat-room-page .reading-room-item__name {
        margin-bottom: 8px !important;
        color: #111827 !important;
        font-size: 17px !important;
        line-height: 24px !important;
      }

      .libseat-seat-room-page .reading-room-item__description {
        margin-bottom: 4px !important;
        color: #475569 !important;
        font-size: 14px !important;
        line-height: 20px !important;
      }

      .libseat-seat-room-page .reading-room-item__status {
        font-size: 14px !important;
        line-height: 28px !important;
      }

      .libseat-seat-room-page .btn {
        display: none !important;
      }

      @media screen and (max-width: 1100px) {
        .libseat-seat-room-page .reading-room > .list {
          grid-template-columns: 1fr !important;
        }
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

      .seatClass-pc.libseat-seat-detail-clickable,
      .seatClass.libseat-seat-detail-clickable,
      .seatClass-pc.libseat-seat-detail-clickable .seat-pc,
      .seatClass.libseat-seat-detail-clickable .seat {
        pointer-events: auto !important;
        cursor: pointer !important;
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

      .libseat-meeting-page .header,
      .libseat-meeting-page .header .title,
      .libseat-meeting-page .header .room-page-header {
        display: none !important;
      }

      .libseat-meeting-page .z-paging-content,
      .libseat-meeting-page .zp-scroll-view-super,
      .libseat-meeting-page uni-scroll-view,
      .libseat-meeting-page .zp-paging-container {
        overflow: auto !important;
        pointer-events: auto !important;
      }

      .libseat-meeting-page .z-paging-load-more,
      .libseat-meeting-page .zp-load-more,
      .libseat-meeting-page [class*="load-more"],
      .libseat-meeting-page [class*="loading-more"] {
        display: none !important;
      }

      .libseat-meeting-custom-active .meeting-room > .list {
        display: none !important;
      }

      .libseat-meeting-query {
        display: grid;
        grid-template-columns: minmax(132px, .8fr) minmax(92px, .52fr) minmax(92px, .52fr) minmax(164px, .9fr) minmax(184px, 1fr) minmax(96px, .56fr) auto;
        align-items: end;
        gap: 8px;
      }

      .libseat-meeting-query .libseat-time-field {
        min-width: 0;
      }

      .libseat-meeting-query input,
      .libseat-meeting-query select {
        width: 100%;
        height: 34px;
        border: 1px solid #d6dde8;
        border-radius: 6px;
        padding: 0 8px;
        box-sizing: border-box;
        background: #fff;
        color: #111827;
        font-size: 13px;
        outline: none;
      }

      .libseat-meeting-query input:focus,
      .libseat-meeting-query select:focus {
        border-color: #65cafd;
        box-shadow: 0 0 0 2px rgba(101, 202, 253, .18);
      }

      .libseat-meeting-toggle-options {
        display: grid;
        gap: 4px;
        height: 34px;
        width: 100%;
        box-sizing: border-box;
      }

      .libseat-meeting-toggle-options.two {
        grid-template-columns: 1fr 1fr;
      }

      .libseat-meeting-toggle-options.four {
        grid-template-columns: repeat(4, 1fr);
      }

      .libseat-meeting-toggle-option {
        width: 100%;
        min-width: 0;
        height: 34px;
        padding: 0 8px;
        border: 1px solid #d6dde8;
        border-radius: 6px;
        background: #fff;
        color: #334155;
        font: inherit;
        font-size: 13px;
        line-height: 1.1;
        white-space: nowrap;
        box-sizing: border-box;
        cursor: pointer;
      }

      .libseat-meeting-toggle-option.active {
        border-color: #65cafd;
        background: #eef9ff;
        color: #075985;
        font-weight: 700;
      }

      .libseat-meeting-room-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 8px;
        padding-bottom: 18px;
      }

      .libseat-meeting-room-card {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        min-height: 0;
        padding: 8px 10px;
        border: 1px solid #e6ebf2;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 4px 14px rgba(31, 41, 55, 0.04);
        box-sizing: border-box;
        color: inherit;
        cursor: pointer;
        font: inherit;
        text-align: left;
        appearance: none;
      }

      .libseat-meeting-room-card:hover {
        border-color: #65cafd;
      }

      .libseat-meeting-room-name {
        margin-bottom: 3px;
        color: #111827;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.25;
      }

      .libseat-meeting-room-meta {
        overflow: hidden;
        color: #475569;
        font-size: 12px;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .libseat-meeting-room-status {
        align-self: start;
        min-width: 52px;
        padding: 0 6px;
        border: 1px solid currentColor;
        border-radius: 6px;
        font-size: 12px;
        line-height: 24px;
        text-align: center;
        white-space: nowrap;
      }

      .libseat-meeting-room-available {
        border-color: #22c55e !important;
        background: #f0fdf4 !important;
      }

      .libseat-meeting-room-available .libseat-meeting-room-status {
        color: #047857;
        background: #dcfce7;
      }

      .libseat-meeting-room-unavailable {
        border-color: #ef4444 !important;
        background: #fef2f2 !important;
      }

      .libseat-meeting-room-unavailable .libseat-meeting-room-status {
        color: #b91c1c;
        background: #fee2e2;
      }

      .libseat-meeting-room-empty {
        padding: 22px 12px;
        border: 1px dashed #cbd5e1;
        border-radius: 8px;
        background: #f8fafc;
        color: #64748b;
        font-size: 14px;
        text-align: center;
      }

      .reserve-modal .e-modal {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: auto !important;
        max-width: none !important;
      }

      .reserve-modal .e-modal-container {
        width: min(960px, 92vw) !important;
        max-width: 92vw !important;
        max-height: 88vh !important;
        margin: auto !important;
        box-sizing: border-box !important;
      }

      .reserve-modal .e-modal uni-scroll-view > div,
      .reserve-modal .e-modal uni-scroll-view > div > div,
      .reserve-modal .e-modal uni-scroll-view > div > div > div {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      .reserve-modal .modal-body {
        display: block !important;
        width: min(900px, calc(92vw - 48px)) !important;
        max-width: 100% !important;
        max-height: 72vh !important;
        overflow: auto !important;
        padding: 18px !important;
        box-sizing: border-box !important;
      }

      .reserve-modal .pick-step {
        display: grid !important;
        grid-template-columns: minmax(250px, .9fr) minmax(320px, 1.1fr);
        grid-template-rows: auto minmax(0, 1fr);
        gap: 14px !important;
        align-items: start !important;
      }

      .reserve-modal .info-section {
        grid-column: 1;
        grid-row: 1 / span 2;
        min-width: 0;
      }

      .reserve-modal .time-section {
        grid-column: 2;
        grid-row: 1;
        min-width: 0;
      }

      .reserve-modal .reservations-section {
        grid-column: 2;
        grid-row: 2;
        min-width: 0;
      }

      .reserve-modal .room-info {
        margin-bottom: 0 !important;
      }

      .reserve-modal .reservations-list {
        max-height: 260px !important;
      }

      .reserve-modal .reservation-item {
        display: grid !important;
        grid-template-columns: minmax(104px, 124px) minmax(0, 1fr) minmax(42px, 56px);
        grid-auto-rows: minmax(0, auto) !important;
        grid-auto-flow: column !important;
        gap: 6px !important;
        align-items: center !important;
        min-height: 38px !important;
        padding: 9px 10px !important;
        border-bottom: 1px solid #e5e7eb !important;
        box-sizing: border-box !important;
        width: 100% !important;
        min-width: 0 !important;
        overflow: hidden !important;
        white-space: nowrap !important;
      }

      .reserve-modal .reservation-item > * {
        min-width: 0 !important;
        max-width: 100% !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        box-sizing: border-box !important;
      }

      .reserve-modal .reservation-time {
        grid-column: 1;
        display: block !important;
        min-width: 0 !important;
        color: #111827 !important;
        font-variant-numeric: tabular-nums;
        white-space: nowrap !important;
        text-align: left !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      .reserve-modal .reservation-user {
        grid-column: 2;
        display: block !important;
        min-width: 0 !important;
        color: #334155 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        overflow-wrap: anywhere !important;
      }

      .reserve-modal .libseat-meeting-reservation-status {
        grid-column: 3;
        display: block !important;
        min-width: 0 !important;
        color: #64748b;
        font-size: 12px;
        white-space: nowrap !important;
        text-align: right;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      .reserve-modal .libseat-meeting-reservation-extra {
        grid-column: 2 / span 2;
        min-width: 0;
        color: #64748b;
        font-size: 12px;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }

      .reserve-modal .libseat-meeting-inline-form {
        grid-column: 1 / span 2;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(240px, .75fr);
        gap: 12px;
        min-width: 0;
        padding: 12px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #f8fafc;
        box-sizing: border-box;
      }

      .reserve-modal .libseat-meeting-inline-main,
      .reserve-modal .libseat-meeting-inline-side {
        display: grid;
        gap: 10px;
        min-width: 0;
      }

      .reserve-modal .libseat-meeting-inline-field label,
      .reserve-modal .libseat-meeting-inline-side-label {
        display: block;
        margin-bottom: 5px;
        color: #334155;
        font-size: 13px;
        font-weight: 700;
      }

      .reserve-modal .libseat-meeting-inline-input,
      .reserve-modal .libseat-meeting-inline-textarea {
        width: 100%;
        border: 1px solid #d6dde8;
        border-radius: 6px;
        background: #fff;
        color: #111827;
        font: inherit;
        font-size: 14px;
        box-sizing: border-box;
        outline: none;
      }

      .reserve-modal .libseat-meeting-inline-input {
        height: 36px;
        padding: 0 10px;
      }

      .reserve-modal .libseat-meeting-inline-textarea {
        display: block;
        min-height: 120px;
        padding: 10px;
        line-height: 1.5;
        resize: vertical;
      }

      .reserve-modal .libseat-meeting-attendee-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: end;
      }

      .reserve-modal .libseat-meeting-inline-button {
        height: 36px;
        border: 1px solid #65cafd;
        border-radius: 6px;
        padding: 0 12px;
        background: #65cafd;
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }

      .reserve-modal .libseat-meeting-inline-submit {
        justify-self: end;
        min-width: 118px;
      }

      .reserve-modal .libseat-meeting-attendee-list {
        display: grid;
        gap: 6px;
        max-height: 126px;
        overflow: auto;
      }

      .reserve-modal .libseat-meeting-attendee-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        min-height: 30px;
        padding: 5px 8px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: #fff;
        color: #334155;
        font-size: 13px;
        box-sizing: border-box;
      }

      .reserve-modal .libseat-meeting-attendee-remove {
        border: 0;
        background: transparent;
        color: #64748b;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
      }

      .reserve-modal .libseat-meeting-inline-status {
        min-height: 18px;
        color: #64748b;
        font-size: 12px;
        line-height: 1.4;
      }

      .reserve-modal .meeting-step,
      .reserve-modal .meeting-form {
        min-height: 0 !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }

      .reserve-modal .meeting-form .form-item {
        margin-bottom: 16px !important;
      }

      .reserve-modal .meeting-form .meeting-input,
      .reserve-modal .meeting-form .meeting-textarea {
        display: block !important;
        position: relative !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }

      .reserve-modal .meeting-form .meeting-textarea,
      .reserve-modal .meeting-form .meeting-textarea textarea {
        min-height: 180px !important;
        height: 180px !important;
      }

      .reserve-modal .meeting-form .meeting-textarea .uni-textarea-wrapper,
      .reserve-modal .meeting-form .meeting-textarea .uni-textarea-textarea {
        display: block !important;
        position: relative !important;
        width: 100% !important;
        min-height: 180px !important;
        height: 180px !important;
        box-sizing: border-box !important;
      }

      .reserve-modal .meeting-form .meeting-textarea .uni-textarea-wrapper {
        overflow: visible !important;
      }

      .reserve-modal .meeting-form .meeting-textarea .uni-textarea-textarea {
        z-index: 2 !important;
        padding: 12px !important;
        border: 0 !important;
        background: transparent !important;
        color: #111827 !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        opacity: 1 !important;
        resize: vertical !important;
      }

      .reserve-modal .meeting-form .meeting-textarea .uni-textarea-placeholder {
        z-index: 1 !important;
        pointer-events: none !important;
        padding: 12px !important;
        color: #9ca3af !important;
        line-height: 1.4 !important;
      }

      .reserve-modal .meeting-form .meeting-textarea .uni-textarea-line,
      .reserve-modal .meeting-form .meeting-textarea .uni-textarea-compute,
      .reserve-modal .meeting-form .meeting-textarea uni-resize-sensor {
        display: none !important;
      }

      .reserve-modal .modal-body > .libseat-meeting-slot-replacement,
      .reserve-modal .meeting-step .libseat-meeting-slot-replacement,
      .reserve-modal .attendee-step .libseat-meeting-slot-replacement,
      .reserve-modal .material-step .libseat-meeting-slot-replacement {
        display: none !important;
      }

      .libseat-meeting-slot-grid {
        display: grid;
        grid-template-columns: minmax(140px, 1fr) minmax(96px, .7fr) minmax(96px, .7fr);
        gap: 8px;
      }

      .seat-reserve-modal .seat-modal-body {
        width: min(720px, 90vw) !important;
      }

      .seat-reserve-modal .seat-info-section {
        display: none !important;
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
        padding: 10px 12px;
        margin-bottom: 10px;
        box-sizing: border-box;
        box-shadow: 0 8px 24px rgba(31, 41, 55, 0.06);
      }

      .libseat-time-replacement-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
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

      .libseat-config-tools {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        min-width: 0;
        color: #7b8794;
        font-size: 12px;
        white-space: nowrap;
      }

      .libseat-config-button {
        height: 28px;
        border: 1px solid #d6dde8;
        border-radius: 6px;
        padding: 0 10px;
        background: #fff;
        color: #334155;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease;
      }

      .libseat-config-button:hover {
        border-color: #65cafd;
        background: #f2fbff;
        color: #075985;
      }

      .libseat-config-status {
        min-width: 84px;
        max-width: 170px;
        overflow: hidden;
        color: #64748b;
        text-overflow: ellipsis;
      }

      .libseat-reserve-stack {
        display: grid;
        gap: 6px;
      }

      .libseat-reserve-row {
        display: grid;
        grid-template-columns:
          64px
          minmax(128px, 0.85fr)
          minmax(112px, 0.62fr)
          minmax(82px, 0.45fr)
          minmax(82px, 0.45fr)
          auto
          minmax(260px, 1.45fr);
        align-items: end;
        gap: 8px;
        min-height: 46px;
        padding: 6px 8px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: #f8fafc;
        box-sizing: border-box;
      }

      .libseat-reserve-manual-row {
        grid-template-columns:
          64px
          minmax(84px, 0.42fr)
          minmax(160px, 0.82fr)
          minmax(82px, 0.45fr)
          minmax(82px, 0.45fr)
          auto
          minmax(240px, 1.2fr);
      }

      .libseat-reserve-auto-row {
        align-items: center;
      }

      .libseat-reserve-row-title {
        align-self: center;
        color: #334155;
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
      }

      .libseat-reserve-submit {
        display: flex;
        align-items: end;
      }

      .libseat-auto-submit {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .libseat-auto-countdown {
        display: none;
        flex: 0 0 auto;
        color: #92400e;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .libseat-auto-countdown.active {
        display: inline-flex;
      }

      .libseat-reserve-spacer {
        min-height: 34px;
      }

      .libseat-auto-button.active {
        border-color: #f59e0b;
        background: #f59e0b;
      }

      .libseat-auto-button.active:hover:not(:disabled) {
        border-color: #d97706;
        background: #d97706;
      }

      .libseat-time-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      .libseat-reserve-row .libseat-time-field {
        flex-direction: row;
        align-items: center;
        gap: 6px;
      }

      .libseat-time-field label {
        color: #475569;
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
      }

      .libseat-reserve-row .libseat-time-field label {
        flex: 0 0 auto;
        white-space: nowrap;
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

      .libseat-reserve-row .libseat-time-field input {
        height: 34px;
        width: 100%;
        padding: 0 8px;
        font-size: 14px;
      }

      .libseat-time-field input:focus {
        border-color: #65cafd;
        box-shadow: 0 0 0 2px rgba(101, 202, 253, 0.18);
      }

      .libseat-time-field input::placeholder {
        color: #a0a8b4;
      }

      .libseat-reserve-button {
        height: 34px;
        min-width: 92px;
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

      .libseat-query-status,
      .libseat-reserve-status,
      .libseat-auto-status {
        min-height: 34px;
        min-width: 0;
        display: flex;
        align-items: center;
        padding: 5px 9px;
        border-radius: 6px;
        box-sizing: border-box;
        background: #fff;
        color: #475569;
        font-size: 13px;
        line-height: 1.35;
        overflow: hidden;
        overflow-wrap: anywhere;
      }

      .libseat-query-status.success,
      .libseat-reserve-status.success,
      .libseat-auto-status.success {
        background: #ecfdf5;
        color: #047857;
      }

      .libseat-query-status.warn,
      .libseat-reserve-status.warn,
      .libseat-auto-status.warn {
        background: #fffbeb;
        color: #92400e;
      }

      .libseat-query-status.error,
      .libseat-reserve-status.error,
      .libseat-auto-status.error {
        background: #fef2f2;
        color: #b91c1c;
      }

      .libseat-query-status {
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .libseat-date-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        min-width: 0;
      }

      .libseat-date-button {
        height: 34px;
        min-width: 0;
        border: 1px solid #d6dde8;
        border-radius: 6px;
        padding: 0 8px;
        background: #fff;
        color: #344054;
        font-size: 13px;
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
        height: 34px;
        min-width: 0;
        width: 100%;
        border: 1px solid #d6dde8;
        border-radius: 6px;
        padding: 0 8px;
        box-sizing: border-box;
        background: #fff;
        color: #111827;
        font-size: 14px;
        font-variant-numeric: tabular-nums;
        outline: none;
      }

      .libseat-slot-select:focus {
        border-color: #65cafd;
        box-shadow: 0 0 0 2px rgba(101, 202, 253, 0.18);
      }

      .libseat-manual-slot-select,
      .libseat-manual-slot-empty {
        max-width: 176px;
      }

      .libseat-slot-empty.libseat-manual-slot-empty {
        white-space: nowrap;
      }

      .libseat-slot-empty {
        height: 34px;
        width: 100%;
        display: flex;
        align-items: center;
        padding: 0 8px;
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

      .libseat-red-seat-modal {
        position: fixed;
        inset: 0;
        z-index: 999999;
        box-sizing: border-box;
      }

      .libseat-red-seat-mask {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.36);
      }

      .libseat-red-seat-sheet {
        position: absolute;
        top: 50%;
        left: 50%;
        bottom: auto;
        width: min(640px, calc(100vw - 40px));
        max-height: min(78vh, 560px);
        overflow: hidden;
        transform: translate(-50%, -50%);
        border-radius: 10px;
        background: #fff;
        box-shadow: 0 16px 48px rgba(15, 23, 42, 0.24);
        box-sizing: border-box;
      }

      .libseat-red-seat-modal .seat-modal-body {
        width: 100% !important;
        max-height: min(78vh, 560px);
        overflow-x: hidden;
        overflow-y: auto;
        box-sizing: border-box;
      }

      .libseat-red-seat-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px 8px;
      }

      .libseat-red-seat-title {
        min-width: 0;
        color: #111827;
        font-size: 17px;
        font-weight: 700;
        line-height: 1.35;
      }

      .libseat-red-seat-subtitle {
        margin-top: 3px;
        color: #64748b;
        font-size: 12px;
        font-weight: 400;
      }

      .libseat-red-seat-close {
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        border: 1px solid #d6dde8;
        border-radius: 16px;
        background: #fff;
        color: #475569;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
      }

      .libseat-red-seat-body {
        padding: 8px 18px 18px;
      }

      .libseat-red-seat-modal .seat-reservations-section {
        margin-top: 0;
      }

      .libseat-red-seat-modal .seat-section-title {
        margin-bottom: 8px;
        color: #334155;
        font-size: 14px;
        font-weight: 700;
      }

      .libseat-red-seat-modal .seat-reservations-list {
        display: grid;
        gap: 8px;
      }

      .libseat-red-seat-modal .seat-reservation-item,
      .libseat-red-seat-empty {
        display: grid;
        grid-template-columns: minmax(92px, 118px) minmax(0, 1fr) minmax(42px, 52px);
        gap: 8px;
        align-items: center;
        min-height: 38px;
        padding: 9px 10px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #f8fafc;
        color: #334155;
        font-size: 13px;
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
      }

      .libseat-red-seat-empty {
        display: flex;
        color: #64748b;
      }

      .libseat-red-seat-modal .seat-reservation-time {
        min-width: 0;
        color: #111827;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .libseat-red-seat-modal .seat-reservation-user {
        min-width: 0;
        color: #334155;
        overflow-wrap: anywhere;
      }

      .libseat-red-seat-modal .seat-reservation-status {
        min-width: 0;
        color: #64748b;
        font-size: 12px;
        white-space: nowrap;
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
    document.documentElement.classList.toggle("libseat-home-page", isHomePage());
    document.documentElement.classList.toggle("libseat-reserve-entry-page", isReserveEntryPage());
    document.documentElement.classList.toggle("libseat-user-page", isUserPage());
    document.documentElement.classList.toggle("libseat-seat-room-page", isSeatRoomSelectPage());
    document.documentElement.classList.toggle("libseat-meeting-page", isMeetingReservePage());
    document.documentElement.classList.toggle("libseat-seat-reserve-page", isSeatReservePage());
  }

  function currentRouteText() {
    return `${window.location.pathname || ""}${window.location.hash || ""}${window.location.search || ""}`;
  }

  function isSeatReservePage() {
    return currentRouteText().includes(SEAT_RESERVE_ROUTE_PREFIX) || !!document.querySelector(".seatBox-pc, .seatBox");
  }

  function isSeatRoomSelectPage() {
    return (
      currentRouteText().includes(SEAT_ROOM_ROUTE) ||
      (!!document.querySelector(".reading-room .list .reading-room-item") && !document.querySelector(".seatBox-pc, .seatBox"))
    );
  }

  function isHomePage() {
    const route = currentRouteText();
    return (
      route === "/" ||
      route.includes("/pages/index/index") ||
      (!!document.querySelector(".top-img") && !!document.querySelector(".function-list"))
    );
  }

  function isReserveEntryPage() {
    return currentRouteText().includes(RESERVE_HOME_ROUTE);
  }

  function isUserPage() {
    return currentRouteText().includes(USER_HOME_ROUTE);
  }

  function isMeetingReservePage() {
    return (
      currentRouteText().includes(MEETING_RESERVE_ROUTE) ||
      (!!document.querySelector(".meeting-room") && !!document.querySelector(".meeting-room-item, .room-page-header"))
    );
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

  function readReserveConfig() {
    try {
      const parsed = parseJsonOrNull(window.localStorage.getItem(RESERVE_CONFIG_STORAGE_KEY));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeReserveConfig(config) {
    try {
      window.localStorage.setItem(RESERVE_CONFIG_STORAGE_KEY, JSON.stringify(config));
      return true;
    } catch (error) {
      return false;
    }
  }

  function reserveConfigDefaults() {
    const today = todayText();
    const defaultEnd = minutesToTime(defaultEndMinutesForDate());
    return {
      manualSeat: "",
      manualStart: minutesToTime(defaultStartMinutesForDate(today)),
      manualEnd: defaultEnd,
      autoSeat: "",
      autoStart: minutesToTime(timeToMinutes(DAY_OPEN_TIME)),
      autoEnd: defaultEnd,
    };
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

  function isDateText(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function isDateTimeText(value) {
    return /^\d{4}-\d{2}-\d{2}\s+([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
  }

  function formatReservationDateTime(date, time) {
    const dateText = String(date || "").trim();
    const timeText = normalizeTimeInputValue(time);
    return isDateText(dateText) && isTimeText(timeText) ? `${dateText} ${timeText}` : "";
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
    }

    return {
      error: seats.length ? `当前地图没有找到座位号 ${raw}` : "还没有读取到当前座位地图",
    };
  }

  function isSeatMapNotReadyError(error) {
    return String(error || "") === "还没有读取到当前座位地图";
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

  function resolveSingleSeatCandidate(value) {
    const raw = String(value || "").trim();
    if (!raw) return { seat: null, error: "请输入座位号" };

    const candidates = parseSeatCandidates(raw);
    if (candidates.length > 1) {
      return { seat: null, error: "手动预约只能填写一个座位号" };
    }

    const seat = resolveSeatForReservation(raw);
    return seat.error ? { seat: null, error: seat.error } : { seat, error: "" };
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
    return resolvedSeats.length > 1 ? `${first}；共 ${resolvedSeats.length} 个候选，并发尝试` : first;
  }

  function currentReservationRule() {
    const box = document.querySelector(".seatBox-pc, .seatBox");
    const snapshot = box ? pageSeatListSnapshot(box) : null;
    return snapshot && snapshot.rule ? snapshot.rule : null;
  }

  function reservationRangeFromControls(block, controls, dateOverride, options) {
    const pickerValue = currentRangePickerValue(block);
    const date = String(dateOverride || controls.date || pickerValue.date || "").trim();
    const startFallback = controls.fallbackToPicker ? pickerValue.startTime : "";
    const endFallback = controls.fallbackToPicker ? pickerValue.endTime : "";
    const normalizeOptions = { completeOnly: !!(options && options.completeOnly) };
    const startTime = normalizeTimeInputValue(controls.start.value || startFallback || "", normalizeOptions);
    const endTime = normalizeTimeInputValue(controls.end.value || endFallback || "", normalizeOptions);
    const writeBack = !(options && options.writeBack === false);

    if (!isDateText(date)) return { error: "日期格式不正确" };
    if (!isTimeText(startTime) || !isTimeText(endTime)) return { error: "时间格式不正确" };

    if (writeBack) {
      controls.start.value = startTime;
      controls.end.value = endTime;
    }

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
    if (!isDateTimeText(startTime)) {
      return {
        ok: false,
        status: null,
        bodyText: "",
        data: null,
        error: `开始时间格式不正确：${String(startTime)}`,
      };
    }
    if (!isDateTimeText(endTime)) {
      return {
        ok: false,
        status: null,
        bodyText: "",
        data: null,
        error: `结束时间格式不正确：${String(endTime)}`,
      };
    }

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

  function meetingRoomPagePath(params) {
    const search = new URLSearchParams();
    Object.keys(params || {}).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null) return;
      search.set(key, value);
    });
    return `${MEETING_ROOM_PATH}?${search.toString()}`;
  }

  async function fetchMeetingRoomsDirect(range) {
    const result = await fetchReservationJson(
      meetingRoomPagePath({
        limit: 500,
        offset: 0,
        startTime: range.startDateTime,
        endTime: range.endDateTime,
        parentIdPath: "",
      }),
      {
        method: "GET",
        headers: reservationHeaders(false),
        timeoutMs: 10000,
      }
    );

    if (!result.ok || !result.data || typeof result.data !== "object") return [];
    return Array.isArray(result.data.list) ? result.data.list : [];
  }

  function meetingRoomReservationsByDatePath(roomId, date) {
    return `${MEETING_ROOM_PATH}/${encodeURIComponent(roomId)}/reservations/by-date?date=${encodeURIComponent(date)}`;
  }

  async function fetchMeetingRoomReservationsByDate(roomId, date) {
    return fetchReservationJson(meetingRoomReservationsByDatePath(roomId, date), {
      method: "GET",
      headers: reservationHeaders(false),
      timeoutMs: 8000,
    });
  }

  function meetingUserFreePath(code, range) {
    const search = new URLSearchParams({
      startTime: range.startDateTime,
      endTime: range.endDateTime,
    });
    return `${USER_DETAIL_PREFIX}/${encodeURIComponent(code)}/free?${search.toString()}`;
  }

  async function fetchMeetingFreeUser(code, range) {
    return fetchReservationJson(meetingUserFreePath(code, range), {
      method: "GET",
      headers: reservationHeaders(false),
      timeoutMs: 8000,
    });
  }

  async function submitMeetingApplication(payload) {
    return fetchReservationJson(MEETING_APPLICATION_PATH, {
      method: "POST",
      headers: reservationHeaders(true),
      body: JSON.stringify(payload),
      timeoutMs: 10000,
    });
  }

  function userDetailPath(userId) {
    return `${USER_DETAIL_PREFIX}/${encodeURIComponent(userId)}/detail`;
  }

  function fetchUserDetail(userId) {
    const key = String(userId || "").trim();
    if (!/^\d+$/.test(key)) return Promise.resolve(null);
    if (userDetailCache.has(key)) return userDetailCache.get(key);

    const request = fetchReservationJson(userDetailPath(key), {
      method: "GET",
      headers: reservationHeaders(false),
      timeoutMs: 8000,
    }).then((result) => {
      if (!result.ok || !result.data || typeof result.data !== "object") {
        userDetailCache.delete(key);
        return null;
      }
      return result.data;
    });

    userDetailCache.set(key, request);
    return request;
  }

  function reservationUserId(reservation) {
    if (!reservation || typeof reservation !== "object") return "";
    const candidates = [
      reservation.userId,
      reservation.userID,
      reservation.creatorId,
      reservation.createUserId,
      reservation.ownerId,
      reservation.applicantId,
      reservation.user && typeof reservation.user === "object" ? reservation.user.id : null,
      reservation.user && typeof reservation.user === "object" ? reservation.user.userId : null,
      reservation.creator && typeof reservation.creator === "object" ? reservation.creator.id : null,
      reservation.applicant && typeof reservation.applicant === "object" ? reservation.applicant.id : null,
    ];
    const value = candidates.find((candidate) => candidate !== null && candidate !== undefined && candidate !== "");
    return value === undefined ? "" : String(value);
  }

  function reservationUserDetailText(detail, fallback) {
    if (!detail || typeof detail !== "object") return fallback;
    const nickname = cleanReservationText(detail.nickname || detail.name || detail.realName);
    const code = cleanReservationText(detail.code || detail.studentCode || detail.username);
    return [nickname, code].filter(Boolean).join(" ") || fallback;
  }

  function reservationStatusText(status) {
    const raw = cleanReservationText(status);
    const normalized = raw.toUpperCase().replace(/[_-]+/g, " ");
    if (normalized === "IN USE") return "使用中";
    if (normalized === "TEMPORARY LEAVE") return "暂离";
    if (normalized === "RESERVED") return "已预约";
    return raw;
  }

  function reservationTimeText(reservation) {
    if (!reservation || typeof reservation !== "object") return "";

    const raw = cleanReservationText(reservation.time || "");
    const times = raw.match(/\d{2}:\d{2}/g);
    if (times && times.length >= 2) return `${times[0]}-${times[times.length - 1]}`;

    const start = String(reservation.startTime || "").match(/(\d{2}:\d{2})/);
    const end = String(reservation.endTime || "").match(/(\d{2}:\d{2})/);
    if (start && end) return `${start[1]}-${end[1]}`;

    return raw;
  }

  function reservationUserFallback(reservation) {
    if (!reservation || typeof reservation !== "object") return "";
    const user = reservation.user;
    const creator = reservation.creator || reservation.applicant;
    if (typeof user === "string") return cleanReservationText(user);
    if (user && typeof user === "object") {
      return cleanReservationText([user.nickname || user.name || user.realName, user.code || user.studentCode || user.username].filter(Boolean).join(" "));
    }
    if (creator && typeof creator === "object") {
      return cleanReservationText([creator.nickname || creator.name || creator.realName, creator.code || creator.studentCode || creator.username].filter(Boolean).join(" "));
    }
    return cleanReservationText(
      reservation.userName ||
        reservation.nickname ||
        reservation.realName ||
        reservation.creatorName ||
        reservation.applicantName ||
        ""
    );
  }

  function meetingReservationExtraText(reservation) {
    if (!reservation || typeof reservation !== "object") return "";
    const title = cleanReservationText(reservation.meetingTitle || reservation.title || reservation.theme || reservation.subject);
    const content = cleanReservationText(reservation.meetingContent || reservation.content || reservation.description);
    const attendees = Array.isArray(reservation.attendees)
      ? reservation.attendees
          .map((item) => (typeof item === "string" ? item : item && (item.nickname || item.name || item.realName || item.code)))
          .filter(Boolean)
          .join("、")
      : "";
    const parts = [];
    if (title) parts.push(`主题：${title}`);
    if (content) parts.push(`内容：${content}`);
    if (attendees) parts.push(`参会：${attendees}`);
    return parts.join(" / ");
  }

  function reservationIdentityKey(reservation) {
    if (!reservation || typeof reservation !== "object") return "";
    return [
      reservation.reservationId || reservation.id || "",
      reservation.userId || "",
      cleanReservationText(reservation.time || ""),
      cleanReservationText(reservation.startTime || ""),
      cleanReservationText(reservation.endTime || ""),
      cleanReservationText(reservation.status || ""),
    ].join("|");
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

  function installRequestTimeGuard() {
    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    if (
      pageWindow.__libseatPcWideRequestGuard &&
      pageWindow.__libseatPcWideRequestGuard.version === SCRIPT_VERSION
    ) {
      return;
    }

    const script = document.createElement("script");
    script.id = REQUEST_TIME_GUARD_SCRIPT_ID;
    script.textContent = `
      (function () {
        if (window.__libseatPcWideRequestGuard && window.__libseatPcWideRequestGuard.version === "${SCRIPT_VERSION}") return;

        var BAD_TIME_RE = /(?:^|\\s)(undefined|null|nan|invalid\\s*date)\\s*$/i;
        var DATE_RE = /(\\d{4}-\\d{2}-\\d{2})/;
        var TIME_AT_END_RE = /(?:^|\\s)([01]\\d|2[0-3]):[0-5]\\d$/;

        function dateFrom(value, fallbackDate) {
          var match = String(value == null ? "" : value).match(DATE_RE);
          if (match) return match[1];
          return DATE_RE.test(String(fallbackDate || "")) ? String(fallbackDate).match(DATE_RE)[1] : "";
        }

        function isBrokenDateTime(value) {
          var text = String(value == null ? "" : value).trim();
          if (!text) return true;
          if (BAD_TIME_RE.test(text)) return true;
          return DATE_RE.test(text) && !TIME_AT_END_RE.test(text);
        }

        function fallbackTime(field) {
          return String(field || "").toLowerCase() === "endtime" ? "22:00" : "08:00";
        }

        function fixedDateTime(value, field, fallbackDate) {
          if (!isBrokenDateTime(value)) return value;
          var date = dateFrom(value, fallbackDate);
          return date ? date + " " + fallbackTime(field) : value;
        }

        function objectFallbackDate(object) {
          if (!object || typeof object !== "object") return "";
          var candidates = [
            object.date,
            object.reserveDate,
            object.reservationDate,
            object.startDate,
            object.endDate,
            object.startTime,
            object.endTime
          ];
          for (var i = 0; i < candidates.length; i += 1) {
            var date = dateFrom(candidates[i], "");
            if (date) return date;
          }
          return "";
        }

        function sanitizeObject(object, depth) {
          if (!object || typeof object !== "object" || depth > 4) return false;
          var changed = false;
          var fallbackDate = objectFallbackDate(object);

          Object.keys(object).forEach(function (key) {
            var value = object[key];
            var lower = String(key).toLowerCase();
            if (lower === "starttime" || lower === "endtime") {
              var fixed = fixedDateTime(value, lower, fallbackDate);
              if (fixed !== value) {
                object[key] = fixed;
                changed = true;
              }
              return;
            }
            if (value && typeof value === "object") {
              changed = sanitizeObject(value, depth + 1) || changed;
            }
          });

          return changed;
        }

        function sanitizeSearchParams(params) {
          var changed = false;
          var fallbackDate =
            dateFrom(params.get("date"), "") ||
            dateFrom(params.get("reserveDate"), "") ||
            dateFrom(params.get("reservationDate"), "") ||
            dateFrom(params.get("startTime"), "") ||
            dateFrom(params.get("endTime"), "");

          ["startTime", "endTime"].forEach(function (key) {
            if (!params.has(key)) return;
            var value = params.get(key);
            var fixed = fixedDateTime(value, key, fallbackDate);
            if (fixed !== value) {
              params.set(key, fixed);
              changed = true;
            }
          });

          return changed;
        }

        function sanitizeUrl(input) {
          if (input == null) return input;
          var raw = String(input);
          try {
            var url = new URL(raw, window.location.href);
            return sanitizeSearchParams(url.searchParams) ? url.toString() : input;
          } catch (error) {
            return input;
          }
        }

        function sanitizedBody(body) {
          if (body == null) return { body: body, changed: false };

          if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
            var nextParams = new URLSearchParams(body.toString());
            return sanitizeSearchParams(nextParams)
              ? { body: nextParams, changed: true }
              : { body: body, changed: false };
          }

          if (typeof FormData !== "undefined" && body instanceof FormData) {
            var nextForm = null;
            ["startTime", "endTime"].forEach(function (key) {
              if (!body.has(key)) return;
              var value = body.get(key);
              var fixed = fixedDateTime(value, key, dateFrom(body.get("date"), "") || dateFrom(value, ""));
              if (fixed === value) return;
              if (!nextForm) nextForm = new FormData(body);
              nextForm.set(key, fixed);
            });
            return nextForm ? { body: nextForm, changed: true } : { body: body, changed: false };
          }

          if (typeof body !== "string") return { body: body, changed: false };

          try {
            var parsed = JSON.parse(body);
            if (sanitizeObject(parsed, 0)) {
              return { body: JSON.stringify(parsed), changed: true };
            }
          } catch (error) {}

          try {
            var params = new URLSearchParams(body);
            if (sanitizeSearchParams(params)) {
              return { body: params.toString(), changed: true };
            }
          } catch (error) {}

          return { body: body, changed: false };
        }

        var nativeFetch = window.fetch;
        if (typeof nativeFetch === "function" && !nativeFetch.__libseatPcWideGuarded) {
          var guardedFetch = function (input, init) {
            var nextInput = input;
            var nextInit = init;

            try {
              if (typeof input === "string" || input instanceof URL) {
                nextInput = sanitizeUrl(input);
              }

              if (init && Object.prototype.hasOwnProperty.call(init, "body")) {
                var fixedBody = sanitizedBody(init.body);
                if (fixedBody.changed) {
                  nextInit = Object.assign({}, init, { body: fixedBody.body });
                }
              }
            } catch (error) {}

            return nativeFetch.call(this, nextInput, nextInit);
          };
          guardedFetch.__libseatPcWideGuarded = true;
          window.fetch = guardedFetch;
        }

        if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
          var proto = window.XMLHttpRequest.prototype;
          var nativeOpen = proto.open;
          var nativeSend = proto.send;

          if (typeof nativeOpen === "function" && !nativeOpen.__libseatPcWideGuarded) {
            proto.open = function (method, url) {
              if (arguments.length >= 2) {
                arguments[1] = sanitizeUrl(url);
              }
              return nativeOpen.apply(this, arguments);
            };
            proto.open.__libseatPcWideGuarded = true;
          }

          if (typeof nativeSend === "function" && !nativeSend.__libseatPcWideGuarded) {
            proto.send = function (body) {
              if (arguments.length >= 1) {
                var fixedBody = sanitizedBody(body);
                if (fixedBody.changed) arguments[0] = fixedBody.body;
              }
              return nativeSend.apply(this, arguments);
            };
            proto.send.__libseatPcWideGuarded = true;
          }
        }

        window.__libseatPcWideRequestGuard = { version: "${SCRIPT_VERSION}" };
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
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

        function walkVue(root, visitor) {
          var node = root;
          while (node) {
            var vm = node.__vue__;
            while (vm) {
              if (visitor(vm)) return vm;
              vm = vm.$parent;
            }
            node = node.parentElement;
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
          return Object.assign({}, rule, {
            minDurationMinutes: rule.minDurationMinutes,
            maxDurationMinutes: rule.maxDurationMinutes,
            minAttendees: rule.minAttendees,
            maxAttendees: rule.maxAttendees,
            needApproval: rule.needApproval,
            needMaterial: rule.needMaterial,
            availableStartTime: rule.availableStartTime,
            availableEndTime: rule.availableEndTime
          });
        }

        function copyMeetingRoom(room) {
          if (!room) return null;
          return Object.assign({}, room, { rule: copyRule(room.rule) });
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

        function isMeetingReserveVm(vm) {
          return !!(
            vm &&
            Array.isArray(vm.dataList) &&
            vm.timeRange &&
            typeof vm.queryList === "function" &&
            typeof vm.chooseRoom === "function" &&
            Object.prototype.hasOwnProperty.call(vm, "visible")
          );
        }

        function findMeetingPageVm(root) {
          var found = walkVue(root || document.body, isMeetingReserveVm);
          if (found) return found;

          var stack = [root || document.body];
          while (stack.length) {
            var node = stack.shift();
            if (!node) continue;
            found = walkVue(node, isMeetingReserveVm);
            if (found) return found;
            var children = node.children || [];
            for (var i = 0; i < children.length; i += 1) {
              stack.push(children[i]);
            }
          }
          return null;
        }

        function meetingSnapshot(root) {
          var vm = findMeetingPageVm(root || document.body);
          if (!vm) return null;
          return {
            parentIdPath: vm.parentIdPath || "",
            timeRange: vm.timeRange ? {
              date: vm.timeRange.date,
              startTime: vm.timeRange.startTime,
              endTime: vm.timeRange.endTime
            } : null,
            rooms: Array.isArray(vm.dataList) ? vm.dataList.map(copyMeetingRoom) : []
          };
        }

        function collectMeetingRooms(range, pageSize) {
          var vm = findMeetingPageVm(document.body);
          if (!vm || typeof vm.queryList !== "function") return Promise.resolve(null);

          var paging = vm.$refs && vm.$refs.paging;
          var nativeComplete = paging && paging.complete;
          var nativeCompleteByNoMore = paging && paging.completeByNoMore;
          var nativeCompleteByTotal = paging && paging.completeByTotal;
          var nativeSetLocalPaging = paging && paging.setLocalPaging;
          var rooms = [];
          var seen = {};
          var roomById = {};
          var size = Math.max(Number(pageSize) || 10, 1);
          var pageNo = 1;
          var safety = 0;

          function append(list) {
            if (!Array.isArray(list)) return 0;
            var added = 0;
            for (var i = 0; i < list.length; i += 1) {
              var room = list[i];
              var key = String(room && room.id);
              if (seen[key]) continue;
              seen[key] = true;
              roomById[key] = room;
              rooms.push(room);
              added += 1;
            }
            return added;
          }

          function replacePagingComplete() {
            if (!paging) return;
            paging.complete = function (list) { append(list); };
            paging.completeByNoMore = function (list) { append(list); };
            paging.completeByTotal = function (list) { append(list); };
            paging.setLocalPaging = function (list) { append(list); };
          }

          function restorePagingComplete() {
            if (!paging) return;
            if (typeof nativeComplete === "function") paging.complete = nativeComplete;
            if (typeof nativeCompleteByNoMore === "function") paging.completeByNoMore = nativeCompleteByNoMore;
            if (typeof nativeCompleteByTotal === "function") paging.completeByTotal = nativeCompleteByTotal;
            if (typeof nativeSetLocalPaging === "function") paging.setLocalPaging = nativeSetLocalPaging;
          }

          if (vm.timeRange && range) {
            setReactive(vm, "timeRange", Object.assign({}, vm.timeRange, {
              date: range.date,
              startTime: range.startTime,
              endTime: range.endTime
            }));
          }
          if (Object.prototype.hasOwnProperty.call(vm, "parentIdPath")) setReactive(vm, "parentIdPath", null);
          replacePagingComplete();

          return new Promise(function (resolve) {
            function finish() {
              restorePagingComplete();
              setReactive(vm, "__libseatPcWideMeetingRoomById", roomById);
              setReactive(vm, "__libseatPcWideMeetingRooms", rooms.slice());
              resolve({
                rooms: rooms.map(copyMeetingRoom),
                timeRange: range || null
              });
            }

            function next() {
              var before = rooms.length;
              safety += 1;
              if (safety > 120) {
                finish();
                return;
              }

              Promise.resolve(vm.queryList(pageNo, size)).then(function () {
                var added = rooms.length - before;
                if (added < size) {
                  finish();
                  return;
                }
                pageNo += 1;
                next();
              }).catch(function () {
                finish();
              });
            }

            next();
          });
        }

        function openMeetingRoom(rooms, index, timeRange) {
          var vm = findMeetingPageVm(document.body);
          if (!vm || !Array.isArray(rooms)) return false;
          var targetIndex = Number(index);
          if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= rooms.length) return false;
          var selected = rooms[targetIndex];
          var roomById = vm.__libseatPcWideMeetingRoomById || {};
          var selectedId = String(selected && selected.id);
          var rawRooms = Array.isArray(vm.__libseatPcWideMeetingRooms) ? vm.__libseatPcWideMeetingRooms : [];
          var list = [];
          var resolvedIndex = -1;

          if (rawRooms.length) {
            for (var rawIndex = 0; rawIndex < rawRooms.length; rawIndex += 1) {
              list.push(rawRooms[rawIndex]);
              if (String(rawRooms[rawIndex] && rawRooms[rawIndex].id) === selectedId) resolvedIndex = rawIndex;
            }
          }

          if (!list.length || resolvedIndex < 0) {
            list = [];
            for (var roomIndex = 0; roomIndex < rooms.length; roomIndex += 1) {
              var room = rooms[roomIndex];
              var original = roomById[String(room && room.id)] || room;
              list.push(original);
              if (String(original && original.id) === selectedId) resolvedIndex = roomIndex;
            }
          }

          if (resolvedIndex < 0) resolvedIndex = targetIndex;
          setReactive(vm, "dataList", list);
          if (vm.timeRange && timeRange) {
            setReactive(vm, "timeRange", Object.assign({}, vm.timeRange, timeRange));
          }
          if (Object.prototype.hasOwnProperty.call(vm, "chooseIndex")) setReactive(vm, "chooseIndex", resolvedIndex);
          if (typeof vm.$forceUpdate === "function") vm.$forceUpdate();

          function show() {
            setReactive(vm, "dataList", list);
            setReactive(vm, "chooseIndex", resolvedIndex);
            try {
              vm.chooseRoom(resolvedIndex);
            } catch (error) {
              setReactive(vm, "visible", true);
            }
            setReactive(vm, "visible", true);
            if (typeof vm.$forceUpdate === "function") vm.$forceUpdate();
          }

          show();
          if (typeof vm.$nextTick === "function") {
            vm.$nextTick(function () {
              setTimeout(show, 0);
            });
          } else {
            setTimeout(show, 0);
          }
          setTimeout(show, 80);
          return true;
        }

        function callSeatOpenMethod(vm, seat) {
          if (!vm || !seat) return false;
          var names = [
            "selectSeat",
            "chooseSeat",
            "clickSeat",
            "seatClick",
            "handleSeatClick",
            "onSeatClick",
            "showSeat",
            "showSeatDetail",
            "openSeatDetail",
            "openSeat",
            "handleSelectSeat",
            "onSelectSeat"
          ];
          for (var i = 0; i < names.length; i += 1) {
            var fn = vm[names[i]];
            if (typeof fn !== "function") continue;
            try {
              fn.call(vm, seat);
              return true;
            } catch (error) {}
          }
          return false;
        }

        function setReactive(vm, key, value) {
          if (!vm) return false;
          try {
            if (typeof vm.$set === "function") {
              vm.$set(vm, key, value);
            } else {
              vm[key] = value;
            }
            return true;
          } catch (error) {
            return false;
          }
        }

        function assignIfPresent(vm, names, value) {
          var changed = false;
          for (var i = 0; i < names.length; i += 1) {
            if (Object.prototype.hasOwnProperty.call(vm, names[i])) {
              changed = setReactive(vm, names[i], value) || changed;
            }
          }
          return changed;
        }

        function refreshSeatReservations(target) {
          if (!target) return false;
          if (typeof target.getSeatReservations === "function") {
            setTimeout(function () {
              try {
                target.getSeatReservations();
              } catch (error) {}
            }, 0);
            return true;
          }
          return false;
        }

        function openSeatDetail(root, seatId) {
          var vm = findSeatListVm(root);
          if (!vm || !Array.isArray(vm.seatList)) return false;
          var seat = null;
          for (var i = 0; i < vm.seatList.length; i += 1) {
            if (Number(vm.seatList[i] && vm.seatList[i].id) === Number(seatId)) {
              seat = vm.seatList[i];
              break;
            }
          }
          if (!seat) return false;

          var context = findContextVm(vm) || vm;
          if (callSeatOpenMethod(vm, seat) || callSeatOpenMethod(context, seat)) return true;

          var modalVm = walkVue(document.body, function (candidate) {
            return !!(candidate && candidate.timeRange && (candidate.seat || Array.isArray(candidate.reservations)));
          });

          var changed = false;
          changed = setReactive(context, "selectedSeat", seat) || changed;
          changed = assignIfPresent(context, ["seat", "currentSeat", "activeSeat"], seat) || changed;
          if (modalVm) {
            changed = assignIfPresent(modalVm, ["seat", "selectedSeat", "currentSeat", "activeSeat"], seat) || changed;
            if (context.timeRange && modalVm.timeRange) {
              changed = setReactive(modalVm, "timeRange", Object.assign({}, modalVm.timeRange, context.timeRange)) || changed;
            }
          }

          var visibleNames = [
            "showSeatReserveModal",
            "seatReserveModalVisible",
            "seatReserveVisible",
            "showSeatReserve",
            "showSeatModal",
            "seatModalVisible",
            "reserveModalVisible",
            "showReserveModal"
          ];
          changed = assignIfPresent(context, visibleNames, true) || changed;
          if (modalVm) changed = assignIfPresent(modalVm, visibleNames, true) || changed;
          changed = refreshSeatReservations(modalVm) || refreshSeatReservations(context) || changed;
          if (typeof context.$forceUpdate === "function") context.$forceUpdate();
          if (modalVm && typeof modalVm.$forceUpdate === "function") modalVm.$forceUpdate();
          return changed;
        }

        window.__libseatPcWideBridge = {
          version: "${SCRIPT_VERSION}",
          snapshot: snapshot,
          modalSnapshot: modalSnapshot,
          meetingSnapshot: meetingSnapshot,
          collectMeetingRooms: collectMeetingRooms,
          openMeetingRoom: openMeetingRoom,
          openSeatDetail: openSeatDetail
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

  function completeTimeRangeValue(value, fallbackDate) {
    const rawDate = String((value && value.date) || fallbackDate || "").trim();
    const date = isDateText(rawDate) ? rawDate : defaultDateText();
    const defaultStart = minutesToTime(defaultStartMinutesForDate(date));
    const defaultEnd = minutesToTime(defaultEndMinutesForDate());
    let startTime = normalizeTimeInputValue(value && value.startTime);
    let endTime = normalizeTimeInputValue(value && value.endTime);

    if (!isTimeText(startTime)) startTime = defaultStart;
    if (!isTimeText(endTime)) endTime = defaultEnd;

    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      const closeTime = minutesToTime(defaultEndMinutesForDate());
      if (timeToMinutes(closeTime) > timeToMinutes(startTime)) {
        endTime = closeTime;
      } else {
        startTime = DAY_OPEN_TIME;
        endTime = closeTime;
      }
    }

    return Object.assign({}, value || {}, { date, startTime, endTime });
  }

  function emitRangePickerRange(block, updates, emitDateChange) {
    if (block.dataset.libseatTopReplacement === "1") {
      const owner = findTimeRangeOwnerVm(block);
      const current = owner && owner.timeRange ? owner.timeRange : currentRangePickerValue(block);
      const next = completeTimeRangeValue(Object.assign({}, current, updates), updates && updates.date);
      return updateOwnerTimeRange(block, next, emitDateChange);
    }

    const vm = findRangePickerVm(block);
    if (!vm) return false;

    const next = completeTimeRangeValue(Object.assign({}, vm.value || {}, updates), updates && updates.date);
    vm.$emit("input", next);
    vm.$emit("change", next);
    updateOwnerTimeRange(block, next, emitDateChange);
    if (emitDateChange) vm.$emit("change-date");
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

    const merged = completeTimeRangeValue(Object.assign({}, owner.timeRange, next), next && next.date);
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

  function normalizeDateInputValue(value) {
    const raw = String(value || "").trim();
    if (isDateText(raw)) return raw;

    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) return "";

    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }

  function normalizeTimeInputValue(value, options) {
    const raw = String(value || "").trim();
    if (isTimeText(raw)) return raw;

    const colonMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (colonMatch) {
      const hour = Number(colonMatch[1]);
      const minute = Number(colonMatch[2]);
      if (hour > 23 || minute > 59) return "";
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    const digits = raw.replace(/\D/g, "");
    if (!digits || digits.length > 4) return "";
    if (options && options.completeOnly && digits.length !== 4) return "";

    let hourText = "";
    let minuteText = "";
    if (digits.length <= 2) {
      hourText = digits;
      minuteText = "00";
    } else if (digits.length === 3) {
      hourText = digits.slice(0, 1);
      minuteText = digits.slice(1);
    } else {
      hourText = digits.slice(0, 2);
      minuteText = digits.slice(2);
    }

    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (hour > 23 || minute > 59) return "";

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function normalizeTimeInputWhenComplete(input) {
    const raw = String(input.value || "").trim();
    if (isTimeText(raw)) return;

    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 4) return;

    const normalized = normalizeTimeInputValue(digits);
    if (!normalized) return;
    input.value = normalized;
    try {
      input.setSelectionRange(normalized.length, normalized.length);
    } catch (error) {
      // Some embedded inputs can reject selection updates.
    }
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

  function findMeetingModalVm(block) {
    let node = block;
    while (node) {
      let vm = node.__vue__;
      while (vm) {
        if (Array.isArray(vm.reservations) && vm.timeRange && (vm.room || vm.meetingRoom || vm.currentRoom)) return vm;
        vm = vm.$parent;
      }
      node = node.parentElement;
    }
    return null;
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

  function findSeatRoomPageVm(root) {
    let node = root || document.querySelector(".reading-room");
    while (node) {
      let vm = node.__vue__;
      while (vm) {
        if (
          Array.isArray(vm.dataList) &&
          typeof vm.chooseRoom === "function" &&
          typeof vm.nextStep === "function"
        ) {
          return vm;
        }
        vm = vm.$parent;
      }
      node = node.parentElement;
    }
    return null;
  }

  function openSeatRoomFromCard(card) {
    if (!card || card.dataset.libseatOpening === "1") return false;
    const cards = Array.from(document.querySelectorAll(".reading-room .list .reading-room-item"));
    const index = cards.indexOf(card);
    if (index < 0) return false;

    const vm = findSeatRoomPageVm(card);
    if (!vm || !Array.isArray(vm.dataList) || !vm.dataList[index]) return false;

    card.dataset.libseatOpening = "1";
    try {
      vm.chooseRoom(index);
      if (typeof vm.$set === "function") {
        vm.$set(vm, "chooseIndex", index);
      } else {
        vm.chooseIndex = index;
      }
      if (typeof vm.$forceUpdate === "function") vm.$forceUpdate();
      setTimeout(() => {
        try {
          vm.nextStep();
        } finally {
          delete card.dataset.libseatOpening;
        }
      }, 0);
      return true;
    } catch (error) {
      delete card.dataset.libseatOpening;
      debugFacilityAssets("seat room direct open failed", { message: error && error.message });
      return false;
    }
  }

  function bindSeatRoomDirectOpen() {
    if (!isSeatRoomSelectPage()) return;
    document.querySelectorAll(".reading-room .list .reading-room-item").forEach((card) => {
      if (card.dataset.libseatDirectOpenBound === "1") return;
      card.dataset.libseatDirectOpenBound = "1";
      card.setAttribute("title", "点击进入选座");
      card.addEventListener(
        "click",
        (event) => {
          if (event.cancelable) event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
          openSeatRoomFromCard(card);
        },
        true
      );
    });
  }

  function updateHomeTopLogo() {
    if (!isHomePage()) return;
    document.querySelectorAll(".top-img").forEach((image) => {
      image.dataset.libseatHomeLogo = "1";
      image.setAttribute("src", HOME_TOP_LOGO_URL);
      image.querySelectorAll("img").forEach((img) => {
        img.src = HOME_TOP_LOGO_URL;
        img.removeAttribute("srcset");
      });
      image.querySelectorAll("div").forEach((node) => {
        if (node.style && node.style.backgroundImage) {
          node.style.backgroundImage = `url("${HOME_TOP_LOGO_URL}")`;
        }
      });
    });
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

  function meetingPageSnapshot(root) {
    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const bridge = pageWindow.__libseatPcWideBridge;
    if (!bridge || typeof bridge.meetingSnapshot !== "function") return null;

    try {
      return bridge.meetingSnapshot(root || document.body);
    } catch (error) {
      debugFacilityAssets("meeting bridge snapshot failed", { message: error && error.message });
      return null;
    }
  }

  async function collectMeetingRoomsFromPage(range) {
    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const bridge = pageWindow.__libseatPcWideBridge;
    if (!bridge || typeof bridge.collectMeetingRooms !== "function") return null;

    try {
      return await bridge.collectMeetingRooms(range, 10);
    } catch (error) {
      debugFacilityAssets("meeting bridge collect failed", { message: error && error.message });
      return null;
    }
  }

  function openMeetingRoomFromPage(rooms, index, range) {
    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const bridge = pageWindow.__libseatPcWideBridge;
    if (!bridge || typeof bridge.openMeetingRoom !== "function") return false;
    const targetIndex = Number(index);
    const selected = Array.isArray(rooms) && Number.isFinite(targetIndex) ? rooms[targetIndex] : null;
    if (selected && selected.id) setMeetingModalContext(selected, range);

    try {
      const opened = bridge.openMeetingRoom(rooms, index, range);
      if (opened) {
        clearVisibleMeetingReservations();
        [0, 80, 180].forEach((delay) => {
          setTimeout(() => {
            const modal = document.querySelector(".reserve-modal .e-modal_show");
            if (modal) refreshMeetingModalReservations(modal);
          }, delay);
        });
      }
      return opened;
    } catch (error) {
      debugFacilityAssets("meeting bridge open failed", { message: error && error.message });
      return false;
    }
  }

  function setMeetingModalContext(room, range) {
    meetingModalContext = {
      room,
      range: range ? Object.assign({}, range) : null,
    };
  }

  function modalRoomCandidate(modalVm) {
    return modalVm && (modalVm.room || modalVm.meetingRoom || modalVm.currentRoom);
  }

  function currentMeetingModalRoom(modalVm) {
    const room = modalRoomCandidate(modalVm);
    const contextRoom = meetingModalContext && meetingModalContext.room;
    if (!contextRoom || !contextRoom.id) return room || null;
    return contextRoom;
  }

  function currentMeetingModalRangeValue(modalVm) {
    return (modalVm && modalVm.timeRange) || (meetingModalContext && meetingModalContext.range) || {};
  }

  function clearVisibleMeetingReservations() {
    document.querySelectorAll(".reserve-modal .e-modal_show").forEach((modal) => {
      delete modal.dataset.libseatMeetingReservationsKey;
      const modalVm = findMeetingModalVm(modal);
      if (!modalVm) return;
      if (typeof modalVm.$set === "function") {
        modalVm.$set(modalVm, "reservations", []);
      } else {
        modalVm.reservations = [];
      }
      if (typeof modalVm.$forceUpdate === "function") modalVm.$forceUpdate();
    });
  }

  function enhanceReservationUserLabels() {
    document
      .querySelectorAll(".seat-reserve-modal .e-modal_show .seat-reservations-list, .reserve-modal .e-modal_show .reservations-list")
      .forEach((list) => {
        const modalVm = findReservationModalVm(list) || findMeetingModalVm(list);
        if (!modalVm || !Array.isArray(modalVm.reservations)) return;

        const labels = Array.from(list.querySelectorAll(".seat-reservation-user, .reservation-user"));
        labels.forEach((label, index) => {
          const reservation = modalVm.reservations[index];
          const userId = reservationUserId(reservation);
          const fallback = cleanReservationText(label.textContent || reservationUserFallback(reservation) || (reservation && reservation.user));
          if (!userId) {
            if (fallback && label.textContent !== fallback) label.textContent = fallback;
            return;
          }

          const key = String(userId);
          if (label.dataset.libseatUserDetailId === key && label.dataset.libseatUserDetailReady === "1") return;

          label.dataset.libseatUserDetailId = key;
          label.dataset.libseatUserDetailReady = "0";

          fetchUserDetail(key).then((detail) => {
            if (!label.isConnected || label.dataset.libseatUserDetailId !== key) return;

            const text = reservationUserDetailText(detail, fallback);
            if (text) {
              label.textContent = text;
              label.setAttribute("title", text);
            }
            label.dataset.libseatUserDetailReady = detail ? "1" : "";
          });
        });

        if (list.closest(".reserve-modal")) {
          Array.from(list.querySelectorAll(".reservation-item")).forEach((item, index) => {
            const reservation = modalVm.reservations[index];
            if (!reservation) return;
            const reservationKey = reservationIdentityKey(reservation);
            if (item.dataset.libseatMeetingReservationKey === reservationKey) return;
            item.dataset.libseatMeetingReservationKey = reservationKey;
            item.dataset.libseatMeetingReservationEnhanced = "1";

            const timeNode = item.querySelector(".reservation-time");
            const userNode = item.querySelector(".reservation-user");
            if (timeNode) timeNode.textContent = reservationTimeText(reservation) || cleanReservationText(timeNode.textContent);
            if (userNode) userNode.textContent = reservationUserFallback(reservation) || cleanReservationText(userNode.textContent);

            const status = reservationStatusText(reservation.status || reservation.reservationStatus || reservation.state);
            if (status) {
              const statusNode = item.querySelector(".libseat-meeting-reservation-status") || document.createElement("div");
              statusNode.className = "libseat-meeting-reservation-status";
              statusNode.textContent = status;
              if (!statusNode.parentNode) item.appendChild(statusNode);
            }

            const extra = meetingReservationExtraText(reservation);
            const existingExtra = item.querySelector(".libseat-meeting-reservation-extra");
            if (extra) {
              const extraNode = existingExtra || document.createElement("div");
              extraNode.className = "libseat-meeting-reservation-extra";
              extraNode.textContent = extra;
              extraNode.title = extra;
              if (!extraNode.parentNode) item.appendChild(extraNode);
            } else if (existingExtra) {
              existingExtra.remove();
            }
          });
        }
      });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function seatDetailDate() {
    const box = document.querySelector(".seatBox-pc, .seatBox");
    const snapshot = box ? pageSeatListSnapshot(box) : null;
    return (snapshot && snapshot.timeRange && snapshot.timeRange.date) || todayText();
  }

  function clearNativeSeatReservations() {
    const candidates = [
      document.querySelector(".seat-reserve-modal"),
      document.querySelector(".seat-reserve-modal .seat-modal-body"),
      document.querySelector(".seat-reserve-modal .seat-reservations-list"),
    ].filter(Boolean);
    const seen = new Set();

    candidates.forEach((node) => {
      const vm = findReservationModalVm(node);
      if (!vm || seen.has(vm)) return;
      seen.add(vm);

      if (typeof vm.$set === "function") {
        vm.$set(vm, "reservations", []);
      } else {
        vm.reservations = [];
      }
      if (typeof vm.$forceUpdate === "function") vm.$forceUpdate();
    });
  }

  function redSeatTitle(seat) {
    const location = cleanReservationText(seat && seat.parentNamePath);
    const name = cleanReservationText((seat && (seat.displayName || seat.name)) || "");
    return [location, name].filter(Boolean).join(" ") || "座位详情";
  }

  function redSeatReservationRows(reservations) {
    const activeReservations = Array.isArray(reservations)
      ? reservations.filter((item) => item && item.status !== "CANCELLED")
      : [];
    if (!activeReservations.length) {
      return `<div class="libseat-red-seat-empty">当前日期没有预约记录</div>`;
    }

    return activeReservations
      .map((item) => {
        const userId = reservationUserId(item);
        const fallbackUser = cleanReservationText(item.user || "");
        const user = fallbackUser || (userId ? `用户 ${userId}` : "未知用户");
        return `
          <div class="seat-reservation-item">
            <div class="seat-reservation-time">${escapeHtml(reservationTimeText(item))}</div>
            <div class="seat-reservation-user" data-libseat-user-id="${escapeHtml(userId)}">${escapeHtml(user)}</div>
            <div class="seat-reservation-status">${escapeHtml(reservationStatusText(item.status))}</div>
          </div>
        `;
      })
      .join("");
  }

  function hydrateRedSeatReservationUsers(modal) {
    modal.querySelectorAll(".seat-reservation-user[data-libseat-user-id]").forEach((node) => {
      const userId = node.dataset.libseatUserId;
      if (!userId) return;

      const fallback = cleanReservationText(node.textContent);
      fetchUserDetail(userId).then((detail) => {
        if (!node.isConnected) return;
        const text = reservationUserDetailText(detail, fallback);
        if (text) {
          node.textContent = text;
          node.setAttribute("title", text);
        }
      });
    });
  }

  async function showRedSeatReservationModal(seat) {
    const previous = document.querySelector(".libseat-red-seat-modal");
    if (previous) previous.remove();

    const date = seatDetailDate();
    const modal = document.createElement("div");
    modal.className = "seat-reserve-modal libseat-red-seat-modal";
    modal.innerHTML = `
      <div class="libseat-red-seat-mask"></div>
      <div class="e-modal e-modal_show e-modal-action_animation libseat-red-seat-sheet" role="dialog" aria-modal="true">
        <div class="seat-modal-body libseat-red-seat-body">
          <div class="libseat-red-seat-head">
            <div>
              <div class="libseat-red-seat-title">${escapeHtml(redSeatTitle(seat))}</div>
              <div class="libseat-red-seat-subtitle">${escapeHtml(queryDateLabel(date))} 当日预约记录</div>
            </div>
            <button class="libseat-red-seat-close" type="button" aria-label="关闭">×</button>
          </div>
          <div class="seat-reservations-section">
            <div class="seat-section-title">当日预约记录</div>
            <div class="seat-reservations-list">
              <div class="libseat-red-seat-empty">正在读取预约记录</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const close = () => modal.remove();
    modal.querySelector(".libseat-red-seat-mask").addEventListener("click", close);
    modal.querySelector(".libseat-red-seat-close").addEventListener("click", close);
    document.body.appendChild(modal);

    const list = modal.querySelector(".seat-reservations-list");
    const result = await fetchSeatReservationsByDate(seat.id, date);
    if (!modal.isConnected) return;

    if (!result.ok || !Array.isArray(result.data)) {
      list.innerHTML = `<div class="libseat-red-seat-empty">读取失败：${escapeHtml(responseMessage(result))}</div>`;
      return;
    }

    list.innerHTML = redSeatReservationRows(result.data);
    hydrateRedSeatReservationUsers(modal);
  }

  function bindSeatDetailClick(node, seatElement, seat) {
    node.classList.add("libseat-seat-detail-clickable");
    node.dataset.libseatSeatId = String(seat.id);
    if (node.dataset.libseatSeatDetailClickBound === "1") return;

    node.dataset.libseatSeatDetailClickBound = "1";
    node.addEventListener(
      "click",
      (event) => {
        if (node.classList.contains("libseat-facility-class")) return;
        const currentSeatElement = node.querySelector(".seat-pc, .seat") || seatElement;
        if (!currentSeatElement) return;

        clearNativeSeatReservations();
        if (!currentSeatElement.classList.contains("libseat-seat-in-use")) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        showRedSeatReservationModal(seat);
      },
      true
    );
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
        bindSeatDetailClick(node, seatElement, seat);
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
    if (controls.queryStart && controls.queryEnd) {
      syncQueryRefreshStatus(controls);
      updateReserveButtonDetail(block, controls);
      updateAutoReservationDetail(block, controls);
      return;
    }
    const value = currentRangePickerValue(block);
    updateDateButtons(controls, value.date);
    if (value.startTime && controls.start.value !== value.startTime) controls.start.value = value.startTime;
    if (value.endTime && controls.end.value !== value.endTime) controls.end.value = value.endTime;
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

  function bindReserveQueryDateButton(block, controls, button) {
    if (button.dataset.libseatBound) return;
    button.dataset.libseatBound = "1";
    button.addEventListener("click", () => {
      const value = button.dataset.date;
      controls.date = value;
      updateDateButtons(controls, value);
    });
  }

  function bindTimeInput(block, nativeInput, field) {
    if (nativeInput.dataset.libseatBound) return;
    nativeInput.dataset.libseatBound = "1";
    nativeInput.addEventListener("focus", () => {
      const wrapper = nativeInput.closest(".libseat-time-replacement, .libseat-slot-replacement");
      if (wrapper) wrapper.dataset.libseatFocused = "1";
      window.setTimeout(() => nativeInput.select(), 0);
    });
    nativeInput.addEventListener("click", () => {
      nativeInput.select();
    });
    nativeInput.addEventListener("input", () => normalizeTimeInputWhenComplete(nativeInput));
    nativeInput.addEventListener("blur", () => {
      const wrapper = nativeInput.closest(".libseat-time-replacement, .libseat-slot-replacement");
      if (wrapper) wrapper.dataset.libseatFocused = "";
      const value = normalizeTimeInputValue(nativeInput.value);
      if (!value) return;
      nativeInput.value = value;
      emitRangePickerChange(block, field, value);
    });
    nativeInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      nativeInput.blur();
    });
  }

  function bindReserveTimeInput(nativeInput) {
    if (nativeInput.dataset.libseatBound) return;
    nativeInput.dataset.libseatBound = "1";
    nativeInput.addEventListener("focus", () => {
      const wrapper = nativeInput.closest(".libseat-time-replacement");
      if (wrapper) wrapper.dataset.libseatFocused = "1";
      window.setTimeout(() => nativeInput.select(), 0);
    });
    nativeInput.addEventListener("click", () => {
      nativeInput.select();
    });
    nativeInput.addEventListener("input", () => normalizeTimeInputWhenComplete(nativeInput));
    nativeInput.addEventListener("blur", () => {
      const wrapper = nativeInput.closest(".libseat-time-replacement");
      if (wrapper) wrapper.dataset.libseatFocused = "";
      const value = normalizeTimeInputValue(nativeInput.value);
      if (!value) return;
      nativeInput.value = value;
    });
    nativeInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      nativeInput.blur();
    });
  }

  function bindPlainDateInput(nativeInput) {
    if (nativeInput.dataset.libseatBound) return;
    nativeInput.dataset.libseatBound = "1";
    nativeInput.addEventListener("focus", () => {
      const wrapper = nativeInput.closest(".libseat-time-replacement, .libseat-slot-replacement");
      if (wrapper) wrapper.dataset.libseatFocused = "1";
      window.setTimeout(() => nativeInput.select(), 0);
    });
    nativeInput.addEventListener("click", () => {
      nativeInput.select();
    });
    nativeInput.addEventListener("blur", () => {
      const wrapper = nativeInput.closest(".libseat-time-replacement, .libseat-slot-replacement");
      if (wrapper) wrapper.dataset.libseatFocused = "";
      const value = normalizeDateInputValue(nativeInput.value);
      if (value) nativeInput.value = value;
      else if (!String(nativeInput.value || "").trim()) nativeInput.value = todayText();
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

  function setQueryStatus(controls, text, tone) {
    controls.queryStatus.textContent = text;
    controls.queryStatus.title = text;
    controls.queryStatus.classList.remove("success", "warn", "error");
    controls.queryStatus.dataset.libseatTone = tone || "";
    if (tone) controls.queryStatus.classList.add(tone);
  }

  function setAutoStatus(controls, text, tone) {
    controls.autoStatus.textContent = text;
    controls.autoStatus.classList.remove("success", "warn", "error");
    controls.autoStatus.dataset.libseatTone = tone || "";
    if (tone) controls.autoStatus.classList.add(tone);
  }

  function setConfigStatus(controls, text) {
    if (!controls.configStatus) return;
    controls.configStatus.textContent = text;
    controls.configStatus.title = text;
  }

  function reserveConfigFromControls(controls) {
    return {
      manualSeat: String(controls.manualSeat.value || "").trim(),
      manualStart: String(controls.manualStart.value || "").trim(),
      manualEnd: String(controls.manualEnd.value || "").trim(),
      autoSeat: String(controls.autoSeat.value || "").trim(),
      autoStart: String(controls.autoStart.value || "").trim(),
      autoEnd: String(controls.autoEnd.value || "").trim(),
      savedAt: Date.now(),
    };
  }

  function saveReserveConfig(controls) {
    const ok = writeReserveConfig(reserveConfigFromControls(controls));
    setConfigStatus(controls, ok ? "常用配置已保存" : "保存失败");
  }

  function clearReserveConfig(block, controls) {
    let cleared = false;
    try {
      window.localStorage.removeItem(RESERVE_CONFIG_STORAGE_KEY);
      cleared = true;
    } catch (error) {
      cleared = false;
    }

    const defaults = reserveConfigDefaults();
    if (!controls.autoEnabled && !controls.busy) {
      controls.manualSeat.value = defaults.manualSeat;
      controls.manualStart.value = defaults.manualStart;
      controls.manualEnd.value = defaults.manualEnd;
      controls.autoSeat.value = defaults.autoSeat;
      controls.autoStart.value = defaults.autoStart;
      controls.autoEnd.value = defaults.autoEnd;
      controls.manualTimeManuallyEdited = false;
      controls.manualSlotSeatId = null;
      controls.manualSlotSelect.value = "";
      controls.manualSlotSelect.innerHTML = "";
      window.clearTimeout(controls.manualSlotUpdateTimer);
      controls.manualSlotUpdateTimer = null;
      setManualSlotEmpty(controls, "输入座位号后读取时间段", false);
      updateReserveButtonDetail(block, controls, true);
      updateAutoReservationDetail(block, controls, true);
    }

    setConfigStatus(controls, cleared ? "常用配置已清空" : "清空失败");
  }

  function updateAutoButtonState(controls) {
    if (!controls.autoButton) return;
    controls.autoButton.classList.toggle("active", !!controls.autoEnabled);
    controls.autoButton.textContent = controls.autoEnabled
      ? "关闭 21:00 自动预约"
      : "开启 21:00 自动预约次日座位";
  }

  function formatCountdown(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function updateAutoCountdown(controls) {
    if (!controls.autoCountdown || !controls.autoTargetTime || !controls.autoEnabled) return;
    controls.autoCountdown.textContent = `距21:00还有 ${formatCountdown(controls.autoTargetTime.getTime() - Date.now())}`;
    controls.autoCountdown.classList.add("active");
  }

  function stopAutoCountdown(controls) {
    window.clearInterval(controls.autoCountdownTimer);
    controls.autoCountdownTimer = null;
    controls.autoTargetTime = null;
    if (!controls.autoCountdown) return;
    controls.autoCountdown.textContent = "";
    controls.autoCountdown.classList.remove("active");
  }

  function startAutoCountdown(controls, target) {
    window.clearInterval(controls.autoCountdownTimer);
    controls.autoTargetTime = target;
    updateAutoCountdown(controls);
    controls.autoCountdownTimer = window.setInterval(() => updateAutoCountdown(controls), 1000);
  }

  function rangeControls(date, startInput, endInput, fallbackToPicker) {
    return {
      date,
      start: startInput,
      end: endInput,
      fallbackToPicker: !!fallbackToPicker,
    };
  }

  function queryRangeFromControls(block, controls) {
    return reservationRangeFromControls(
      block,
      rangeControls(controls.date, controls.queryStart, controls.queryEnd, true),
      controls.date
    );
  }

  function manualRangeFromControls(block, controls, options) {
    return reservationRangeFromControls(
      block,
      rangeControls(todayText(), controls.manualStart, controls.manualEnd),
      todayText(),
      options
    );
  }

  function autoRangeFromControls(block, controls, submitTime, options) {
    const target = submitTime || nextAutoSubmitDelay().target;
    const reserveDate = autoReservationDateForSubmitTime(target);
    return reservationRangeFromControls(
      block,
      rangeControls(reserveDate, controls.autoStart, controls.autoEnd),
      reserveDate,
      options
    );
  }

  function compactReadingRoomLabel(value) {
    const text = cleanReservationText(value);
    if (!text) return "";

    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && /楼/.test(parts[1])) return `${parts[0]}${parts[1]}`;
    return parts[0] || text;
  }

  function readingRoomLabelFromSnapshot(snapshot) {
    const readingRoom = snapshot && snapshot.readingRoom ? snapshot.readingRoom : {};
    return (
      compactReadingRoomLabel(readingRoom.parentNamePath) ||
      compactReadingRoomLabel(readingRoom.name)
    );
  }

  function currentReadingRoomLabel() {
    const box = document.querySelector(".seatBox-pc, .seatBox");
    const snapshot = box ? pageSeatListSnapshot(box) : null;
    const label = readingRoomLabelFromSnapshot(snapshot);
    if (label) lastReadingRoomLabel = label;
    return lastReadingRoomLabel || "当前阅览室";
  }

  function queryDateLabel(date) {
    const shortDate = String(date || "").slice(5);
    if (date === todayText()) return `今天${shortDate}`;
    if (date === tomorrowText()) return `明天${shortDate}`;
    return String(date || "");
  }

  function queryRefreshStatusText(range) {
    return `${currentReadingRoomLabel()}${range.startTime}-${range.endTime}座位表已刷新(${queryDateLabel(range.date)})`;
  }

  function syncQueryRefreshStatus(controls) {
    if (!controls || !controls.lastQueryRange || controls.queryStatus.dataset.libseatTone !== "success") return;
    controls.queryStatus.textContent = queryRefreshStatusText(controls.lastQueryRange);
  }

  function meetingRangeFromControls(controls) {
    const rawDate = String((controls.dateInput && controls.dateInput.value) || controls.date || todayText()).trim();
    const date = normalizeDateInputValue(rawDate);
    const startTime = normalizeTimeInputValue(controls.queryStart.value || "");
    const endTime = normalizeTimeInputValue(controls.queryEnd.value || "");

    if (!isDateText(date)) return { error: "日期格式不正确" };
    if (!isTimeText(startTime) || !isTimeText(endTime)) return { error: "时间格式不正确" };
    controls.date = date;
    controls.dateInput.value = date;
    controls.queryStart.value = startTime;
    controls.queryEnd.value = endTime;
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) return { error: "结束时间必须晚于开始时间" };

    return {
      date,
      startTime,
      endTime,
      startDateTime: formatReservationDateTime(date, startTime),
      endDateTime: formatReservationDateTime(date, endTime),
    };
  }

  function numericInputValue(input) {
    const text = String((input && input.value) || "").trim();
    if (!text) return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }

  function normalizedRoomStatus(room) {
    return String((room && room.status) || "").trim().toUpperCase().replace(/[-_]+/g, " ");
  }

  function roomRule(room) {
    return (room && room.rule && typeof room.rule === "object" ? room.rule : {}) || {};
  }

  function roomMinAttendees(room) {
    const value = Number(roomRule(room).minAttendees);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function roomCapacity(room) {
    const value = Number(roomRule(room).maxAttendees || (room && room.capacity));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function roomMinDurationMinutes(room) {
    const value = Number(roomRule(room).minDurationMinutes);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MIN_RESERVATION_MINUTES;
  }

  function roomAllowsAttendees(room, attendees) {
    if (attendees === null) return true;
    const capacity = roomCapacity(room);
    const minAttendees = roomMinAttendees(room);
    if (minAttendees > 0 && attendees < minAttendees) return false;
    if (capacity > 0 && attendees > capacity) return false;
    return true;
  }

  function roomAvailableMinutes(room, range) {
    if (!room || room.canReserve === false) return 0;
    const queryStart = timeToMinutes(range && range.startTime);
    const queryEnd = timeToMinutes(range && range.endTime);
    if (queryStart === null || queryEnd === null || queryEnd <= queryStart) return 0;

    if (room.canReserve === true) return Math.max(roomMinDurationMinutes(room), queryEnd - queryStart);

    const status = normalizedRoomStatus(room);
    if (room.canReserve !== true && /CLOSE|CLOSED|DISABLE|DISABLED|UNAVAILABLE/.test(status)) return 0;

    const rule = roomRule(room);
    const roomOpen = timeToMinutes(room.openTime);
    const roomClose = timeToMinutes(room.closeTime);
    const availableStart = timeToMinutes(rule.availableStartTime);
    const availableEnd = timeToMinutes(rule.availableEndTime);
    const start = Math.max(
      queryStart,
      roomOpen === null ? queryStart : roomOpen,
      availableStart === null ? queryStart : availableStart
    );
    const end = Math.min(
      queryEnd,
      roomClose === null ? queryEnd : roomClose,
      availableEnd === null ? queryEnd : availableEnd
    );
    return Math.max(0, end - start);
  }

  function meetingRoomAvailabilityClass(room, range) {
    const minutes = roomAvailableMinutes(room, range);
    if (minutes < roomMinDurationMinutes(room)) return "libseat-meeting-room-unavailable";
    return "libseat-meeting-room-available";
  }

  function meetingRoomFloorText(room) {
    const text = cleanReservationText(room && room.parentNamePath);
    const matches = text.match(/(\d+\s*楼|[一二三四五六七八九十]+楼)/g);
    return matches && matches.length ? matches[matches.length - 1].replace(/\s+/g, "") : text;
  }

  function meetingFilterValues(controls) {
    return {
      statuses: controls.statusButtons
        .filter((button) => button.classList.contains("active"))
        .map((button) => button.dataset.value),
      floors: controls.floorButtons
        .filter((button) => button.classList.contains("active"))
        .map((button) => button.dataset.value),
      attendees: numericInputValue(controls.attendeesInput),
    };
  }

  function toggleMeetingFilterButton(button, controls) {
    button.classList.toggle("active");
    renderMeetingRooms(controls);
  }

  function meetingRoomMatchesFilters(room, range, filters) {
    if (!room) return false;
    const availabilityClass = meetingRoomAvailabilityClass(room, range);
    if (filters.statuses.length) {
      const freeMatched = filters.statuses.includes("FREE") && availabilityClass === "libseat-meeting-room-available";
      const busyMatched = filters.statuses.includes("BUSY") && availabilityClass === "libseat-meeting-room-unavailable";
      if (!freeMatched && !busyMatched) return false;
    }

    if (filters.floors.length) {
      const text = cleanReservationText([meetingRoomFloorText(room), room.parentNamePath].filter(Boolean).join(" "));
      if (!filters.floors.some((floor) => text.includes(floor))) return false;
    }

    return roomAllowsAttendees(room, filters.attendees);
  }

  function meetingRoomStatusLabel(room, range) {
    const minutes = roomAvailableMinutes(room, range);
    if (minutes >= roomMinDurationMinutes(room)) return "空闲";
    const reason = cleanReservationText(room && room.cannotReserveReason);
    if (reason) return reason;
    const label = cleanReservationText(room && room.statusLabel);
    return label && label !== "空闲" ? label : "不可预约";
  }

  function meetingRoomMeta(room) {
    const parts = [];
    const location = cleanReservationText(room && room.parentNamePath);
    const time = cleanReservationText(room && room.time);
    const capacity = roomCapacity(room);
    const minAttendees = roomMinAttendees(room);
    if (location) parts.push(location);
    if (time) parts.push(time);
    if (capacity && minAttendees) {
      parts.push(`${minAttendees}-${capacity}人`);
    } else if (capacity) {
      parts.push(`${capacity}人`);
    } else if (minAttendees) {
      parts.push(`${minAttendees}人起`);
    }
    return parts.join(" / ");
  }

  function renderMeetingRooms(controls) {
    if (!controls || !controls.grid) return;
    const range = controls.lastRange || meetingRangeFromControls(controls);
    const rooms = Array.isArray(controls.allRooms) ? controls.allRooms : [];
    const filters = meetingFilterValues(controls);
    if (range.error) {
      controls.filteredRooms = [];
      controls.grid.innerHTML = `<div class="libseat-meeting-room-empty">${escapeHtml(range.error)}</div>`;
      controls.queryButton.title = range.error;
      return;
    }
    const filtered = rooms.filter((room) => meetingRoomMatchesFilters(room, range, filters));
    controls.filteredRooms = filtered;
    document.documentElement.classList.add("libseat-meeting-custom-active");

    if (!filtered.length) {
      controls.grid.innerHTML = `<div class="libseat-meeting-room-empty">${escapeHtml(rooms.length ? "没有符合条件的研修间" : "正在读取研修间")}</div>`;
      controls.queryButton.title = rooms.length ? "没有符合条件的研修间" : "正在读取研修间";
      return;
    }

    controls.grid.innerHTML = filtered
      .map((room, index) => {
        const availabilityClass = meetingRoomAvailabilityClass(room, range);
        const unavailable = availabilityClass === "libseat-meeting-room-unavailable";
        return `
          <button class="libseat-meeting-room-card ${availabilityClass}${unavailable ? " unavailable" : ""}" type="button" data-index="${index}">
            <span>
              <span class="libseat-meeting-room-name">${escapeHtml(room.name || "研修间")}</span>
              <span class="libseat-meeting-room-meta">${escapeHtml(meetingRoomMeta(room))}</span>
            </span>
            <span class="libseat-meeting-room-status">${escapeHtml(meetingRoomStatusLabel(room, range))}</span>
          </button>
        `;
      })
      .join("");

    controls.grid.querySelectorAll(".libseat-meeting-room-card").forEach((card) => {
      let lastOpenAt = 0;
      const openCard = (event) => {
        if (event.type === "mousedown" && event.button !== 0) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        const now = Date.now();
        if (now - lastOpenAt < 250) return;
        lastOpenAt = now;
        const index = Number(card.dataset.index);
        const room = filtered[index];
        if (!room || meetingRoomAvailabilityClass(room, range) === "libseat-meeting-room-unavailable") {
          card.title = cleanReservationText(room && (room.cannotReserveReason || room.statusLabel)) || "当前不可预约";
        }
        openMeetingRoomFromPage(filtered, index, range);
      };
      card.addEventListener("mousedown", openCard);
      card.addEventListener("click", openCard);
    });

    controls.queryButton.title = `显示 ${filtered.length}/${rooms.length} 个研修间`;
  }

  async function refreshMeetingRooms(controls) {
    if (!controls || controls.busy) return false;
    const range = meetingRangeFromControls(controls);
    if (range.error) {
      controls.queryButton.title = range.error;
      controls.lastRange = null;
      controls.filteredRooms = [];
      if (controls.grid) controls.grid.innerHTML = `<div class="libseat-meeting-room-empty">${escapeHtml(range.error)}</div>`;
      return false;
    }

    controls.busy = true;
    controls.queryButton.disabled = true;
    controls.queryButton.textContent = "查询中";

    try {
      const collected = await collectMeetingRoomsFromPage(range);
      let rooms = collected && Array.isArray(collected.rooms) ? collected.rooms : [];
      if (!rooms.length) rooms = await fetchMeetingRoomsDirect(range);
      controls.allRooms = rooms;
      controls.lastRange = range;
      renderMeetingRooms(controls);
      return rooms.length > 0;
    } finally {
      controls.busy = false;
      controls.queryButton.disabled = false;
      controls.queryButton.textContent = "按条件查询";
    }
  }

  function hideMeetingLoadMoreNodes() {
    if (!isMeetingReservePage()) return;
    document.querySelectorAll("uni-view, div, span").forEach((node) => {
      if (node.children.length > 3) return;
      const text = cleanReservationText(node.textContent);
      if (!/^点击加载更多$|^加载更多$|^没有更多了$/.test(text)) return;
      const container =
        node.closest(".z-paging-load-more, .zp-load-more, [class*='load-more'], [class*='loading-more']") ||
        node;
      container.style.setProperty("display", "none", "important");
    });
  }

  function refreshSeatMapFromQuery(block, controls) {
    const range = queryRangeFromControls(block, controls);
    if (range.error) {
      controls.queryButton.title = range.error;
      setQueryStatus(controls, range.error, "error");
      return false;
    }

    const current = currentRangePickerValue(block);
    emitRangePickerRange(
      block,
      { date: range.date, startTime: range.startTime, endTime: range.endTime },
      current.date !== range.date
    );
    controls.queryButton.title = `已刷新：${range.date} ${range.startTime}-${range.endTime}`;
    controls.lastQueryRange = { date: range.date, startTime: range.startTime, endTime: range.endTime };
    setQueryStatus(controls, queryRefreshStatusText(range), "success");
    window.setTimeout(() => syncQueryRefreshStatus(controls), 300);
    window.setTimeout(() => syncQueryRefreshStatus(controls), 1200);
    queueManualSlotUpdate(block, controls, 250);
    return true;
  }

  function updateReserveButtonDetail(block, controls, force) {
    if (controls.busy) return;

    const range = manualRangeFromControls(block, controls, { completeOnly: true, writeBack: false });
    const resolved = resolveSingleSeatCandidate(controls.manualSeat.value);
    const canUpdateStatus = force || !controls.status.dataset.libseatTone;
    if (range.error || !resolved.seat) {
      controls.button.removeAttribute("title");
      controls.button.setAttribute("aria-label", "手动预约");
      if (!canUpdateStatus) return;
      if (range.error) {
        setReserveStatus(controls, range.error, "error");
      } else if (controls.manualSeat.value.trim()) {
        if (isSeatMapNotReadyError(resolved.error)) {
          setReserveStatus(controls, "正在读取当前座位地图", "");
        } else {
          setReserveStatus(controls, resolved.error || "请输入座位号", "error");
        }
      } else {
        setReserveStatus(controls, "输入座位号和开始/结束时间后手动预约今天", "");
      }
      return;
    }

    const detail = reservationDetailText(resolved.seat, range);
    controls.button.title = detail;
    controls.button.setAttribute("aria-label", `手动预约：${detail}`);
    if (canUpdateStatus) {
      setReserveStatus(controls, `将预约：${detail}`, "");
    }
  }

  function setManualSlotEmpty(controls, text, loading) {
    controls.manualSlotSelect.style.display = "none";
    controls.manualSlotEmpty.style.display = "flex";
    controls.manualSlotEmpty.classList.toggle("loading", !!loading);
    controls.manualSlotEmpty.textContent = text;
  }

  function applyManualSlot(block, controls) {
    if (!controls.manualSlotSelect.value) return;

    const [startTime, endTime] = controls.manualSlotSelect.value.split("|");
    controls.applyingManualSlot = true;
    controls.manualStart.value = startTime;
    controls.manualEnd.value = endTime;
    controls.applyingManualSlot = false;
    updateReserveButtonDetail(block, controls, true);
  }

  function renderManualSlots(block, controls, seat, slots) {
    const previous = controls.manualSlotSelect.value;
    controls.manualSlotSelect.innerHTML = "";

    if (!slots.length) {
      setManualSlotEmpty(controls, `${seat.label} 今天没有可预约时间段`, false);
      return;
    }

    controls.manualSlotSelect.style.display = "";
    controls.manualSlotEmpty.style.display = "none";
    controls.manualSlotEmpty.classList.remove("loading");

    slots.forEach((slot) => {
      const option = document.createElement("option");
      option.value = slotValue(slot);
      option.textContent = `${minutesToTime(slot.start)} - ${minutesToTime(slot.end)}`;
      controls.manualSlotSelect.appendChild(option);
    });

    const selected = Array.from(controls.manualSlotSelect.options).some((option) => option.value === previous)
      ? previous
      : controls.manualSlotSelect.options[0].value;
    controls.manualSlotSelect.value = selected;
    if (
      !controls.manualTimeManuallyEdited &&
      (selected !== previous || controls.manualSlotSeatId !== Number(seat.id))
    ) {
      controls.manualSlotSeatId = Number(seat.id);
      applyManualSlot(block, controls);
    } else {
      controls.manualSlotSeatId = Number(seat.id);
    }
  }

  async function updateManualSlotSelect(block, controls) {
    if (!controls.manualSlotSelect || !controls.manualSlotEmpty) return;

    const requestId = (controls.manualSlotRequestId || 0) + 1;
    controls.manualSlotRequestId = requestId;

    if (!controls.manualSeat.value.trim()) {
      setManualSlotEmpty(controls, "输入座位号后读取时间段", false);
      return;
    }

    const resolved = resolveSingleSeatCandidate(controls.manualSeat.value);
    if (!resolved.seat) {
      if (isSeatMapNotReadyError(resolved.error)) {
        setManualSlotEmpty(controls, "正在读取当前座位地图", true);
        window.setTimeout(() => {
          if (controls.manualSeat && controls.manualSeat.isConnected) updateManualSlotSelect(block, controls);
        }, 700);
      } else {
        setManualSlotEmpty(controls, resolved.error || "请输入座位号", false);
      }
      return;
    }

    const date = todayText();
    const rule = currentReservationRule();
    const optimisticSlots = availableSlotsFromSeat(resolved.seat.seat, date, rule);
    if (optimisticSlots.length) {
      renderManualSlots(block, controls, resolved.seat, optimisticSlots);
    } else {
      setManualSlotEmpty(controls, `正在读取 ${resolved.seat.label} 预约情况`, true);
    }

    const result = await fetchSeatReservationsByDate(resolved.seat.id, date);
    if (controls.manualSlotRequestId !== requestId) return;

    if (!result.ok || !Array.isArray(result.data)) {
      if (!optimisticSlots.length) {
        setManualSlotEmpty(controls, `读取失败：${responseMessage(result)}`, false);
      }
      return;
    }

    renderManualSlots(block, controls, resolved.seat, availableSlots({ reservations: result.data, rule }, date));
  }

  function queueManualSlotUpdate(block, controls, delay) {
    window.clearTimeout(controls.manualSlotUpdateTimer);
    controls.manualSlotUpdateTimer = window.setTimeout(() => updateManualSlotSelect(block, controls), delay);
  }

  function updateAutoReservationDetail(block, controls, force) {
    if (controls.busy || controls.autoEnabled) return;

    const range = autoRangeFromControls(block, controls, null, { completeOnly: true, writeBack: false });
    const resolved = resolveSeatCandidates(controls.autoSeat.value);
    const canUpdateStatus = force || !controls.autoStatus.dataset.libseatTone;
    if (range.error || !resolved.seats.length) {
      controls.autoButton.removeAttribute("title");
      if (!canUpdateStatus) return;
      if (range.error) {
        setAutoStatus(controls, range.error, "error");
      } else if (controls.autoSeat.value.trim()) {
        if (resolved.errors.some(isSeatMapNotReadyError)) {
          setAutoStatus(controls, "正在读取当前座位地图", "");
        } else {
          setAutoStatus(controls, resolved.errors[0] || "请输入座位号", "error");
        }
      } else {
        setAutoStatus(controls, "输入自动预约座位号和开始/结束时间；默认预约次日", "");
      }
      return;
    }

    const detail = reservationCandidatesDetailText(resolved.seats, range);
    controls.autoButton.title = detail;
    if (canUpdateStatus) {
      setAutoStatus(controls, `将自动预约：${detail}`, "");
    }
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

  function submitConcurrentAttempt(resolvedSeats, range) {
    const results = [];
    let remaining = resolvedSeats.length;
    let settled = false;

    return new Promise((resolve) => {
      if (!remaining) {
        resolve({ success: null, results });
        return;
      }

      resolvedSeats.forEach((seat, index) => {
        submitSeatReservation(seat.id, range.startDateTime, range.endDateTime)
          .then((result) => {
            const item = {
              seat,
              index,
              result,
              success: submitResponseSuccess(result, seat.id),
            };
            results[index] = item;

            if (item.success && !settled) {
              settled = true;
              resolve({ success: item, results });
              return;
            }

            remaining -= 1;
            if (!remaining && !settled) {
              settled = true;
              resolve({ success: null, results });
            }
          })
          .catch((error) => {
            results[index] = {
              seat,
              index,
              result: { ok: false, error: String((error && error.message) || error) },
              success: null,
            };

            remaining -= 1;
            if (!remaining && !settled) {
              settled = true;
              resolve({ success: null, results });
            }
          });
      });
    });
  }

  async function submitResolvedSeatsConcurrentlyWithRetries(resolvedSeats, range, onStatus) {
    let lastResult = null;

    for (let attempt = 1; attempt <= DEFAULT_RESERVATION_RETRIES; attempt += 1) {
      onStatus(
        `第 ${attempt}/${DEFAULT_RESERVATION_RETRIES} 次并发提交：共 ${resolvedSeats.length} 个候选`,
        "warn"
      );

      const attemptResult = await submitConcurrentAttempt(resolvedSeats, range);
      const completedResults = attemptResult.results.filter(Boolean);
      lastResult = (completedResults[completedResults.length - 1] || {}).result || lastResult;

      if (attemptResult.success) {
        const { seat, success } = attemptResult.success;
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

      if (attempt < DEFAULT_RESERVATION_RETRIES) {
        await sleepMs(DEFAULT_RESERVATION_RETRY_INTERVAL_MS);
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
    window.clearTimeout(controls.autoTimer);
    controls.autoTimer = null;
    stopAutoCountdown(controls);
    updateAutoButtonState(controls);

    if (!enabled) {
      setAutoStatus(controls, "已关闭 21:00 自动预约", "");
      return;
    }

    const preview = nextAutoSubmitDelay();
    const autoRange = autoRangeFromControls(block, controls, preview.target);
    const resolved = resolveSeatCandidates(controls.autoSeat.value);
    if (autoRange.error) {
      controls.autoEnabled = false;
      updateAutoButtonState(controls);
      stopAutoCountdown(controls);
      setAutoStatus(controls, autoRange.error, "error");
      return;
    }
    if (!resolved.seats.length) {
      controls.autoEnabled = false;
      updateAutoButtonState(controls);
      stopAutoCountdown(controls);
      setAutoStatus(controls, resolved.errors[0] || "请输入座位号", "error");
      return;
    }
    if (!currentAuthorizationHeader()) {
      controls.autoEnabled = false;
      updateAutoButtonState(controls);
      stopAutoCountdown(controls);
      setAutoStatus(controls, "没有读取到登录令牌，请刷新页面或重新登录后再试", "error");
      return;
    }

    const next = scheduleAutoReservation(block, controls);
    startAutoCountdown(controls, next.target);
    setAutoStatus(
      controls,
      `已开启 21:00 自动预约次日座位：${formatAutoSubmitTarget(next.target)} 提交；${reservationCandidatesDetailText(resolved.seats, autoRange)}`,
      "warn"
    );
  }

  async function runAutoSeatReservation(block, controls, submitTime) {
    controls.autoTimer = null;
    if (!controls.autoEnabled) return;
    stopAutoCountdown(controls);

    if (controls.busy) {
      controls.autoTimer = window.setTimeout(() => runAutoSeatReservation(block, controls, submitTime), 1000);
      return;
    }

    const effectiveSubmitTime = submitTime || new Date();
    const range = autoRangeFromControls(block, controls, effectiveSubmitTime);
    const resolved = resolveSeatCandidates(controls.autoSeat.value);
    if (range.error || !resolved.seats.length || !currentAuthorizationHeader()) {
      controls.autoEnabled = false;
      updateAutoButtonState(controls);
      setAutoStatus(controls, range.error || resolved.errors[0] || "自动预约配置不完整", "error");
      return;
    }

    controls.busy = true;
    controls.button.disabled = true;
    controls.autoButton.disabled = true;
    controls.autoButton.textContent = "自动预约中";

    try {
      setAutoStatus(controls, `21:00 自动预约并发开始：${reservationCandidatesDetailText(resolved.seats, range)}`, "warn");
      const result = await submitResolvedSeatsConcurrentlyWithRetries(resolved.seats, range, (message, tone) =>
        setAutoStatus(controls, message, tone)
      );
      setAutoStatus(controls, result.message, result.tone);

      if (result.ok) {
        controls.autoEnabled = false;
        updateAutoButtonState(controls);
      } else if (controls.autoEnabled) {
        const next = scheduleAutoReservation(block, controls);
        startAutoCountdown(controls, next.target);
      }
    } finally {
      controls.busy = false;
      controls.button.disabled = false;
      controls.autoButton.disabled = false;
      controls.button.textContent = "手动预约";
      updateAutoButtonState(controls);
    }
  }

  async function runSeatReservation(block, controls) {
    if (controls.busy) return;

    const range = manualRangeFromControls(block, controls);
    if (range.error) {
      setReserveStatus(controls, range.error, "error");
      return;
    }

    const resolved = resolveSingleSeatCandidate(controls.manualSeat.value);
    if (!resolved.seat) {
      setReserveStatus(controls, resolved.error || "请输入座位号", "error");
      return;
    }

    if (!currentAuthorizationHeader()) {
      setReserveStatus(controls, "没有读取到登录令牌，请刷新页面或重新登录后再试", "error");
      return;
    }

    controls.busy = true;
    controls.button.disabled = true;
    controls.autoButton.disabled = true;
    controls.button.textContent = "提交中";
    setReserveStatus(controls, `准备预约：${reservationDetailText(resolved.seat, range)}`, "warn");

    try {
      const result = await submitResolvedSeatsWithRetries([resolved.seat], range, (message, tone) =>
        setReserveStatus(controls, message, tone)
      );
      setReserveStatus(controls, result.message, result.tone);
    } finally {
      controls.busy = false;
      controls.button.disabled = false;
      controls.autoButton.disabled = false;
      controls.button.textContent = "手动预约";
      updateAutoButtonState(controls);
    }
  }

  function enhanceMeetingTimePicker(block) {
    hideOriginalPicker(block);
    if (block.dataset.libseatMeetingTimeEnhanced === "1") return;

    const value = completeTimeRangeValue(currentRangePickerValue(block), todayText());
    const wrapper = document.createElement("div");
    const index = ++replacementIndex;
    const dateId = `libseat-meeting-date-${index}`;
    const startId = `libseat-meeting-start-${index}`;
    const endId = `libseat-meeting-end-${index}`;
    wrapper.className = "libseat-time-replacement libseat-meeting-query-wrapper";
    wrapper.innerHTML = `
      <div class="libseat-time-replacement-head">
        <div class="libseat-time-replacement-title">研修间查询</div>
      </div>
      <div class="libseat-meeting-query">
        <div class="libseat-time-field">
          <label for="${dateId}">日期</label>
          <input id="${dateId}" class="libseat-meeting-date-input" type="text" inputmode="numeric" autocomplete="off" placeholder="YYYY-MM-DD" aria-label="研修间查询日期">
        </div>
        <div class="libseat-time-field">
          <label for="${startId}">开始</label>
          <input id="${startId}" class="libseat-meeting-start-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="研修间查询开始时间">
        </div>
        <div class="libseat-time-field">
          <label for="${endId}">结束</label>
          <input id="${endId}" class="libseat-meeting-end-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="研修间查询结束时间">
        </div>
        <div class="libseat-time-field">
          <label>状态</label>
          <div class="libseat-meeting-toggle-options two" role="group" aria-label="状态筛选">
            <button class="libseat-meeting-toggle-option libseat-meeting-status-option" type="button" data-value="FREE">空闲</button>
            <button class="libseat-meeting-toggle-option libseat-meeting-status-option" type="button" data-value="BUSY">使用中/预约中</button>
          </div>
        </div>
        <div class="libseat-time-field">
          <label>楼层</label>
          <div class="libseat-meeting-toggle-options four" role="group" aria-label="楼层筛选">
            <button class="libseat-meeting-toggle-option libseat-meeting-floor-option" type="button" data-value="2楼">2</button>
            <button class="libseat-meeting-toggle-option libseat-meeting-floor-option" type="button" data-value="3楼">3</button>
            <button class="libseat-meeting-toggle-option libseat-meeting-floor-option" type="button" data-value="4楼">4</button>
            <button class="libseat-meeting-toggle-option libseat-meeting-floor-option" type="button" data-value="5楼">5</button>
          </div>
        </div>
        <div class="libseat-time-field">
          <label>预约人数</label>
          <input class="libseat-meeting-attendees-input" type="text" inputmode="numeric" autocomplete="off" placeholder="人数" aria-label="预约人数筛选">
        </div>
        <button class="libseat-reserve-button libseat-meeting-query-button" type="button">按条件查询</button>
      </div>
    `;

    const grid = document.createElement("div");
    grid.className = "libseat-meeting-room-grid";
    grid.innerHTML = `<div class="libseat-meeting-room-empty">正在读取研修间</div>`;

    const controls = {
      block,
      wrapper,
      grid,
      date: value.date || todayText(),
      dateInput: wrapper.querySelector(".libseat-meeting-date-input"),
      queryStart: wrapper.querySelector(".libseat-meeting-start-input"),
      queryEnd: wrapper.querySelector(".libseat-meeting-end-input"),
      statusButtons: Array.from(wrapper.querySelectorAll(".libseat-meeting-status-option")),
      floorButtons: Array.from(wrapper.querySelectorAll(".libseat-meeting-floor-option")),
      attendeesInput: wrapper.querySelector(".libseat-meeting-attendees-input"),
      queryButton: wrapper.querySelector(".libseat-meeting-query-button"),
      allRooms: [],
      filteredRooms: [],
      lastRange: null,
      busy: false,
    };

    controls.dateInput.value = controls.date;
    controls.queryStart.value = value.startTime || DAY_OPEN_TIME;
    controls.queryEnd.value = value.endTime || DAY_CLOSE_TIME;
    bindPlainDateInput(controls.dateInput);
    bindReserveTimeInput(controls.queryStart);
    bindReserveTimeInput(controls.queryEnd);

    controls.queryButton.addEventListener("click", () => refreshMeetingRooms(controls));
    controls.dateInput.addEventListener("input", () => {
      controls.date = controls.dateInput.value.trim();
    });
    [...controls.statusButtons, ...controls.floorButtons].forEach((button) => {
      button.addEventListener("click", () => toggleMeetingFilterButton(button, controls));
    });
    [controls.attendeesInput].forEach((input) => {
      input.addEventListener("input", () => renderMeetingRooms(controls));
      input.addEventListener("change", () => renderMeetingRooms(controls));
    });
    [controls.dateInput, controls.queryStart, controls.queryEnd].forEach((input) => {
      input.addEventListener("blur", () => refreshMeetingRooms(controls));
    });

    block.parentNode.insertBefore(wrapper, block);
    const meetingRoom = document.querySelector(".meeting-room");
    if (meetingRoom && meetingRoom.parentNode) {
      meetingRoom.parentNode.insertBefore(grid, meetingRoom);
    } else {
      wrapper.parentNode.insertBefore(grid, wrapper.nextSibling);
    }

    block.dataset.libseatTopReplacement = "1";
    block.dataset.libseatMeetingTimeEnhanced = "1";
    meetingRoomState = controls;
    document.documentElement.classList.add("libseat-meeting-custom-active");
    refreshMeetingRooms(controls);
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
    const manualDefaultStart = defaultStartMinutesForDate(today);
    const autoDefaultStart = timeToMinutes(DAY_OPEN_TIME);
    const defaultEnd = defaultEndMinutesForDate();
    const savedConfig = readReserveConfig();
    const startValue =
      value.date === dateValue && value.startTime && isTimeText(value.startTime)
        ? value.startTime
        : minutesToTime(defaultStart);
    const endValue =
      value.date === dateValue && value.endTime && isTimeText(value.endTime)
        ? value.endTime
        : minutesToTime(defaultEnd);
    const manualStartValue = isTimeText(savedConfig.manualStart)
      ? savedConfig.manualStart
      : minutesToTime(manualDefaultStart);
    const manualEndValue = isTimeText(savedConfig.manualEnd) ? savedConfig.manualEnd : minutesToTime(defaultEnd);
    const autoStartValue = isTimeText(savedConfig.autoStart) ? savedConfig.autoStart : minutesToTime(autoDefaultStart);
    const autoEndValue = isTimeText(savedConfig.autoEnd) ? savedConfig.autoEnd : minutesToTime(defaultEnd);
    const manualSeatValue = cleanReservationText(savedConfig.manualSeat);
    const autoSeatValue = cleanReservationText(savedConfig.autoSeat);

    const wrapper = document.createElement("div");
    const index = ++replacementIndex;
    const queryStartId = `libseat-query-start-input-${index}`;
    const queryEndId = `libseat-query-end-input-${index}`;
    const manualSlotId = `libseat-manual-slot-select-${index}`;
    const manualStartId = `libseat-manual-start-input-${index}`;
    const manualEndId = `libseat-manual-end-input-${index}`;
    const manualSeatId = `libseat-manual-seat-input-${index}`;
    const autoStartId = `libseat-auto-start-input-${index}`;
    const autoEndId = `libseat-auto-end-input-${index}`;
    const autoSeatId = `libseat-auto-seat-input-${index}`;
    wrapper.className = "libseat-time-replacement";
    wrapper.innerHTML = `
      <div class="libseat-time-replacement-head">
        <div class="libseat-time-replacement-title">预约座位</div>
        <div class="libseat-config-tools">
          <button class="libseat-config-button libseat-save-config-button" type="button">保存常用配置</button>
          <button class="libseat-config-button libseat-clear-config-button" type="button" title="清空保存的常用配置">清空常用配置</button>
          <span class="libseat-config-status" aria-live="polite"></span>
        </div>
      </div>
      <div class="libseat-reserve-stack">
        <div class="libseat-reserve-row libseat-reserve-query-row">
          <div class="libseat-reserve-row-title">查时间段</div>
          <div class="libseat-time-field">
            <label>日期</label>
            <div class="libseat-date-buttons">
              <button class="libseat-date-button libseat-today-button" type="button" data-date="${today}">今天 ${today.slice(5)}</button>
              <button class="libseat-date-button libseat-tomorrow-button" type="button" data-date="${tomorrow}">明天 ${tomorrow.slice(5)}</button>
            </div>
          </div>
          <div class="libseat-reserve-spacer" aria-hidden="true"></div>
          <div class="libseat-time-field">
            <label for="${queryStartId}">开始</label>
            <input id="${queryStartId}" name="libseat_query_start_${index}" class="libseat-query-start-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="查询开始时间">
          </div>
          <div class="libseat-time-field">
            <label for="${queryEndId}">结束</label>
            <input id="${queryEndId}" name="libseat_query_end_${index}" class="libseat-query-end-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="查询结束时间">
          </div>
          <button class="libseat-reserve-button libseat-query-button" type="button">刷新地图</button>
          <div class="libseat-query-status" aria-live="polite">选择日期和时间后刷新座位表</div>
        </div>
        <div class="libseat-reserve-row libseat-reserve-manual-row">
          <div class="libseat-reserve-row-title">手动预约</div>
          <div class="libseat-time-field">
            <label for="${manualSeatId}">座位</label>
            <input id="${manualSeatId}" name="libseat_manual_seat_${index}" class="libseat-manual-seat-input" type="text" inputmode="text" autocomplete="off" placeholder="62" aria-label="手动预约座位号">
          </div>
          <div class="libseat-time-field">
            <label for="${manualSlotId}">时间段</label>
            <select id="${manualSlotId}" name="libseat_manual_slot_${index}" class="libseat-slot-select libseat-manual-slot-select" aria-label="手动预约可用时间段"></select>
            <div class="libseat-slot-empty libseat-manual-slot-empty" style="display:none;">输入座位号后读取时间段</div>
          </div>
          <div class="libseat-time-field">
            <label for="${manualStartId}">开始</label>
            <input id="${manualStartId}" name="libseat_manual_start_${index}" class="libseat-manual-start-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="手动预约开始时间">
          </div>
          <div class="libseat-time-field">
            <label for="${manualEndId}">结束</label>
            <input id="${manualEndId}" name="libseat_manual_end_${index}" class="libseat-manual-end-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="手动预约结束时间">
          </div>
          <div class="libseat-reserve-submit">
            <button class="libseat-reserve-button libseat-submit-button" type="button">手动预约</button>
          </div>
          <div class="libseat-reserve-status" aria-live="polite">输入座位号和开始/结束时间后手动预约今天</div>
        </div>
        <div class="libseat-reserve-row libseat-reserve-auto-row">
          <div class="libseat-reserve-row-title">自动预约</div>
          <div class="libseat-time-field">
            <label for="${autoSeatId}">座位</label>
            <input id="${autoSeatId}" name="libseat_auto_seat_${index}" class="libseat-auto-seat-input" type="text" inputmode="text" autocomplete="off" placeholder="62, 63" aria-label="自动预约座位号">
          </div>
          <div class="libseat-reserve-spacer" aria-hidden="true"></div>
          <div class="libseat-time-field">
            <label for="${autoStartId}">开始</label>
            <input id="${autoStartId}" name="libseat_auto_start_${index}" class="libseat-auto-start-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="自动预约开始时间">
          </div>
          <div class="libseat-time-field">
            <label for="${autoEndId}">结束</label>
            <input id="${autoEndId}" name="libseat_auto_end_${index}" class="libseat-auto-end-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="自动预约结束时间">
          </div>
          <div class="libseat-auto-submit">
            <button class="libseat-reserve-button libseat-auto-button" type="button">开启 21:00 自动预约次日座位</button>
            <span class="libseat-auto-countdown" aria-live="polite"></span>
          </div>
          <div class="libseat-auto-status" aria-live="polite">输入座位号和开始/结束时间；默认预约次日</div>
        </div>
      </div>
    `;

    const controls = {
      date: dateValue,
      todayButton: wrapper.querySelector(".libseat-today-button"),
      tomorrowButton: wrapper.querySelector(".libseat-tomorrow-button"),
      queryStart: wrapper.querySelector(".libseat-query-start-input"),
      queryEnd: wrapper.querySelector(".libseat-query-end-input"),
      queryButton: wrapper.querySelector(".libseat-query-button"),
      queryStatus: wrapper.querySelector(".libseat-query-status"),
      configSaveButton: wrapper.querySelector(".libseat-save-config-button"),
      configClearButton: wrapper.querySelector(".libseat-clear-config-button"),
      configStatus: wrapper.querySelector(".libseat-config-status"),
      manualSeat: wrapper.querySelector(".libseat-manual-seat-input"),
      manualSlotSelect: wrapper.querySelector(".libseat-manual-slot-select"),
      manualSlotEmpty: wrapper.querySelector(".libseat-manual-slot-empty"),
      manualStart: wrapper.querySelector(".libseat-manual-start-input"),
      manualEnd: wrapper.querySelector(".libseat-manual-end-input"),
      button: wrapper.querySelector(".libseat-submit-button"),
      autoSeat: wrapper.querySelector(".libseat-auto-seat-input"),
      autoStart: wrapper.querySelector(".libseat-auto-start-input"),
      autoEnd: wrapper.querySelector(".libseat-auto-end-input"),
      autoButton: wrapper.querySelector(".libseat-auto-button"),
      autoCountdown: wrapper.querySelector(".libseat-auto-countdown"),
      status: wrapper.querySelector(".libseat-reserve-status"),
      autoStatus: wrapper.querySelector(".libseat-auto-status"),
      busy: false,
      autoEnabled: false,
      autoTimer: null,
      autoCountdownTimer: null,
      manualSlotUpdateTimer: null,
      manualSlotRequestId: 0,
      manualSlotSeatId: null,
      manualTimeManuallyEdited: isTimeText(savedConfig.manualStart) || isTimeText(savedConfig.manualEnd),
      applyingManualSlot: false,
      get focused() {
        return wrapper.dataset.libseatFocused === "1";
      },
    };

    controls.queryStart.value = startValue;
    controls.queryEnd.value = endValue;
    controls.manualStart.value = manualStartValue;
    controls.manualEnd.value = manualEndValue;
    controls.manualSeat.value = manualSeatValue;
    controls.autoStart.value = autoStartValue;
    controls.autoEnd.value = autoEndValue;
    controls.autoSeat.value = autoSeatValue;
    setConfigStatus(controls, Object.keys(savedConfig).length ? "已读取常用配置" : "");
    setManualSlotEmpty(controls, "输入座位号后读取时间段", false);
    updateDateButtons(controls, dateValue);
    bindReserveQueryDateButton(block, controls, controls.todayButton);
    bindReserveQueryDateButton(block, controls, controls.tomorrowButton);
    bindReserveTimeInput(controls.queryStart);
    bindReserveTimeInput(controls.queryEnd);
    bindReserveTimeInput(controls.manualStart);
    bindReserveTimeInput(controls.manualEnd);
    bindReserveTimeInput(controls.autoStart);
    bindReserveTimeInput(controls.autoEnd);
    bindReserveSeatInput(controls.manualSeat);
    bindReserveSeatInput(controls.autoSeat);
    controls.configSaveButton.addEventListener("click", () => saveReserveConfig(controls));
    controls.configClearButton.addEventListener("click", () => clearReserveConfig(block, controls));
    controls.queryButton.addEventListener("click", () => {
      refreshSeatMapFromQuery(block, controls);
    });
    controls.queryStart.addEventListener("input", () => {
      controls.queryButton.removeAttribute("title");
    });
    controls.queryEnd.addEventListener("input", () => {
      controls.queryButton.removeAttribute("title");
    });
    controls.queryStart.addEventListener("blur", () => {
      refreshSeatMapFromQuery(block, controls);
    });
    controls.queryEnd.addEventListener("blur", () => {
      refreshSeatMapFromQuery(block, controls);
    });
    controls.manualSeat.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      runSeatReservation(block, controls);
    });
    controls.manualSeat.addEventListener("input", () => {
      controls.manualTimeManuallyEdited = false;
      updateReserveButtonDetail(block, controls, true);
      queueManualSlotUpdate(block, controls, 350);
    });
    controls.manualSlotSelect.addEventListener("change", () => applyManualSlot(block, controls));
    controls.manualStart.addEventListener("input", () => {
      if (!controls.applyingManualSlot) controls.manualTimeManuallyEdited = true;
      updateReserveButtonDetail(block, controls, true);
    });
    controls.manualEnd.addEventListener("input", () => {
      if (!controls.applyingManualSlot) controls.manualTimeManuallyEdited = true;
      updateReserveButtonDetail(block, controls, true);
    });
    controls.todayButton.addEventListener("click", () => {
      setTimeout(() => refreshSeatMapFromQuery(block, controls), 0);
    });
    controls.tomorrowButton.addEventListener("click", () => {
      setTimeout(() => refreshSeatMapFromQuery(block, controls), 0);
    });
    controls.manualStart.addEventListener("blur", () => {
      updateReserveButtonDetail(block, controls, true);
      queueManualSlotUpdate(block, controls, 0);
    });
    controls.manualEnd.addEventListener("blur", () => {
      updateReserveButtonDetail(block, controls, true);
      queueManualSlotUpdate(block, controls, 0);
    });
    controls.autoSeat.addEventListener("input", () => updateAutoReservationDetail(block, controls, true));
    controls.autoSeat.addEventListener("blur", () => {
      if (controls.autoEnabled) setAutoReserveEnabled(block, controls, true);
    });
    controls.autoStart.addEventListener("input", () => updateAutoReservationDetail(block, controls, true));
    controls.autoEnd.addEventListener("input", () => updateAutoReservationDetail(block, controls, true));
    controls.autoStart.addEventListener("blur", () => {
      updateAutoReservationDetail(block, controls, true);
      if (controls.autoEnabled) setAutoReserveEnabled(block, controls, true);
    });
    controls.autoEnd.addEventListener("blur", () => {
      updateAutoReservationDetail(block, controls, true);
      if (controls.autoEnabled) setAutoReserveEnabled(block, controls, true);
    });
    controls.autoButton.addEventListener("click", () => setAutoReserveEnabled(block, controls, !controls.autoEnabled));
    controls.button.addEventListener("click", () => runSeatReservation(block, controls));
    updateAutoButtonState(controls);
    updateReserveButtonDetail(block, controls, true);
    updateAutoReservationDetail(block, controls, true);
    refreshSeatMapFromQuery(block, controls);

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

    let date =
      (modalVm && modalVm.timeRange && modalVm.timeRange.date) ||
      (snapshot && snapshot.timeRange && snapshot.timeRange.date) ||
      controls.date;
    if (modalVm && modalVm.timeRange) {
      const fixedRange = completeTimeRangeValue(Object.assign({}, modalVm.timeRange, { date }), date);
      if (
        fixedRange.date !== modalVm.timeRange.date ||
        fixedRange.startTime !== modalVm.timeRange.startTime ||
        fixedRange.endTime !== modalVm.timeRange.endTime
      ) {
        if (typeof modalVm.$set === "function") {
          modalVm.$set(modalVm, "timeRange", fixedRange);
        } else {
          modalVm.timeRange = fixedRange;
        }
      }
      date = fixedRange.date;
    }
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
    const completedValue = completeTimeRangeValue(Object.assign({}, value, { date: dateValue }), dateValue);

    const wrapper = document.createElement("div");
    const index = ++replacementIndex;
    const selectId = `libseat-slot-select-${index}`;
    const startId = `libseat-modal-start-input-${index}`;
    const endId = `libseat-modal-end-input-${index}`;
    wrapper.className = "libseat-slot-replacement";
    wrapper.innerHTML = `
      <div class="libseat-time-replacement-head">
        <div class="libseat-time-replacement-title">可用时间段</div>
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

    controls.start.value = completedValue.startTime;
    controls.end.value = completedValue.endTime;
    updateDateButtons(controls, dateValue);
    if (
      dateValue !== value.date ||
      completedValue.startTime !== value.startTime ||
      completedValue.endTime !== value.endTime
    ) {
      emitRangePickerRange(
        block,
        { date: dateValue, startTime: completedValue.startTime, endTime: completedValue.endTime },
        dateValue !== value.date
      );
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

  function refreshMeetingModalReservations(block) {
    const modalVm = findMeetingModalVm(block);
    if (!modalVm) return false;
    const room = currentMeetingModalRoom(modalVm);
    const range = meetingModalRange(modalVm);
    if (room && room.id && !range.error) {
      fetchMeetingRoomReservationsByDate(room.id, range.date).then((result) => {
        const activeRoom = currentMeetingModalRoom(modalVm);
        const activeRange = meetingModalRange(modalVm);
        if (!activeRoom || String(activeRoom.id) !== String(room.id) || activeRange.error || activeRange.date !== range.date) return;
        if (!result.ok || !Array.isArray(result.data)) return;
        if (typeof modalVm.$set === "function") {
          modalVm.$set(modalVm, "reservations", result.data);
        } else {
          modalVm.reservations = result.data;
        }
        if (typeof modalVm.$forceUpdate === "function") modalVm.$forceUpdate();
        window.setTimeout(enhanceReservationUserLabels, 0);
      });
      return true;
    }
    const names = ["getMeetingReservations", "getReservations", "queryReservations", "initReservations"];
    for (const name of names) {
      if (typeof modalVm[name] !== "function") continue;
      setTimeout(() => {
        try {
          modalVm[name]();
        } catch (error) {}
      }, 0);
      return true;
    }
    return false;
  }

  function showPageToast(message) {
    const text = String(message || "").trim();
    if (!text) return;
    const page = pageWindow();
    try {
      if (page.uni && typeof page.uni.showToast === "function") {
        page.uni.showToast({ title: text, icon: "none" });
        return;
      }
    } catch (error) {}
    window.alert(text);
  }

  function meetingModalRange(modalVm) {
    const value = completeTimeRangeValue(currentMeetingModalRangeValue(modalVm), todayText());
    const startTime = normalizeTimeInputValue(value.startTime);
    const endTime = normalizeTimeInputValue(value.endTime);
    if (!isDateText(value.date)) return { error: "日期格式不正确" };
    if (!isTimeText(startTime) || !isTimeText(endTime)) return { error: "时间格式不正确" };
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) return { error: "结束时间必须晚于开始时间" };
    return {
      date: value.date,
      startTime,
      endTime,
      startDateTime: formatReservationDateTime(value.date, startTime),
      endDateTime: formatReservationDateTime(value.date, endTime),
    };
  }

  function meetingInlineState(form) {
    if (!form.__libseatMeetingInlineState) {
      form.__libseatMeetingInlineState = { attendees: [], submitting: false };
    }
    return form.__libseatMeetingInlineState;
  }

  function renderMeetingInlineAttendees(form) {
    const state = meetingInlineState(form);
    const list = form.querySelector(".libseat-meeting-attendee-list");
    if (!list) return;
    if (!state.attendees.length) {
      list.innerHTML = `<div class="libseat-meeting-inline-status">未添加成员</div>`;
      return;
    }
    list.innerHTML = state.attendees
      .map(
        (user, index) => `
          <div class="libseat-meeting-attendee-item" data-index="${index}">
            <span>${escapeHtml([user.nickname || user.name, user.code].filter(Boolean).join(" "))}</span>
            <button class="libseat-meeting-attendee-remove" type="button" title="移除">x</button>
          </div>
        `
      )
      .join("");
    list.querySelectorAll(".libseat-meeting-attendee-remove").forEach((button) => {
      button.addEventListener("click", () => {
        const item = button.closest(".libseat-meeting-attendee-item");
        const index = Number(item && item.dataset.index);
        if (Number.isFinite(index)) {
          state.attendees.splice(index, 1);
          renderMeetingInlineAttendees(form);
        }
      });
    });
  }

  function meetingInlineStatus(form, message, isError) {
    const node = form.querySelector(".libseat-meeting-inline-status-main");
    if (!node) return;
    node.textContent = message || "";
    node.style.color = isError ? "#b91c1c" : "#64748b";
  }

  async function addMeetingInlineAttendee(form) {
    const modalVm = findMeetingModalVm(form);
    const input = form.querySelector(".libseat-meeting-attendee-code");
    const code = cleanReservationText(input && input.value);
    if (!code) {
      meetingInlineStatus(form, "请输入学号", true);
      return;
    }
    const range = meetingModalRange(modalVm);
    if (range.error) {
      meetingInlineStatus(form, range.error, true);
      return;
    }
    meetingInlineStatus(form, "正在检查成员空闲状态", false);
    const result = await fetchMeetingFreeUser(code, range);
    if (!result.ok || !result.data || typeof result.data !== "object") {
      meetingInlineStatus(form, `添加失败：${responseMessage(result)}`, true);
      return;
    }
    const state = meetingInlineState(form);
    const user = result.data;
    if (state.attendees.some((item) => Number(item.id) === Number(user.id))) {
      meetingInlineStatus(form, "该成员已添加", true);
      return;
    }
    const currentUser = readStoredUserInfo();
    if (currentUser && Number(currentUser.id) === Number(user.id)) {
      meetingInlineStatus(form, "不能添加自己", true);
      return;
    }
    state.attendees.unshift(user);
    if (input) input.value = "";
    renderMeetingInlineAttendees(form);
    meetingInlineStatus(form, "成员已添加", false);
  }

  async function submitMeetingInlineApplication(form) {
    const state = meetingInlineState(form);
    if (state.submitting) return;
    const modalVm = findMeetingModalVm(form);
    const room = currentMeetingModalRoom(modalVm);
    const range = meetingModalRange(modalVm);
    const titleInput = form.querySelector(".libseat-meeting-title-input");
    const contentInput = form.querySelector(".libseat-meeting-content-input");
    const meetingTitle = cleanReservationText(titleInput && titleInput.value);
    const meetingContent = cleanReservationText(contentInput && contentInput.value);

    if (!room || !room.id) {
      meetingInlineStatus(form, "没有读取到研修间信息", true);
      return;
    }
    if (range.error) {
      meetingInlineStatus(form, range.error, true);
      return;
    }
    if (!meetingTitle) {
      meetingInlineStatus(form, "请输入会议主题", true);
      return;
    }
    if (!meetingContent) {
      meetingInlineStatus(form, "请输入会议内容", true);
      return;
    }
    const minAttendees = roomMinAttendees(room);
    const capacity = roomCapacity(room);
    if (minAttendees > 0 && state.attendees.length + 1 < minAttendees) {
      meetingInlineStatus(form, `至少需要 ${minAttendees} 人`, true);
      return;
    }
    if (capacity > 0 && state.attendees.length + 1 > capacity) {
      meetingInlineStatus(form, `最多允许 ${capacity} 人`, true);
      return;
    }

    state.submitting = true;
    meetingInlineStatus(form, "正在提交预约", false);
    const result = await submitMeetingApplication({
      meetingRoomId: room.id,
      startTime: range.startDateTime,
      endTime: range.endDateTime,
      meetingTitle,
      meetingContent,
      attendees: state.attendees.map((user) => user.id),
      scan: false,
    });
    state.submitting = false;

    if (!result.ok) {
      meetingInlineStatus(form, `预约失败：${responseMessage(result)}`, true);
      return;
    }
    meetingInlineStatus(form, "预约成功", false);
    showPageToast("预约成功");
    closeMeetingModalFromNode(form);
    if (modalVm && typeof modalVm.$emit === "function") modalVm.$emit("submit");
  }

  function ensureMeetingInlineApplicationForm(modal) {
    const pickStep = modal.querySelector(".pick-step");
    if (!pickStep || pickStep.querySelector(".libseat-meeting-inline-form")) return;
    const form = document.createElement("div");
    form.className = "libseat-meeting-inline-form";
    form.innerHTML = `
      <div class="libseat-meeting-inline-main">
        <div class="libseat-meeting-inline-field">
          <label>会议主题</label>
          <input class="libseat-meeting-inline-input libseat-meeting-title-input" type="text" maxlength="30" autocomplete="off" placeholder="请输入会议主题">
        </div>
        <div class="libseat-meeting-inline-field">
          <label>会议内容</label>
          <textarea class="libseat-meeting-inline-textarea libseat-meeting-content-input" maxlength="100" placeholder="请输入会议内容"></textarea>
        </div>
      </div>
      <div class="libseat-meeting-inline-side">
        <div class="libseat-meeting-attendee-row">
          <div class="libseat-meeting-inline-field">
            <label>添加成员</label>
            <input class="libseat-meeting-inline-input libseat-meeting-attendee-code" type="text" autocomplete="off" placeholder="输入学号">
          </div>
          <button class="libseat-meeting-inline-button libseat-meeting-attendee-add" type="button">添加</button>
        </div>
        <div>
          <div class="libseat-meeting-inline-side-label">成员列表</div>
          <div class="libseat-meeting-attendee-list"></div>
        </div>
        <div class="libseat-meeting-inline-status libseat-meeting-inline-status-main"></div>
        <button class="libseat-meeting-inline-button libseat-meeting-inline-submit" type="button">直接预约</button>
      </div>
    `;
    pickStep.appendChild(form);
    renderMeetingInlineAttendees(form);
    form.querySelector(".libseat-meeting-attendee-add").addEventListener("click", () => addMeetingInlineAttendee(form));
    form.querySelector(".libseat-meeting-attendee-code").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addMeetingInlineAttendee(form);
      }
    });
    form.querySelector(".libseat-meeting-inline-submit").addEventListener("click", () => submitMeetingInlineApplication(form));
  }

  function bindMeetingInlinePrimarySubmit(modal) {
    const button = modal.querySelector(".modal-footer .btn-primary");
    const form = modal.querySelector(".libseat-meeting-inline-form");
    if (!button || !form || button.dataset.libseatMeetingInlineSubmit === "1") return;
    button.dataset.libseatMeetingInlineSubmit = "1";
    button.textContent = "预约";
    button.addEventListener(
      "click",
      (event) => {
        const modalVm = findMeetingModalVm(modal);
        if (modalVm && Number(modalVm.step) !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        submitMeetingInlineApplication(form);
      },
      true
    );
  }

  function enhanceMeetingInlineApplicationForms() {
    document.querySelectorAll(".reserve-modal .e-modal_show").forEach((modal) => {
      ensureMeetingInlineApplicationForm(modal);
      bindMeetingInlinePrimarySubmit(modal);
      const modalVm = findMeetingModalVm(modal);
      const room = currentMeetingModalRoom(modalVm);
      const range = meetingModalRange(modalVm);
      const key = room && room.id && !range.error ? `${room.id}|${range.date}` : "";
      if (key && modal.dataset.libseatMeetingReservationsKey !== key) {
        modal.dataset.libseatMeetingReservationsKey = key;
        if (modalVm) {
          if (typeof modalVm.$set === "function") modalVm.$set(modalVm, "reservations", []);
          else modalVm.reservations = [];
        }
        refreshMeetingModalReservations(modal);
      }
    });
  }

  function closeMeetingModalFromNode(node) {
    const modalVm = findMeetingModalVm(node);
    if (!modalVm) return false;
    if (typeof modalVm.$set === "function") {
      modalVm.$set(modalVm, "visible", false);
    } else {
      modalVm.visible = false;
    }
    if (typeof modalVm.$emit === "function") modalVm.$emit("update:visible", false);
    if (typeof modalVm.$forceUpdate === "function") modalVm.$forceUpdate();
    return true;
  }

  function bindMeetingModalOutsideClose() {
    document.querySelectorAll(".reserve-modal .e-modal, .reserve-modal .e-modal-mask").forEach((layer) => {
      if (layer.dataset.libseatMeetingOutsideClose === "1") return;
      layer.dataset.libseatMeetingOutsideClose = "1";
      layer.addEventListener("click", (event) => {
        if (event.target && typeof event.target.closest === "function" && event.target.closest(".e-modal-container")) return;
        closeMeetingModalFromNode(layer);
      });
    });
  }

  function cleanupMeetingModalTimeReplacements() {
    document.querySelectorAll(".reserve-modal .libseat-meeting-slot-replacement").forEach((wrapper) => {
      const timeSection = wrapper.closest(".time-section");
      const pickStep = wrapper.closest(".pick-step");
      if (timeSection && pickStep) return;
      if (timeSection) delete timeSection.dataset.libseatMeetingSlotEnhanced;
      wrapper.remove();
    });
  }

  function setMeetingModalRange(block, controls, updates) {
    const current = {
      date: controls.dateInput.value,
      startTime: controls.start.value,
      endTime: controls.end.value,
    };
    const next = completeTimeRangeValue(Object.assign({}, current, updates), updates && updates.date);
    controls.dateInput.value = next.date;
    controls.start.value = next.startTime;
    controls.end.value = next.endTime;

    const modalVm = findMeetingModalVm(block);
    if (modalVm && modalVm.timeRange) {
      if (typeof modalVm.$set === "function") {
        modalVm.$set(modalVm, "timeRange", Object.assign({}, modalVm.timeRange, next));
      } else {
        modalVm.timeRange = Object.assign({}, modalVm.timeRange, next);
      }
      if (typeof modalVm.$forceUpdate === "function") modalVm.$forceUpdate();
    }

    emitRangePickerRange(block, next, !!(updates && updates.date));
    refreshMeetingModalReservations(block);
  }

  function enhanceMeetingModalTimePicker(block) {
    if (!block.closest(".pick-step")) return;
    if (block.dataset.libseatMeetingSlotEnhanced === "1") {
      if (block.querySelector(".libseat-meeting-slot-replacement")) return;
      delete block.dataset.libseatMeetingSlotEnhanced;
    }

    const originalPicker = block.querySelector(".time-picker") || block;
    const value = completeTimeRangeValue(currentRangePickerValue(block), todayText());
    const wrapper = document.createElement("div");
    const index = ++replacementIndex;
    const dateId = `libseat-meeting-modal-date-${index}`;
    const startId = `libseat-meeting-modal-start-${index}`;
    const endId = `libseat-meeting-modal-end-${index}`;
    wrapper.className = "libseat-slot-replacement libseat-meeting-slot-replacement";
    wrapper.innerHTML = `
      <div class="libseat-time-replacement-head">
        <div class="libseat-time-replacement-title">预约时间</div>
      </div>
      <div class="libseat-meeting-slot-grid">
        <div class="libseat-time-field">
          <label for="${dateId}">日期</label>
          <input id="${dateId}" class="libseat-meeting-modal-date-input" type="text" inputmode="numeric" autocomplete="off" placeholder="YYYY-MM-DD" aria-label="研修间预约日期">
        </div>
        <div class="libseat-time-field">
          <label for="${startId}">开始</label>
          <input id="${startId}" class="libseat-meeting-modal-start-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="研修间预约开始时间">
        </div>
        <div class="libseat-time-field">
          <label for="${endId}">结束</label>
          <input id="${endId}" class="libseat-meeting-modal-end-input" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" aria-label="研修间预约结束时间">
        </div>
      </div>
    `;

    const controls = {
      dateInput: wrapper.querySelector(".libseat-meeting-modal-date-input"),
      start: wrapper.querySelector(".libseat-meeting-modal-start-input"),
      end: wrapper.querySelector(".libseat-meeting-modal-end-input"),
    };

    controls.dateInput.value = value.date;
    controls.start.value = value.startTime;
    controls.end.value = value.endTime;
    bindPlainDateInput(controls.dateInput);
    bindReserveTimeInput(controls.start);
    bindReserveTimeInput(controls.end);
    controls.dateInput.addEventListener("blur", () => setMeetingModalRange(block, controls, { date: controls.dateInput.value }));
    controls.start.addEventListener("blur", () => setMeetingModalRange(block, controls, { startTime: controls.start.value }));
    controls.end.addEventListener("blur", () => setMeetingModalRange(block, controls, { endTime: controls.end.value }));

    hideOriginalPicker(originalPicker);
    if (originalPicker.parentNode === block) {
      block.insertBefore(wrapper, originalPicker);
    } else {
      block.appendChild(wrapper);
    }
    block.dataset.libseatMeetingSlotEnhanced = "1";
    setMeetingModalRange(block, controls, value);
  }

  function enhanceTimePickers() {
    const meetingPage = isMeetingReservePage();
    const seatPage = isSeatReservePage();

    document
      .querySelectorAll(".seat-reserve-modal .seat-time-picker .time-block")
      .forEach(enhanceModalTimePicker);

    if (meetingPage) {
      cleanupMeetingModalTimeReplacements();
      document.querySelectorAll(".reserve-modal .time-section").forEach(enhanceMeetingModalTimePicker);
      bindMeetingModalOutsideClose();
      enhanceMeetingInlineApplicationForms();
    }

    const blocks = new Set(
      Array.from(document.querySelectorAll(".range-picker.time-block")).filter(
        (block) => !block.closest(".seat-reserve-modal") && !block.closest(".reserve-modal")
      )
    );
    const exactBlock = document.querySelector(RANGE_PICKER_SELECTOR);
    if (exactBlock && exactBlock.classList.contains("range-picker")) blocks.add(exactBlock);
    blocks.forEach((block) => {
      if (meetingPage) {
        enhanceMeetingTimePicker(block);
      } else if (seatPage) {
        enhanceTimePicker(block);
      }
    });
  }

  function enhancePage() {
    injectStyle();
    applyPcWideClass();
    installRequestTimeGuard();
    installPageBridge();
    updateHomeTopLogo();
    applySeatMapScale();
    stabilizeFacilityImages();
    classifySeatMap();
    if (isMeetingReservePage()) {
      hideMeetingLoadMoreNodes();
    }
    bindSeatRoomDirectOpen();
    queueClassifySeatMap();
    replaceSeatLegend();
    enhanceTimePickers();
    enhanceReservationUserLabels();
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
  installRequestTimeGuard();
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
  window.setInterval(hideMeetingLoadMoreNodes, 1500);
  window.setInterval(stabilizeFacilityImages, 2000);
})();
