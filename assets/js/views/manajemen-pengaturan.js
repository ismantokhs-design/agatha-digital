// File: assets/js/views/manajemen-pengaturan.js
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../firebase-init.js";

const PROFILE_DOC_REF = doc(db, "pengaturan", "profil_perusahaan");
const DEFAULT_BRAND_NAME = "Agahta Digital";
const DEFAULT_BANNER_PHOTO = "assets/icons/Logo.png";
const FEEDBACK_AUTO_HIDE_MS = 3500;

const HARI_OPERASIONAL = [
    { key: "senin", label: "Senin", defaultMode: "buka", defaultOpen: "08:00", defaultClose: "17:00" },
    { key: "selasa", label: "Selasa", defaultMode: "buka", defaultOpen: "08:00", defaultClose: "17:00" },
    { key: "rabu", label: "Rabu", defaultMode: "buka", defaultOpen: "08:00", defaultClose: "17:00" },
    { key: "kamis", label: "Kamis", defaultMode: "buka", defaultOpen: "08:00", defaultClose: "17:00" },
    { key: "jumat", label: "Jumat", defaultMode: "buka", defaultOpen: "08:00", defaultClose: "17:00" },
    { key: "sabtu", label: "Sabtu", defaultMode: "tutup", defaultOpen: "08:00", defaultClose: "14:00" },
    { key: "minggu", label: "Minggu", defaultMode: "tutup", defaultOpen: "08:00", defaultClose: "14:00" }
];

const DEFAULT_PROFILE = {
    nama: "",
    bidangUsaha: "",
    tagline: "",
    alamat: "",
    rt: "",
    rw: "",
    desa_kelurahan: "",
    kecamatan: "",
    kabupaten_kota: "",
    kode_pos: "",
    provinsi: "",
    telepon: "",
    email: "",
    website: "",
    jamOperasional: "",
    jadwalOperasional: [],
    deskripsi: "",
    iconUrl: "",
    bannerUrl: ""
};

function escapeHtml(value = "") {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function isSafeImageSrc(src = "") {
    const val = String(src || "").trim();
    if (!val || val === "null" || val === "undefined") return false;
    return (
        val.startsWith("https://") ||
        val.startsWith("http://") ||
        val.startsWith("assets/") ||
        val.startsWith("./") ||
        val.startsWith("/") ||
        val.startsWith("data:image/")
    );
}

function normalizeTimeHHMM(val = "", fallback = "08:00") {
    const str = String(val || "").trim().replace(".", ":");
    const match = str.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return fallback;
    const hh = Math.min(23, Math.max(0, Number(match[1])));
    const mm = Math.min(59, Math.max(0, Number(match[2])));
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function getDefaultScheduleList() {
    return HARI_OPERASIONAL.map((h) => ({
        hari: h.key,
        label: h.label,
        mode: h.defaultMode,
        buka: h.defaultOpen,
        tutup: h.defaultClose
    }));
}

function parseLegacyJamTextToSchedule(legacyText = "") {
    const base = getDefaultScheduleList();
    const clean = String(legacyText || "").trim();
    if (!clean) return base;

    const lower = clean.toLowerCase();
    if (lower.includes("24 jam")) {
        return base.map((item) => ({ ...item, mode: "24jam" }));
    }

    const timeMatches = clean.match(/\b(\d{1,2}[:.]\d{2})\s*[-–—sampai]+\s*(\d{1,2}[:.]\d{2})\b/gi);
    let openTime = "08:00";
    let closeTime = "17:00";
    if (timeMatches && timeMatches.length > 0) {
        const parts = timeMatches[0].split(/[-–—sampai]+/i);
        if (parts.length >= 2) {
            openTime = normalizeTimeHHMM(parts[0], "08:00");
            closeTime = normalizeTimeHHMM(parts[1], "17:00");
        }
    }

    const coversWeekend = /minggu|ahad|setiap hari|senin\s*[-–—]\s*minggu/i.test(lower);
    const coversSaturday = coversWeekend || /sabtu|senin\s*[-–—]\s*sabtu/i.test(lower);

    return base.map((item) => {
        if (item.hari === "sabtu") {
            return {
                ...item,
                mode: coversSaturday ? "buka" : "tutup",
                buka: openTime,
                tutup: closeTime
            };
        }
        if (item.hari === "minggu") {
            return {
                ...item,
                mode: coversWeekend ? "buka" : "tutup",
                buka: openTime,
                tutup: closeTime
            };
        }
        return {
            ...item,
            mode: "buka",
            buka: openTime,
            tutup: closeTime
        };
    });
}

function normalizeScheduleList(rawSchedule = [], legacyJamText = "") {
    if (Array.isArray(rawSchedule) && rawSchedule.length > 0) {
        const mapByKey = new Map();
        rawSchedule.forEach((row) => {
            if (!row || typeof row !== "object") return;
            const key = String(row.hari || row.key || row.day || "").trim().toLowerCase();
            if (key) mapByKey.set(key, row);
        });

        return HARI_OPERASIONAL.map((h) => {
            const found = mapByKey.get(h.key);
            if (!found) {
                return {
                    hari: h.key,
                    label: h.label,
                    mode: h.defaultMode,
                    buka: h.defaultOpen,
                    tutup: h.defaultClose
                };
            }
            let mode = String(found.mode || "").trim().toLowerCase();
            if (!["buka", "tutup", "24jam"].includes(mode)) {
                if (found.buka24Jam === true || found.is24Hours === true) mode = "24jam";
                else if (found.tutup === true || found.closed === true) mode = "tutup";
                else mode = "buka";
            }
            return {
                hari: h.key,
                label: h.label,
                mode,
                buka: normalizeTimeHHMM(found.buka || found.open, h.defaultOpen),
                tutup: normalizeTimeHHMM(found.tutup || found.close, h.defaultClose)
            };
        });
    }

    return parseLegacyJamTextToSchedule(legacyJamText);
}

function formatScheduleSummary(scheduleList = []) {
    const list = normalizeScheduleList(scheduleList);
    const all24 = list.every((d) => d.mode === "24jam");
    if (all24) return "Buka 24 jam (Senin - Minggu)";

    const allClosed = list.every((d) => d.mode === "tutup");
    if (allClosed) return "Tutup";

    const groups = [];
    list.forEach((day) => {
        const sig = day.mode === "24jam"
            ? "24jam"
            : day.mode === "tutup"
                ? "tutup"
                : `buka:${day.buka}-${day.tutup}`;

        const prev = groups[groups.length - 1];
        if (prev && prev.sig === sig) {
            prev.endLabel = day.label;
            prev.count += 1;
        } else {
            groups.push({
                sig,
                mode: day.mode,
                buka: day.buka,
                tutup: day.tutup,
                startLabel: day.label,
                endLabel: day.label,
                count: 1
            });
        }
    });

    const formatted = groups.map((g) => {
        const dayRange = g.count > 1
            ? (g.count === 2 ? `${g.startLabel}, ${g.endLabel}` : `${g.startLabel} - ${g.endLabel}`)
            : g.startLabel;

        if (g.mode === "24jam") return `${dayRange}: Buka 24 jam`;
        if (g.mode === "tutup") return `${dayRange}: Tutup`;
        return `${dayRange}, ${g.buka} - ${g.tutup}`;
    });

    return formatted.join(" • ");
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
        reader.readAsDataURL(file);
    });
}

async function compressImageFile(file, maxWidth = 1024, maxHeight = 600, quality = 0.78) {
    const rawDataUrl = await readFileAsDataUrl(file);
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            const scale = Math.min(1, maxWidth / Math.max(1, width), maxHeight / Math.max(1, height));
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => resolve(rawDataUrl);
        img.src = rawDataUrl;
    });
}

export function renderManajemenPengaturan() {
    const rowsHtml = HARI_OPERASIONAL.map((h) => {
        const isClosedDefault = h.defaultMode === "tutup";
        return `
            <div data-jam-row="${h.key}" class="grid grid-cols-12 gap-2 sm:gap-3 items-center px-3 py-2 bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none text-xs">
                <div class="col-span-4 sm:col-span-3 font-semibold text-stone-800 dark:text-stone-100">
                    ${escapeHtml(h.label)}
                </div>
                <div class="col-span-4 sm:col-span-3">
                    <select
                        data-jam-mode="${h.key}"
                        aria-label="Status operasional ${escapeHtml(h.label)}"
                        class="w-full px-2 py-1.5 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                    >
                        <option value="buka" ${h.defaultMode === "buka" ? "selected" : ""}>Buka</option>
                        <option value="24jam" ${h.defaultMode === "24jam" ? "selected" : ""}>Buka 24 jam</option>
                        <option value="tutup" ${h.defaultMode === "tutup" ? "selected" : ""}>Tutup</option>
                    </select>
                </div>
                <div class="col-span-4 sm:col-span-6 flex items-center gap-1.5" data-jam-times="${h.key}">
                    <input
                        type="time"
                        data-jam-open="${h.key}"
                        value="${escapeHtml(h.defaultOpen)}"
                        ${isClosedDefault ? "disabled" : ""}
                        aria-label="Jam buka ${escapeHtml(h.label)}"
                        class="w-full px-2 py-1 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 disabled:opacity-45 focus:outline-none focus:border-[#c87d32]"
                    >
                    <span class="text-stone-400 font-semibold">-</span>
                    <input
                        type="time"
                        data-jam-close="${h.key}"
                        value="${escapeHtml(h.defaultClose)}"
                        ${isClosedDefault ? "disabled" : ""}
                        aria-label="Jam tutup ${escapeHtml(h.label)}"
                        class="w-full px-2 py-1 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 disabled:opacity-45 focus:outline-none focus:border-[#c87d32]"
                    >
                    <span data-jam-badge="${h.key}" class="${isClosedDefault ? "" : "hidden"} text-[11px] font-semibold text-stone-500 dark:text-stone-400 whitespace-nowrap">
                        Tutup
                    </span>
                </div>
            </div>
        `;
    }).join("");

    return `
        <div class="space-y-5">
            <!-- Header Halaman -->
            <div class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 class="text-lg md:text-xl font-bold text-stone-900 dark:text-stone-100 leading-snug">
                        Pengaturan Profil Perusahaan — ${DEFAULT_BRAND_NAME}
                    </h1>
                    <p class="text-xs md:text-sm text-stone-600 dark:text-stone-400 mt-1">
                        Kelola identitas profil perusahaan, informasi kontak, alamat operasional, jam operasional harian, serta gambar banner beranda.
                    </p>
                </div>
                <a
                    href="#/manajemen"
                    data-link
                    class="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-none text-xs font-semibold border border-stone-200 dark:border-stone-700 bg-[#f6f3ec] dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:border-[#c87d32] hover:text-[#c87d32] transition flex-shrink-0"
                >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                    <span>Kembali ke Manajemen</span>
                </a>
            </div>

            <!-- Konten Pengaturan Perusahaan -->
            <div class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-6">
                <!-- Toast Notifikasi Pojok Kanan Atas -->
                <div id="mp-feedback" role="status" aria-live="polite" class="hidden fixed top-4 right-4 z-50 max-w-sm px-4 py-3 text-xs font-semibold border rounded-none shadow-lg transition-all duration-200"></div>

                <form id="mp-profil-form" class="space-y-6">
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <!-- Kolom Logo Perusahaan -->
                        <div class="bg-[#f6f3ec] dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-none p-5 flex flex-col items-center justify-between text-center">
                            <div class="w-full">
                                <div class="text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-3">
                                    Logo Perusahaan
                                </div>
                                <div class="w-28 h-28 mx-auto bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-none flex items-center justify-center overflow-hidden">
                                    <img
                                        id="mp-logo-preview"
                                        src="assets/icons/icon-192.png"
                                        alt="Preview Logo Perusahaan"
                                        class="w-full h-full object-contain"
                                    >
                                </div>
                            </div>

                            <div class="w-full mt-4 space-y-2.5 text-left">
                                <label for="mp-icon-url" class="block text-[11px] font-semibold text-stone-700 dark:text-stone-300">
                                    URL Logo Perusahaan
                                </label>
                                <input
                                    type="text"
                                    id="mp-icon-url"
                                    name="iconUrl"
                                    placeholder="https://... atau assets/icons/Logo.png"
                                    class="w-full px-3 py-2 text-xs bg-[#faf8f3] dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >

                                <label for="mp-icon-file" class="block text-[11px] font-semibold text-stone-700 dark:text-stone-300 pt-1">
                                    Upload File Logo
                                </label>
                                <input
                                    type="file"
                                    id="mp-icon-file"
                                    accept="image/*"
                                    class="w-full text-[11px] text-stone-600 dark:text-stone-300 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-none file:border file:border-stone-300 dark:file:border-stone-700 file:text-[11px] file:font-semibold file:bg-[#faf8f3] dark:file:bg-stone-800 file:text-stone-700 dark:file:text-stone-200 hover:file:border-[#c87d32] cursor-pointer"
                                >
                            </div>
                        </div>

                        <!-- Kolom Data Profil Perusahaan -->
                        <div class="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label for="mp-nama" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                    Nama Perusahaan <span class="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="mp-nama"
                                    name="nama"
                                    required
                                    placeholder="Contoh: PT Agahta Digital Nusantara"
                                    class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <div>
                                <label for="mp-bidang-usaha" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                    Bidang Usaha / Industri
                                </label>
                                <input
                                    type="text"
                                    id="mp-bidang-usaha"
                                    name="bidangUsaha"
                                    placeholder="Contoh: Layanan Digital, Perdagangan & Jasa"
                                    class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <div class="sm:col-span-2">
                                <label for="mp-tagline" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                    Tagline / Slogan Perusahaan
                                </label>
                                <input
                                    type="text"
                                    id="mp-tagline"
                                    name="tagline"
                                    placeholder="Contoh: Solusi Terpercaya untuk Pertumbuhan Bisnis Anda"
                                    class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <div>
                                <label for="mp-telepon" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                    Telepon / WhatsApp Perusahaan
                                </label>
                                <input
                                    type="text"
                                    id="mp-telepon"
                                    name="telepon"
                                    placeholder="Contoh: 0812-3456-7890"
                                    class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <div>
                                <label for="mp-email" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                    Email Perusahaan
                                </label>
                                <input
                                    type="email"
                                    id="mp-email"
                                    name="email"
                                    placeholder="info@perusahaan.co.id"
                                    class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <div class="sm:col-span-2">
                                <label for="mp-website" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                    Website Perusahaan
                                </label>
                                <input
                                    type="text"
                                    id="mp-website"
                                    name="website"
                                    placeholder="https://perusahaan.co.id"
                                    class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <!-- Jam Operasional Kantor Ala Google -->
                            <div class="sm:col-span-2 bg-[#f6f3ec] dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-none p-4 space-y-3">
                                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                    <div>
                                        <span class="block text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-100">
                                            Jam Operasional Kantor
                                        </span>
                                        <span class="block text-[11px] text-stone-500 dark:text-stone-400">
                                            Atur jam buka &amp; tutup per hari seperti pada Google Profil Bisnis.
                                        </span>
                                    </div>
                                    <div class="flex flex-wrap items-center gap-1.5">
                                        <button
                                            type="button"
                                            id="mp-jam-apply-weekdays"
                                            class="px-2.5 py-1 text-[11px] font-semibold border border-stone-300 dark:border-stone-700 bg-[#faf8f3] dark:bg-stone-900 text-stone-700 dark:text-stone-200 hover:border-[#c87d32] hover:text-[#c87d32] rounded-none transition cursor-pointer"
                                        >
                                            Samakan Sen–Jum
                                        </button>
                                        <button
                                            type="button"
                                            id="mp-jam-apply-all"
                                            class="px-2.5 py-1 text-[11px] font-semibold border border-stone-300 dark:border-stone-700 bg-[#faf8f3] dark:bg-stone-900 text-stone-700 dark:text-stone-200 hover:border-[#c87d32] hover:text-[#c87d32] rounded-none transition cursor-pointer"
                                        >
                                            Samakan Semua Hari
                                        </button>
                                    </div>
                                </div>

                                <div class="space-y-1.5">
                                    ${rowsHtml}
                                </div>

                                <div class="pt-1 flex items-center justify-between gap-2 text-[11px] text-stone-600 dark:text-stone-300 border-t border-stone-200/80 dark:border-stone-800">
                                    <span class="font-semibold text-stone-500 dark:text-stone-400 shrink-0">Ringkasan:</span>
                                    <span id="mp-jam-ringkasan" class="font-medium text-right truncate"></span>
                                </div>
                            </div>

                            <div class="sm:col-span-2">
                                <label for="mp-alamat" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                    Alamat Kantor / Operasional
                                </label>
                                <input
                                    type="text"
                                    id="mp-alamat"
                                    name="alamat"
                                    placeholder="Jalan, nomor gedung, atau lokasi kantor pusat / cabang"
                                    class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <!-- Rincian Wilayah Administratif -->
                            <div class="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                    <label for="mp-rt" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                        RT
                                    </label>
                                    <input
                                        type="text"
                                        id="mp-rt"
                                        name="rt"
                                        maxlength="5"
                                        placeholder="Contoh: 05"
                                        class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                    >
                                </div>

                                <div>
                                    <label for="mp-rw" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                        RW
                                    </label>
                                    <input
                                        type="text"
                                        id="mp-rw"
                                        name="rw"
                                        maxlength="5"
                                        placeholder="Contoh: 01"
                                        class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                    >
                                </div>

                                <div class="col-span-2">
                                    <label for="mp-desa-kelurahan" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                        DESA/KELURAHAN
                                    </label>
                                    <input
                                        type="text"
                                        id="mp-desa-kelurahan"
                                        name="desa_kelurahan"
                                        placeholder="Contoh: Srihardono"
                                        class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                    >
                                </div>
                            </div>

                            <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label for="mp-kecamatan" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                        KECAMATAN
                                    </label>
                                    <input
                                        type="text"
                                        id="mp-kecamatan"
                                        name="kecamatan"
                                        placeholder="Contoh: Pundong"
                                        class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                    >
                                </div>

                                <div>
                                    <label for="mp-kabupaten-kota" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                        KABUPATEN/KOTA
                                    </label>
                                    <input
                                        type="text"
                                        id="mp-kabupaten-kota"
                                        name="kabupaten_kota"
                                        placeholder="Contoh: Bantul"
                                        class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                    >
                                </div>

                                <div>
                                    <label for="mp-kode-pos" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                        KODE POS
                                    </label>
                                    <input
                                        type="text"
                                        id="mp-kode-pos"
                                        name="kode_pos"
                                        maxlength="10"
                                        inputmode="numeric"
                                        placeholder="Contoh: 55771"
                                        class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                    >
                                </div>
                            </div>

                            <div class="sm:col-span-2">
                                <label for="mp-provinsi" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                    PROVINSI
                                </label>
                                <input
                                    type="text"
                                    id="mp-provinsi"
                                    name="provinsi"
                                    placeholder="Contoh: Daerah Istimewa Yogyakarta"
                                    class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <div class="sm:col-span-2">
                                <label for="mp-deskripsi" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                                    Profil / Deskripsi Perusahaan
                                </label>
                                <textarea
                                    id="mp-deskripsi"
                                    name="deskripsi"
                                    rows="3"
                                    placeholder="Ringkasan profil perusahaan, produk/layanan utama, dan komitmen pelayanan..."
                                    class="w-full px-3 py-2 text-xs md:text-sm bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                ></textarea>
                            </div>
                        </div>
                    </div>

                    <!-- Bagian Gambar Banner Beranda -->
                    <div class="bg-[#f6f3ec] dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-none p-5 space-y-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <h2 class="text-xs md:text-sm font-bold uppercase tracking-wider text-stone-800 dark:text-stone-100">
                                    GAMBAR BANNER BERANDA
                                </h2>
                                <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                                    Gambar utama yang tampil di bagian banner halaman beranda perusahaan.
                                </p>
                            </div>
                            <button
                                type="button"
                                id="mp-banner-reset"
                                class="px-3 py-1 text-[11px] font-semibold text-stone-700 dark:text-stone-300 hover:text-rose-600 dark:hover:text-rose-400 border border-stone-300 dark:border-stone-700 bg-[#faf8f3] dark:bg-stone-900 rounded-none transition cursor-pointer"
                            >
                                Reset Banner
                            </button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                            <div class="md:col-span-5 h-36 bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-none overflow-hidden flex items-center justify-center">
                                <img
                                    id="mp-banner-preview"
                                    src="${DEFAULT_BANNER_PHOTO}"
                                    alt="Preview Banner Perusahaan"
                                    class="w-full h-full object-cover"
                                >
                            </div>

                            <div class="md:col-span-7 space-y-2.5">
                                <label for="mp-banner-url" class="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                                    URL Gambar Banner
                                </label>
                                <input
                                    type="text"
                                    id="mp-banner-url"
                                    name="bannerUrl"
                                    placeholder="https://... atau assets/images/banner.jpg"
                                    class="w-full px-3 py-2 text-xs bg-[#faf8f3] dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >

                                <label for="mp-banner-file" class="block text-xs font-semibold text-stone-700 dark:text-stone-300 pt-1">
                                    Upload File Gambar Banner
                                </label>
                                <input
                                    type="file"
                                    id="mp-banner-file"
                                    accept="image/*"
                                    class="w-full text-[11px] text-stone-600 dark:text-stone-300 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-none file:border file:border-stone-300 dark:file:border-stone-700 file:text-[11px] file:font-semibold file:bg-[#faf8f3] dark:file:bg-stone-800 file:text-stone-700 dark:file:text-stone-200 hover:file:border-[#c87d32] cursor-pointer"
                                >
                            </div>
                        </div>
                    </div>

                    <div class="pt-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-2.5">
                        <button
                            type="button"
                            id="mp-profil-reload"
                            class="px-4 py-2 text-xs font-semibold border border-stone-300 dark:border-stone-700 bg-[#f6f3ec] dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:border-[#c87d32] rounded-none transition cursor-pointer"
                        >
                            Muat Ulang
                        </button>
                        <button
                            type="submit"
                            id="mp-profil-save"
                            class="px-5 py-2 text-xs font-semibold bg-[#5c6d4e] hover:bg-[#4b5a3f] text-white rounded-none transition cursor-pointer"
                        >
                            Simpan Pengaturan
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

export function initManajemenPengaturanHandler() {
    let isDestroyed = false;
    let feedbackTimerId = null;

    const feedbackEl = document.getElementById("mp-feedback");
    const profilForm = document.getElementById("mp-profil-form");
    const reloadProfilBtn = document.getElementById("mp-profil-reload");
    const iconUrlInput = document.getElementById("mp-icon-url");
    const iconFileInput = document.getElementById("mp-icon-file");
    const logoPreviewImg = document.getElementById("mp-logo-preview");

    const namaInput = document.getElementById("mp-nama");
    const bidangUsahaInput = document.getElementById("mp-bidang-usaha");
    const taglineInput = document.getElementById("mp-tagline");
    const teleponInput = document.getElementById("mp-telepon");
    const emailInput = document.getElementById("mp-email");
    const websiteInput = document.getElementById("mp-website");
    const jamRingkasanEl = document.getElementById("mp-jam-ringkasan");
    const applyWeekdaysBtn = document.getElementById("mp-jam-apply-weekdays");
    const applyAllDaysBtn = document.getElementById("mp-jam-apply-all");

    const alamatInput = document.getElementById("mp-alamat");
    const rtInput = document.getElementById("mp-rt");
    const rwInput = document.getElementById("mp-rw");
    const desaKelurahanInput = document.getElementById("mp-desa-kelurahan");
    const kecamatanInput = document.getElementById("mp-kecamatan");
    const kabupatenKotaInput = document.getElementById("mp-kabupaten-kota");
    const kodePosInput = document.getElementById("mp-kode-pos");
    const provinsiInput = document.getElementById("mp-provinsi");
    const deskripsiInput = document.getElementById("mp-deskripsi");

    const bannerUrlInput = document.getElementById("mp-banner-url");
    const bannerFileInput = document.getElementById("mp-banner-file");
    const bannerPreviewImg = document.getElementById("mp-banner-preview");
    const bannerResetBtn = document.getElementById("mp-banner-reset");

    function syncDayRowUI(dayKey) {
        const modeSelect = document.querySelector(`[data-jam-mode="${dayKey}"]`);
        const openInput = document.querySelector(`[data-jam-open="${dayKey}"]`);
        const closeInput = document.querySelector(`[data-jam-close="${dayKey}"]`);
        const badgeEl = document.querySelector(`[data-jam-badge="${dayKey}"]`);
        if (!modeSelect || !openInput || !closeInput) return;

        const mode = modeSelect.value;
        const isTimeEditable = mode === "buka";
        openInput.disabled = !isTimeEditable;
        closeInput.disabled = !isTimeEditable;
        openInput.classList.toggle("hidden", !isTimeEditable);
        closeInput.classList.toggle("hidden", !isTimeEditable);

        if (badgeEl) {
            if (mode === "24jam") {
                badgeEl.textContent = "Buka 24 jam";
                badgeEl.classList.remove("hidden");
            } else if (mode === "tutup") {
                badgeEl.textContent = "Tutup";
                badgeEl.classList.remove("hidden");
            } else {
                badgeEl.classList.add("hidden");
            }
        }
    }

    function readScheduleFromDom() {
        return HARI_OPERASIONAL.map((h) => {
            const modeSelect = document.querySelector(`[data-jam-mode="${h.key}"]`);
            const openInput = document.querySelector(`[data-jam-open="${h.key}"]`);
            const closeInput = document.querySelector(`[data-jam-close="${h.key}"]`);
            return {
                hari: h.key,
                label: h.label,
                mode: modeSelect?.value || h.defaultMode,
                buka: normalizeTimeHHMM(openInput?.value, h.defaultOpen),
                tutup: normalizeTimeHHMM(closeInput?.value, h.defaultClose)
            };
        });
    }

    function updateJamSummaryPreview() {
        if (!jamRingkasanEl) return;
        const current = readScheduleFromDom();
        jamRingkasanEl.textContent = formatScheduleSummary(current);
    }

    function applyScheduleToDom(scheduleList) {
        const normalized = normalizeScheduleList(scheduleList);
        normalized.forEach((item) => {
            const modeSelect = document.querySelector(`[data-jam-mode="${item.hari}"]`);
            const openInput = document.querySelector(`[data-jam-open="${item.hari}"]`);
            const closeInput = document.querySelector(`[data-jam-close="${item.hari}"]`);

            if (modeSelect) modeSelect.value = item.mode;
            if (openInput) openInput.value = item.buka;
            if (closeInput) closeInput.value = item.tutup;
            syncDayRowUI(item.hari);
        });
        updateJamSummaryPreview();
    }

    function copyScheduleFromDay(sourceKey, targetKeys) {
        const srcMode = document.querySelector(`[data-jam-mode="${sourceKey}"]`)?.value || "buka";
        const srcOpen = normalizeTimeHHMM(document.querySelector(`[data-jam-open="${sourceKey}"]`)?.value, "08:00");
        const srcClose = normalizeTimeHHMM(document.querySelector(`[data-jam-close="${sourceKey}"]`)?.value, "17:00");

        targetKeys.forEach((targetKey) => {
            const modeSelect = document.querySelector(`[data-jam-mode="${targetKey}"]`);
            const openInput = document.querySelector(`[data-jam-open="${targetKey}"]`);
            const closeInput = document.querySelector(`[data-jam-close="${targetKey}"]`);
            if (modeSelect) modeSelect.value = srcMode;
            if (openInput) openInput.value = srcOpen;
            if (closeInput) closeInput.value = srcClose;
            syncDayRowUI(targetKey);
        });
        updateJamSummaryPreview();
        showFeedback("Jam operasional berhasil disamakan.");
    }

    function showFeedback(message, type = "success", durationMs = FEEDBACK_AUTO_HIDE_MS) {
        if (!feedbackEl || isDestroyed) return;
        if (feedbackTimerId !== null) {
            window.clearTimeout(feedbackTimerId);
            feedbackTimerId = null;
        }

        feedbackEl.className =
            type === "error"
                ? "fixed top-4 right-4 z-50 max-w-sm px-4 py-3 text-xs font-semibold border rounded-none shadow-lg transition-all duration-200 bg-rose-50 dark:bg-rose-950/90 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                : "fixed top-4 right-4 z-50 max-w-sm px-4 py-3 text-xs font-semibold border rounded-none shadow-lg transition-all duration-200 bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300";
        feedbackEl.textContent = message;
        feedbackEl.classList.remove("hidden");

        if (durationMs > 0) {
            feedbackTimerId = window.setTimeout(() => {
                feedbackTimerId = null;
                feedbackEl?.classList.add("hidden");
            }, durationMs);
        }
    }

    function hideFeedback() {
        if (feedbackTimerId !== null) {
            window.clearTimeout(feedbackTimerId);
            feedbackTimerId = null;
        }
        feedbackEl?.classList.add("hidden");
    }

    function syncBannerPreview(urlValue = "") {
        if (!bannerPreviewImg) return;
        const clean = String(urlValue || "").trim();
        bannerPreviewImg.src = isSafeImageSrc(clean) ? clean : DEFAULT_BANNER_PHOTO;
    }

    async function loadProfil() {
        try {
            const snap = await getDoc(PROFILE_DOC_REF);
            const data = snap.exists() ? { ...DEFAULT_PROFILE, ...snap.data() } : { ...DEFAULT_PROFILE };
            const resolvedLogo = data.iconUrl || data.logo || "assets/icons/icon-192.png";
            const resolvedBanner = data.bannerUrl || data.banner || "";
            const legacyJam = data.jamOperasional || data.jam_operasional || "";

            if (isDestroyed) return;
            if (namaInput) namaInput.value = data.nama || "";
            if (bidangUsahaInput) bidangUsahaInput.value = data.bidangUsaha || data.bidang_usaha || "";
            if (taglineInput) taglineInput.value = data.tagline || "";
            if (teleponInput) teleponInput.value = data.telepon || "";
            if (emailInput) emailInput.value = data.email || "";
            if (websiteInput) websiteInput.value = data.website || "";

            applyScheduleToDom(data.jadwalOperasional || data.jadwal_operasional, legacyJam);

            if (alamatInput) alamatInput.value = data.alamat || "";
            if (rtInput) rtInput.value = data.rt || "";
            if (rwInput) rwInput.value = data.rw || "";
            if (desaKelurahanInput) desaKelurahanInput.value = data.desa_kelurahan || data.desaKelurahan || "";
            if (kecamatanInput) kecamatanInput.value = data.kecamatan || "";
            if (kabupatenKotaInput) kabupatenKotaInput.value = data.kabupaten_kota || data.kabupatenKota || "";
            if (kodePosInput) kodePosInput.value = data.kode_pos || data.kodePos || "";
            if (provinsiInput) provinsiInput.value = data.provinsi || "";
            if (deskripsiInput) deskripsiInput.value = data.deskripsi || "";
            if (iconUrlInput) iconUrlInput.value = data.iconUrl || data.logo || "";
            if (logoPreviewImg) {
                logoPreviewImg.src = isSafeImageSrc(resolvedLogo) ? resolvedLogo : "assets/icons/icon-192.png";
            }
            if (bannerUrlInput) {
                bannerUrlInput.value = resolvedBanner;
            }
            syncBannerPreview(resolvedBanner);
        } catch (err) {
            console.error("Gagal memuat profil perusahaan:", err);
            showFeedback("Gagal memuat data profil perusahaan.", "error");
        }
    }

    async function handleSaveProfil(e) {
        e.preventDefault();
        hideFeedback();

        const nama = (namaInput?.value || "").trim();
        if (!nama) {
            showFeedback("Nama perusahaan wajib diisi.", "error");
            namaInput?.focus();
            return;
        }

        const jadwalOperasional = readScheduleFromDom();
        const jamOperasional = formatScheduleSummary(jadwalOperasional);
        const bannerVal = (bannerUrlInput?.value || "").trim();

        const payload = {
            nama,
            bidangUsaha: (bidangUsahaInput?.value || "").trim(),
            tagline: (taglineInput?.value || "").trim(),
            telepon: (teleponInput?.value || "").trim(),
            email: (emailInput?.value || "").trim(),
            website: (websiteInput?.value || "").trim(),
            jamOperasional,
            jadwalOperasional,
            alamat: (alamatInput?.value || "").trim(),
            rt: (rtInput?.value || "").trim(),
            rw: (rwInput?.value || "").trim(),
            desa_kelurahan: (desaKelurahanInput?.value || "").trim(),
            kecamatan: (kecamatanInput?.value || "").trim(),
            kabupaten_kota: (kabupatenKotaInput?.value || "").trim(),
            kode_pos: (kodePosInput?.value || "").trim(),
            provinsi: (provinsiInput?.value || "").trim(),
            deskripsi: (deskripsiInput?.value || "").trim(),
            iconUrl: (iconUrlInput?.value || "").trim(),
            bannerUrl: bannerVal,
            updatedAt: new Date().toISOString()
        };

        try {
            await setDoc(PROFILE_DOC_REF, payload, { merge: true });
            if (typeof window.reloadCompanyProfile === "function") {
                await window.reloadCompanyProfile();
            }
            showFeedback("Pengaturan profil perusahaan berhasil disimpan.");
        } catch (err) {
            console.error("Gagal menyimpan profil perusahaan:", err);
            showFeedback("Gagal menyimpan pengaturan perusahaan.", "error");
        }
    }

    const onScheduleChange = (e) => {
        const modeSelect = e.target.closest("[data-jam-mode]");
        if (modeSelect) {
            const key = modeSelect.getAttribute("data-jam-mode");
            syncDayRowUI(key);
            updateJamSummaryPreview();
            return;
        }
        if (e.target.closest("[data-jam-open]") || e.target.closest("[data-jam-close]")) {
            updateJamSummaryPreview();
        }
    };

    const onApplyWeekdays = () => {
        copyScheduleFromDay("senin", ["selasa", "rabu", "kamis", "jumat"]);
    };

    const onApplyAllDays = () => {
        copyScheduleFromDay("senin", ["selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"]);
    };

    const onIconUrlInput = () => {
        if (!logoPreviewImg || !iconUrlInput) return;
        const val = iconUrlInput.value.trim();
        logoPreviewImg.src = isSafeImageSrc(val) ? val : "assets/icons/icon-192.png";
    };

    const onIconFileChange = async () => {
        const file = iconFileInput?.files?.[0];
        if (!file) return;
        try {
            const dataUrl = await compressImageFile(file, 512, 512, 0.8);
            if (iconUrlInput) iconUrlInput.value = dataUrl;
            if (logoPreviewImg) logoPreviewImg.src = dataUrl;
        } catch (err) {
            console.error(err);
            showFeedback("Gagal membaca file logo.", "error");
        }
    };

    const onBannerUrlInput = () => {
        syncBannerPreview(bannerUrlInput?.value || "");
    };

    const onBannerFileChange = async () => {
        const file = bannerFileInput?.files?.[0];
        if (!file) return;
        try {
            const compressedDataUrl = await compressImageFile(file, 1024, 600, 0.76);
            if (bannerUrlInput) bannerUrlInput.value = compressedDataUrl;
            syncBannerPreview(compressedDataUrl);
        } catch (err) {
            console.error(err);
            showFeedback("Gagal memproses gambar banner.", "error");
        }
    };

    const onBannerReset = () => {
        if (bannerUrlInput) bannerUrlInput.value = "";
        if (bannerFileInput) bannerFileInput.value = "";
        syncBannerPreview("");
    };

    profilForm?.addEventListener("submit", handleSaveProfil);
    profilForm?.addEventListener("change", onScheduleChange);
    reloadProfilBtn?.addEventListener("click", loadProfil);
    applyWeekdaysBtn?.addEventListener("click", onApplyWeekdays);
    applyAllDaysBtn?.addEventListener("click", onApplyAllDays);
    iconUrlInput?.addEventListener("input", onIconUrlInput);
    iconFileInput?.addEventListener("change", onIconFileChange);

    bannerUrlInput?.addEventListener("input", onBannerUrlInput);
    bannerFileInput?.addEventListener("change", onBannerFileChange);
    bannerResetBtn?.addEventListener("click", onBannerReset);

    HARI_OPERASIONAL.forEach((h) => syncDayRowUI(h.key));
    updateJamSummaryPreview();
    loadProfil();

    return () => {
        isDestroyed = true;
        if (feedbackTimerId !== null) {
            window.clearTimeout(feedbackTimerId);
            feedbackTimerId = null;
        }
        profilForm?.removeEventListener("submit", handleSaveProfil);
        profilForm?.removeEventListener("change", onScheduleChange);
        reloadProfilBtn?.removeEventListener("click", loadProfil);
        applyWeekdaysBtn?.removeEventListener("click", onApplyWeekdays);
        applyAllDaysBtn?.removeEventListener("click", onApplyAllDays);
        iconUrlInput?.removeEventListener("input", onIconUrlInput);
        iconFileInput?.removeEventListener("change", onIconFileChange);

        bannerUrlInput?.removeEventListener("input", onBannerUrlInput);
        bannerFileInput?.removeEventListener("change", onBannerFileChange);
        bannerResetBtn?.removeEventListener("click", onBannerReset);
    };
}

export default renderManajemenPengaturan;