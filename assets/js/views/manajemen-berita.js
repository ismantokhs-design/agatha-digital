// File: assets/js/views/manajemen-jasa.js
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from "../firebase-init.js";

const JASA_COLLECTION = "berita";
const DEFAULT_JASA_IMAGE = "assets/icons/Logo.png";
const FEEDBACK_AUTO_HIDE_MS = 3500;
const ITEMS_PER_PAGE = 5;

function escapeHtml(value = "") {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function normalizeStatus(data = {}) {
    if (typeof data.aktif === "boolean") {
        return data.aktif ? "Aktif" : "Nonaktif";
    }
    const raw = String(data.status || "").trim();
    const lower = raw.toLowerCase();
    if (lower === "aktif" || lower === "active" || lower === "published" || lower === "true") return "Aktif";
    if (lower === "nonaktif" || lower === "inactive" || lower === "draft" || lower === "false") return "Nonaktif";
    return raw || "Aktif";
}

function normalizeJenis(data = {}) {
    const raw = String(data.jenis || data.kategori || data.tipe || "").trim().toLowerCase();
    if (raw.includes("paket") || raw.includes("layanan") || raw.includes("jasa") || raw.includes("agenda") || raw.includes("kegiatan") || raw.includes("event")) {
        return "Layanan";
    }
    return "Jasa";
}

function getTodayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function compressImageFile(file, maxWidth = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith("image/")) {
            reject(new Error("File harus berupa gambar."));
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                const output = canvas.toDataURL("image/jpeg", quality);
                resolve(output);
            };
            img.onerror = () => reject(new Error("Gagal memproses gambar."));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
        reader.readAsDataURL(file);
    });
}

export function renderManajemenJasa() {
    return `
        <div class="w-full space-y-5">
            <!-- Header Halaman -->
            <div class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2">
                        <a href="#/manajemen" data-link data-route="manajemen" class="px-2.5 py-1 text-xs font-semibold bg-[#f6f3ec] dark:bg-stone-800 hover:border-[#c87d32] hover:text-[#c87d32] text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-none transition">
                            ← Kembali
                        </a>
                        <h1 class="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-snug">
                            Manajemen Jasa Layanan
                        </h1>
                    </div>
                    <p id="manajemen-jasa-summary" class="text-xs text-stone-600 dark:text-stone-400 mt-1.5">
                        Kelola daftar jasa, paket layanan, dan informasi pelayanan.
                    </p>
                </div>

                <button
                    type="button"
                    id="btn-reset-jasa-form"
                    class="px-3.5 py-2 text-xs font-semibold bg-[#5c6d4e] hover:bg-[#4b5a3f] text-white rounded-none transition cursor-pointer flex-shrink-0"
                >
                    + Jasa / Layanan Baru
                </button>
            </div>

            <!-- Toast Feedback Pojok Kanan Atas -->
            <div id="jasa-form-feedback" role="status" aria-live="polite" class="hidden fixed top-4 right-4 z-50 max-w-sm text-xs px-4 py-3 border rounded-none shadow-lg transition-all duration-200"></div>

            <!-- Form Input / Edit Jasa Layanan (Tersembunyi hingga tombol diklik) -->
            <section id="jasa-form-panel" class="hidden bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-4 sm:p-6 space-y-4">
                <div class="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
                    <div class="flex items-center gap-2">
                        <h2 id="jasa-form-heading" class="text-sm font-bold text-stone-900 dark:text-stone-100">
                            Tambah Jasa / Layanan Baru
                        </h2>
                        <span id="jasa-editing-badge" class="hidden px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-none">
                            Mode Edit
                        </span>
                    </div>
                    <button
                        type="button"
                        id="btn-tutup-form-jasa"
                        class="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 cursor-pointer"
                    >
                        Tutup Form
                    </button>
                </div>

                <form id="form-manajemen-jasa" class="space-y-4">
                    <input type="hidden" id="jasa-edit-id" value="">

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <!-- Jenis -->
                        <div>
                            <label for="jasa-jenis" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                Jenis *
                            </label>
                            <select
                                id="jasa-jenis"
                                class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                            >
                                <option value="Jasa">Jasa</option>
                                <option value="Layanan">Layanan</option>
                            </select>
                        </div>

                        <!-- Tanggal -->
                        <div>
                            <label for="jasa-tanggal" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                Tanggal
                            </label>
                            <input
                                type="date"
                                id="jasa-tanggal"
                                class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                            >
                        </div>

                        <!-- Status -->
                        <div>
                            <label for="jasa-status" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                Status
                            </label>
                            <select
                                id="jasa-status"
                                class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                            >
                                <option value="Aktif">Aktif</option>
                                <option value="Nonaktif">Nonaktif</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        <!-- Judul -->
                        <div class="md:col-span-2">
                            <label for="jasa-judul" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                Nama Jasa / Layanan *
                            </label>
                            <input
                                type="text"
                                id="jasa-judul"
                                required
                                placeholder="Contoh: Pembuatan Website Profil atau Layanan Konsultasi Sistem"
                                class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-[#c87d32]"
                            >
                        </div>

                        <!-- Penanggung Jawab -->
                        <div>
                            <label for="jasa-penulis" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                Penanggung Jawab
                            </label>
                            <input
                                type="text"
                                id="jasa-penulis"
                                placeholder="Nama petugas atau admin"
                                class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-[#c87d32]"
                            >
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <!-- Estimasi Waktu / Jam -->
                        <div>
                            <label for="jasa-waktu" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                Estimasi Waktu / Jam (Opsional)
                            </label>
                            <input
                                type="text"
                                id="jasa-waktu"
                                placeholder="Contoh: 08.00 - 17.00 WIB atau 3-5 hari kerja"
                                class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-[#c87d32]"
                            >
                        </div>

                        <!-- Lokasi / Area Layanan -->
                        <div>
                            <label for="jasa-lokasi" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                Lokasi / Area Layanan (Opsional)
                            </label>
                            <input
                                type="text"
                                id="jasa-lokasi"
                                placeholder="Contoh: Kantor Layanan atau Online / Area Bantul"
                                class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-[#c87d32]"
                            >
                        </div>
                    </div>

                    <!-- Ringkasan Singkat -->
                    <div>
                        <label for="jasa-ringkasan" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                            Ringkasan Singkat
                        </label>
                        <input
                            type="text"
                            id="jasa-ringkasan"
                            placeholder="Ringkasan 1-2 kalimat untuk tampilan tabel..."
                            class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-[#c87d32]"
                        >
                    </div>

                    <!-- Deskripsi / Rincian Jasa Layanan -->
                    <div>
                        <label for="jasa-isi" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                            Deskripsi / Rincian Jasa Layanan *
                        </label>
                        <textarea
                            id="jasa-isi"
                            rows="5"
                            required
                            placeholder="Tulis rincian jasa, cakupan layanan, atau ketentuan pelayanan di sini..."
                            class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-[#c87d32] leading-relaxed"
                        ></textarea>
                    </div>

                    <!-- Upload Gambar & URL Gambar -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                        <div class="md:col-span-2 space-y-3">
                            <div>
                                <label for="jasa-file" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                    Upload Gambar
                                </label>
                                <input
                                    type="file"
                                    id="jasa-file"
                                    accept="image/*"
                                    class="block w-full text-xs text-stone-600 dark:text-stone-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-none file:border file:border-stone-300 dark:file:border-stone-700 file:text-xs file:font-semibold file:bg-[#f6f3ec] dark:file:bg-stone-800 file:text-stone-700 dark:file:text-stone-200 hover:file:border-[#c87d32] cursor-pointer"
                                >
                            </div>

                            <div>
                                <label for="jasa-gambar-url" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                    Atau URL / Data Gambar
                                </label>
                                <input
                                    type="text"
                                    id="jasa-gambar-url"
                                    placeholder="https://... atau biarkan kosong untuk gambar default"
                                    class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>
                        </div>

                        <div class="bg-[#f6f3ec] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-none p-2.5 flex flex-col items-center justify-center">
                            <div class="w-full h-32 bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden flex items-center justify-center">
                                <img
                                    id="jasa-preview-img"
                                    src="${DEFAULT_JASA_IMAGE}"
                                    alt="Preview Gambar Jasa Layanan"
                                    class="w-full h-full object-cover rounded-none"
                                    onerror="this.onerror=null;this.src='${DEFAULT_JASA_IMAGE}';"
                                >
                            </div>
                            <span class="text-[10px] text-stone-500 dark:text-stone-400 mt-1.5">
                                Preview Gambar Jasa Layanan
                            </span>
                        </div>
                    </div>

                    <!-- Tombol Aksi Form -->
                    <div class="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-stone-200 dark:border-stone-800">
                        <button
                            type="button"
                            id="btn-batal-edit-jasa"
                            class="hidden px-4 py-2 text-xs font-semibold bg-[#f6f3ec] dark:bg-stone-800 hover:border-[#c87d32] hover:text-[#c87d32] text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-none transition cursor-pointer"
                        >
                            Batal Edit
                        </button>
                        <button
                            type="submit"
                            id="btn-simpan-jasa"
                            class="px-5 py-2 text-xs font-bold bg-[#5c6d4e] hover:bg-[#4b5a3f] text-white rounded-none transition cursor-pointer"
                        >
                            Simpan Jasa / Layanan
                        </button>
                    </div>
                </form>
            </section>

            <!-- Filter, Aksi Massal & Tabel Jasa Layanan -->
            <section class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-4 sm:p-6 space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div class="flex flex-wrap items-center gap-2">
                        <label for="filter-jasa-jenis" class="sr-only">Filter jenis</label>
                        <select
                            id="filter-jasa-jenis"
                            class="px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                        >
                            <option value="all">Semua Jenis</option>
                            <option value="Jasa">Jasa</option>
                            <option value="Layanan">Layanan</option>
                        </select>

                        <button
                            type="button"
                            id="btn-hapus-terpilih-jasa"
                            class="hidden inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/70 rounded-none transition cursor-pointer"
                        >
                            <span>Hapus Terpilih</span>
                            <span id="jasa-selected-count" class="px-1.5 py-0.5 text-[10px] font-bold bg-rose-600 text-white rounded-none">0</span>
                        </button>
                    </div>

                    <div class="w-full sm:w-72">
                        <label for="filter-jasa-search" class="sr-only">Cari jasa atau layanan</label>
                        <input
                            type="text"
                            id="filter-jasa-search"
                            placeholder="Cari nama jasa, layanan, lokasi, atau deskripsi..."
                            class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-[#c87d32]"
                        >
                    </div>
                </div>

                <div class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead class="bg-[#f6f3ec] dark:bg-stone-950/60 border-b border-stone-200 dark:border-stone-800 text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                                <tr>
                                    <th class="px-4 py-3 w-11 text-center">
                                        <input
                                            type="checkbox"
                                            id="jasa-select-all"
                                            class="w-4 h-4 rounded-none border-stone-300 dark:border-stone-700 cursor-pointer align-middle"
                                        >
                                    </th>
                                    <th class="px-4 py-3 w-28">Gambar</th>
                                    <th class="px-4 py-3">Jasa / Layanan &amp; Detail</th>
                                    <th class="px-4 py-3">Ringkasan / Deskripsi</th>
                                    <th class="px-4 py-3 text-right w-36">Aksi</th>
                                </tr>
                            </thead>
                            <tbody id="manajemen-jasa-list" class="divide-y divide-stone-200 dark:divide-stone-800 text-xs text-stone-800 dark:text-stone-200">
                                <tr>
                                    <td colspan="5" class="p-8 text-center text-xs text-stone-500 dark:text-stone-400">
                                        Memuat daftar jasa layanan...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Footer Paginasi -->
                    <div id="jasa-pagination-bar" class="px-4 py-3 border-t border-stone-200 dark:border-stone-800 bg-[#faf8f3] dark:bg-stone-900 flex items-center justify-end gap-2 text-xs">
                        <button
                            type="button"
                            id="jasa-prev-page"
                            class="px-2.5 py-1 border border-transparent hover:border-stone-300 dark:hover:border-stone-700 rounded-none text-stone-600 dark:text-stone-300 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                            &lt; Previous
                        </button>
                        <span
                            id="jasa-page-indicator"
                            class="px-2.5 py-1 border border-stone-300 dark:border-stone-700 bg-[#f6f3ec] dark:bg-stone-800 font-semibold text-stone-900 dark:text-stone-100 rounded-none"
                        >
                            1
                        </span>
                        <button
                            type="button"
                            id="jasa-next-page"
                            class="px-2.5 py-1 border border-transparent hover:border-stone-300 dark:hover:border-stone-700 rounded-none text-stone-600 dark:text-stone-300 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                            Next &gt;
                        </button>
                    </div>
                </div>
            </section>
        </div>
    `;
}

export async function initManajemenJasaHandler() {
    let isDestroyed = false;
    let allItems = [];
    const selectedIds = new Set();
    let currentPage = 1;
    let currentImageData = "";
    let feedbackTimerId = null;

    const formPanel = document.getElementById("jasa-form-panel");
    const formEl = document.getElementById("form-manajemen-jasa");
    const editIdInput = document.getElementById("jasa-edit-id");
    const formHeading = document.getElementById("jasa-form-heading");
    const editingBadge = document.getElementById("jasa-editing-badge");
    const resetBtn = document.getElementById("btn-reset-jasa-form");
    const closeFormBtn = document.getElementById("btn-tutup-form-jasa");
    const cancelEditBtn = document.getElementById("btn-batal-edit-jasa");
    const submitBtn = document.getElementById("btn-simpan-jasa");
    const feedbackEl = document.getElementById("jasa-form-feedback");

    const jenisSelect = document.getElementById("jasa-jenis");
    const tanggalInput = document.getElementById("jasa-tanggal");
    const statusSelect = document.getElementById("jasa-status");
    const judulInput = document.getElementById("jasa-judul");
    const penulisInput = document.getElementById("jasa-penulis");
    const waktuInput = document.getElementById("jasa-waktu");
    const lokasiInput = document.getElementById("jasa-lokasi");
    const ringkasanInput = document.getElementById("jasa-ringkasan");
    const isiTextarea = document.getElementById("jasa-isi");
    const fileInput = document.getElementById("jasa-file");
    const gambarUrlInput = document.getElementById("jasa-gambar-url");
    const previewImg = document.getElementById("jasa-preview-img");

    const searchInput = document.getElementById("filter-jasa-search");
    const filterJenisSelect = document.getElementById("filter-jasa-jenis");
    const bulkDeleteBtn = document.getElementById("btn-hapus-terpilih-jasa");
    const selectedCountEl = document.getElementById("jasa-selected-count");
    const selectAllCheckbox = document.getElementById("jasa-select-all");
    const listEl = document.getElementById("manajemen-jasa-list");
    const summaryEl = document.getElementById("manajemen-jasa-summary");
    const prevPageBtn = document.getElementById("jasa-prev-page");
    const nextPageBtn = document.getElementById("jasa-next-page");
    const pageIndicatorEl = document.getElementById("jasa-page-indicator");

    if (typeof window.syncRunningTextPosition === "function") {
        window.syncRunningTextPosition(false);
    }

    function hideFeedback() {
        if (feedbackTimerId !== null) {
            window.clearTimeout(feedbackTimerId);
            feedbackTimerId = null;
        }
        if (feedbackEl) {
            feedbackEl.classList.add("hidden");
            feedbackEl.textContent = "";
        }
    }

    function showFeedback(message, type = "info", durationMs = FEEDBACK_AUTO_HIDE_MS) {
        if (!feedbackEl || isDestroyed) return;
        if (feedbackTimerId !== null) {
            window.clearTimeout(feedbackTimerId);
            feedbackTimerId = null;
        }

        const styles = {
            info: "bg-[#faf8f3] dark:bg-stone-900 text-stone-800 dark:text-stone-100 border-stone-300 dark:border-stone-700",
            success: "bg-emerald-50 dark:bg-emerald-950/90 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
            error: "bg-rose-50 dark:bg-rose-950/90 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
        };
        feedbackEl.className = `fixed top-4 right-4 z-50 max-w-sm text-xs px-4 py-3 border rounded-none shadow-lg transition-all duration-200 font-semibold ${styles[type] || styles.info}`;
        feedbackEl.textContent = message;
        feedbackEl.classList.remove("hidden");

        if (durationMs > 0) {
            feedbackTimerId = window.setTimeout(() => {
                feedbackTimerId = null;
                feedbackEl?.classList.add("hidden");
            }, durationMs);
        }
    }

    function syncBulkDeleteUI(pageItems = []) {
        const count = selectedIds.size;
        if (selectedCountEl) {
            selectedCountEl.textContent = `${count}`;
        }
        if (bulkDeleteBtn) {
            bulkDeleteBtn.classList.toggle("hidden", count === 0);
        }
        if (selectAllCheckbox) {
            selectAllCheckbox.checked =
                pageItems.length > 0 && pageItems.every((item) => selectedIds.has(String(item.id)));
        }
    }

    function updatePreviewImage(src = "") {
        if (!previewImg) return;
        const trimmed = String(src || "").trim();
        previewImg.src = trimmed || DEFAULT_JASA_IMAGE;
    }

    function resetForm() {
        if (editIdInput) editIdInput.value = "";
        if (formHeading) formHeading.textContent = "Tambah Jasa / Layanan Baru";
        if (editingBadge) editingBadge.classList.add("hidden");
        if (cancelEditBtn) cancelEditBtn.classList.add("hidden");
        if (submitBtn) submitBtn.textContent = "Simpan Jasa / Layanan";

        if (jenisSelect) jenisSelect.value = "Jasa";
        if (tanggalInput) tanggalInput.value = getTodayDateString();
        if (statusSelect) statusSelect.value = "Aktif";
        if (judulInput) judulInput.value = "";

        const user = auth.currentUser;
        const defaultAuthor = localStorage.getItem("user_name") || user?.displayName || (user?.email ? user.email.split("@")[0] : "");
        if (penulisInput) penulisInput.value = defaultAuthor;

        if (waktuInput) waktuInput.value = "";
        if (lokasiInput) lokasiInput.value = "";
        if (ringkasanInput) ringkasanInput.value = "";
        if (isiTextarea) isiTextarea.value = "";
        if (fileInput) fileInput.value = "";
        if (gambarUrlInput) gambarUrlInput.value = "";

        currentImageData = "";
        updatePreviewImage("");
        hideFeedback();
    }

    function openFormPanel(item = null) {
        formPanel?.classList.remove("hidden");
        if (item) {
            fillFormForEdit(item);
        } else {
            resetForm();
            judulInput?.focus();
        }
    }

    function closeFormPanel() {
        formPanel?.classList.add("hidden");
        resetForm();
    }

    function onNewButtonClick() {
        const isHidden = formPanel?.classList.contains("hidden");
        const isEditing = Boolean(String(editIdInput?.value || "").trim());
        if (isHidden || isEditing) {
            openFormPanel(null);
        } else {
            closeFormPanel();
        }
    }

    function fillFormForEdit(item) {
        if (!item) return;
        formPanel?.classList.remove("hidden");

        if (editIdInput) editIdInput.value = item.id;
        if (formHeading) formHeading.textContent = `Edit ${normalizeJenis(item)}: ${item.judul || ""}`;
        if (editingBadge) editingBadge.classList.remove("hidden");
        if (cancelEditBtn) cancelEditBtn.classList.remove("hidden");
        if (submitBtn) submitBtn.textContent = "Perbarui Jasa / Layanan";

        if (jenisSelect) jenisSelect.value = normalizeJenis(item);
        if (tanggalInput) tanggalInput.value = item.tanggal || getTodayDateString();
        if (statusSelect) statusSelect.value = normalizeStatus(item);
        if (judulInput) judulInput.value = item.judul || "";
        if (penulisInput) penulisInput.value = item.penulis || "";
        if (waktuInput) waktuInput.value = item.waktu || item.jam || "";
        if (lokasiInput) lokasiInput.value = item.lokasi || item.tempat || "";
        if (ringkasanInput) ringkasanInput.value = item.ringkasan || "";
        if (isiTextarea) isiTextarea.value = item.isi || item.konten || item.deskripsi || "";

        const imgVal = String(item.gambar || item.foto || "").trim();
        currentImageData = imgVal.startsWith("data:image/") ? imgVal : "";
        if (gambarUrlInput) gambarUrlInput.value = imgVal.startsWith("data:image/") ? "" : imgVal;
        if (fileInput) fileInput.value = "";

        updatePreviewImage(imgVal);
        hideFeedback();
        formPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
        judulInput?.focus();
    }

    function renderJasaRow(item) {
        const judulSafe = escapeHtml(item.judul || "Tanpa Judul");
        const ringkasanSafe = escapeHtml(item.ringkasan || item.isi || item.konten || "-");
        const jenisLabel = normalizeJenis(item);
        const jenisSafe = escapeHtml(jenisLabel);
        const isLayanan = jenisLabel === "Layanan";

        const tanggalSafe = escapeHtml(item.tanggal || "-");
        const waktuStr = String(item.waktu || item.jam || "").trim();
        const lokasiStr = String(item.lokasi || item.tempat || "").trim();
        const penulisSafe = escapeHtml(item.penulis || "-");
        const statusLabel = normalizeStatus(item);
        const statusSafe = escapeHtml(statusLabel);
        const isActive = statusLabel.toLowerCase() === "aktif";
        const imgSrc = escapeHtml(String(item.gambar || item.foto || "").trim() || DEFAULT_JASA_IMAGE);
        const idSafe = escapeHtml(item.id);
        const checkedAttr = selectedIds.has(String(item.id)) ? "checked" : "";

        const jenisBadgeClass = isLayanan
            ? "bg-[#c87d32] text-white border-[#b06d29]"
            : "bg-[#5c6d4e] text-white border-[#4b5a3f]";

        const statusBadgeClass = isActive
            ? "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
            : "bg-[#f6f3ec] dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-300 dark:border-stone-700";

        const metaExtra = [
            waktuStr ? `🕒 ${escapeHtml(waktuStr)}` : "",
            lokasiStr ? `📍 ${escapeHtml(lokasiStr)}` : "",
            penulisSafe !== "-" ? `✍️ ${penulisSafe}` : ""
        ].filter(Boolean).join(" • ");

        return `
            <tr class="hover:bg-[#f6f3ec]/60 dark:hover:bg-stone-800/40 transition">
                <td class="px-4 py-3 align-middle text-center">
                    <input
                        type="checkbox"
                        data-jasa-check="${idSafe}"
                        ${checkedAttr}
                        class="w-4 h-4 rounded-none border-stone-300 dark:border-stone-700 cursor-pointer align-middle"
                    >
                </td>
                <td class="px-4 py-3 align-middle">
                    <div class="w-24 h-12 bg-[#f6f3ec] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-none overflow-hidden flex items-center justify-center">
                        <img
                            src="${imgSrc}"
                            alt="${judulSafe}"
                            class="w-full h-full object-cover rounded-none"
                            onerror="this.onerror=null;this.src='${DEFAULT_JASA_IMAGE}';"
                        >
                    </div>
                </td>
                <td class="px-4 py-3 align-middle">
                    <div class="font-bold text-stone-900 dark:text-stone-100 leading-snug">
                        ${judulSafe}
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                        <span class="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-none ${jenisBadgeClass}">
                            ${jenisSafe}
                        </span>
                        <span class="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-none ${statusBadgeClass}">
                            ${statusSafe}
                        </span>
                        <span>${tanggalSafe}</span>
                    </div>
                    ${metaExtra ? `<div class="text-[11px] text-stone-500 dark:text-stone-400 mt-1 line-clamp-1">${metaExtra}</div>` : ""}
                </td>
                <td class="px-4 py-3 align-middle text-stone-700 dark:text-stone-300 max-w-md">
                    <p class="line-clamp-2 leading-relaxed">${ringkasanSafe}</p>
                </td>
                <td class="px-4 py-3 align-middle text-right whitespace-nowrap">
                    <div class="inline-flex items-center gap-1.5">
                        <button
                            type="button"
                            data-action="edit"
                            data-id="${idSafe}"
                            class="px-2.5 py-1 text-xs font-semibold bg-[#faf8f3] dark:bg-stone-800 hover:border-[#c87d32] hover:text-[#c87d32] text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-none transition cursor-pointer"
                        >
                            Edit
                        </button>
                        <button
                            type="button"
                            data-action="delete"
                            data-id="${idSafe}"
                            class="px-2.5 py-1 text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-none transition cursor-pointer"
                        >
                            Hapus
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    function getFilteredItems() {
        const keyword = String(searchInput?.value || "").trim().toLowerCase();
        const jenisFilter = String(filterJenisSelect?.value || "all").trim();

        return allItems.filter((item) => {
            const itemJenis = normalizeJenis(item);

            if (jenisFilter !== "all" && itemJenis !== jenisFilter) {
                return false;
            }

            if (!keyword) return true;

            const haystack = [
                item.judul,
                item.ringkasan,
                item.isi,
                item.konten,
                item.penulis,
                item.lokasi,
                item.waktu,
                itemJenis
            ]
                .map((v) => String(v || "").toLowerCase())
                .join(" ");

            return haystack.includes(keyword);
        });
    }

    function applyFilterAndRenderItems() {
        if (!listEl || isDestroyed) return;

        const filtered = getFilteredItems();
        const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        const totalJasa = allItems.filter((b) => normalizeJenis(b) === "Jasa").length;
        const totalLayanan = allItems.filter((b) => normalizeJenis(b) === "Layanan").length;

        if (summaryEl) {
            summaryEl.textContent = `Menampilkan ${filtered.length} dari ${allItems.length} item (${totalJasa} Jasa • ${totalLayanan} Layanan)`;
        }

        if (pageIndicatorEl) {
            pageIndicatorEl.textContent = `${currentPage}`;
            pageIndicatorEl.title = `Halaman ${currentPage} dari ${totalPages}`;
        }
        if (prevPageBtn) {
            prevPageBtn.disabled = currentPage <= 1;
        }
        if (nextPageBtn) {
            nextPageBtn.disabled = currentPage >= totalPages;
        }

        if (!pageItems.length) {
            listEl.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-xs text-stone-500 dark:text-stone-400">
                        Belum ada jasa atau layanan yang sesuai dengan filter.
                    </td>
                </tr>
            `;
            syncBulkDeleteUI([]);
            return;
        }

        listEl.innerHTML = pageItems.map(renderJasaRow).join("");
        syncBulkDeleteUI(pageItems);
    }

    async function loadInitialData() {
        try {
            const snap = await getDocs(collection(db, JASA_COLLECTION));
            if (isDestroyed) return;

            const list = [];
            snap.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...(docSnap.data() || {}) });
            });
            list.sort((a, b) => {
                const dateA = String(a.tanggal || a.createdAt || "");
                const dateB = String(b.tanggal || b.createdAt || "");
                if (dateA !== dateB) return dateB.localeCompare(dateA);
                return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
            });
            allItems = list;

            const validIds = new Set(list.map((item) => String(item.id)));
            [...selectedIds].forEach((id) => {
                if (!validIds.has(id)) selectedIds.delete(id);
            });

            applyFilterAndRenderItems();
        } catch (err) {
            console.error("Gagal memuat data manajemen jasa layanan:", err);
            if (!isDestroyed && listEl) {
                listEl.innerHTML = `
                    <tr>
                        <td colspan="5" class="p-6 text-center text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40">
                            Gagal memuat data jasa layanan dari database.
                        </td>
                    </tr>
                `;
            }
        }
    }

    const onFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await compressImageFile(file);
            currentImageData = compressed;
            if (gambarUrlInput) gambarUrlInput.value = "";
            updatePreviewImage(compressed);
            hideFeedback();
        } catch (err) {
            showFeedback(err.message || "Gagal memproses gambar.", "error");
        }
    };

    const onUrlChange = () => {
        const urlVal = String(gambarUrlInput?.value || "").trim();
        if (urlVal) {
            currentImageData = "";
            if (fileInput) fileInput.value = "";
            updatePreviewImage(urlVal);
        } else if (!currentImageData) {
            updatePreviewImage("");
        }
    };

    const onFormSubmit = async (e) => {
        e.preventDefault();
        hideFeedback();

        const jenis = jenisSelect?.value === "Layanan" ? "Layanan" : "Jasa";
        const judul = String(judulInput?.value || "").trim();
        const isi = String(isiTextarea?.value || "").trim();
        const tanggal = String(tanggalInput?.value || "").trim() || getTodayDateString();
        const waktu = String(waktuInput?.value || "").trim();
        const lokasi = String(lokasiInput?.value || "").trim();
        const status = statusSelect?.value === "Nonaktif" ? "Nonaktif" : "Aktif";
        const penulis = String(penulisInput?.value || "").trim();
        const ringkasan = String(ringkasanInput?.value || "").trim();
        const urlInputVal = String(gambarUrlInput?.value || "").trim();
        const gambarFinal = currentImageData || urlInputVal || "";
        const editId = String(editIdInput?.value || "").trim();

        if (!judul) {
            showFeedback(`Nama ${jenis.toLowerCase()} wajib diisi.`, "error");
            judulInput?.focus();
            return;
        }

        if (!isi) {
            showFeedback(`Deskripsi ${jenis.toLowerCase()} wajib diisi.`, "error");
            isiTextarea?.focus();
            return;
        }

        const nowIso = new Date().toISOString();
        const payload = {
            jenis,
            judul,
            ringkasan: ringkasan || isi.slice(0, 140),
            isi,
            tanggal,
            waktu,
            lokasi,
            penulis,
            gambar: gambarFinal,
            status,
            aktif: status === "Aktif",
            updatedAt: nowIso
        };

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Menyimpan...";
        }

        try {
            if (editId) {
                await updateDoc(doc(db, JASA_COLLECTION, editId), payload);
                await loadInitialData();
                closeFormPanel();
                showFeedback(`${jenis} berhasil diperbarui.`, "success");
            } else {
                payload.createdAt = nowIso;
                await addDoc(collection(db, JASA_COLLECTION), payload);
                await loadInitialData();
                closeFormPanel();
                showFeedback(`${jenis} baru berhasil disimpan.`, "success");
            }
        } catch (err) {
            console.error("Gagal menyimpan jasa / layanan:", err);
            showFeedback("Gagal menyimpan jasa / layanan ke database.", "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = editIdInput?.value ? "Perbarui Jasa / Layanan" : "Simpan Jasa / Layanan";
            }
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const idsToDelete = [...selectedIds];
        if (!window.confirm(`Hapus ${idsToDelete.length} jasa / layanan terpilih?`)) return;

        const results = await Promise.allSettled(
            idsToDelete.map((id) => deleteDoc(doc(db, JASA_COLLECTION, id)))
        );

        let successCount = 0;
        results.forEach((res, idx) => {
            const id = idsToDelete[idx];
            if (res.status === "fulfilled") {
                successCount += 1;
                selectedIds.delete(id);
                if (editIdInput?.value === id) {
                    closeFormPanel();
                }
            } else {
                console.error(`Gagal menghapus jasa/layanan ${id}:`, res.reason);
            }
        });

        if (successCount > 0 && successCount === idsToDelete.length) {
            showFeedback(`${successCount} jasa / layanan terpilih berhasil dihapus.`, "success");
        } else if (successCount > 0) {
            showFeedback(`${successCount} dari ${idsToDelete.length} item berhasil dihapus.`, "error");
        } else {
            showFeedback("Gagal menghapus jasa / layanan terpilih.", "error");
        }

        await loadInitialData();
    };

    const onListClick = async (e) => {
        const btn = e.target.closest("button[data-action][data-id]");
        if (!btn) return;

        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        const item = allItems.find((b) => String(b.id) === String(id));
        if (!item) return;

        if (action === "edit") {
            fillFormForEdit(item);
            return;
        }

        if (action === "delete") {
            const labelJenis = normalizeJenis(item);
            const yakin = window.confirm(`Hapus ${labelJenis.toLowerCase()} "${item.judul || "ini"}"?`);
            if (!yakin) return;

            try {
                await deleteDoc(doc(db, JASA_COLLECTION, id));
                selectedIds.delete(String(id));
                allItems = allItems.filter((b) => String(b.id) !== String(id));
                if (editIdInput?.value === id) {
                    closeFormPanel();
                }
                applyFilterAndRenderItems();
                showFeedback(`${labelJenis} berhasil dihapus.`, "success");
            } catch (err) {
                console.error("Gagal menghapus jasa / layanan:", err);
                showFeedback("Gagal menghapus jasa / layanan.", "error");
            }
        }
    };

    const onListChange = (e) => {
        const rowCheck = e.target.closest("[data-jasa-check]");
        if (!rowCheck) return;
        const id = rowCheck.getAttribute("data-jasa-check");
        if (!id) return;

        if (rowCheck.checked) {
            selectedIds.add(id);
        } else {
            selectedIds.delete(id);
        }

        const filtered = getFilteredItems();
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);
        syncBulkDeleteUI(pageItems);
    };

    const onSelectAllChange = () => {
        const checked = Boolean(selectAllCheckbox?.checked);
        const filtered = getFilteredItems();
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        pageItems.forEach((item) => {
            if (checked) {
                selectedIds.add(String(item.id));
            } else {
                selectedIds.delete(String(item.id));
            }
        });

        listEl?.querySelectorAll("[data-jasa-check]").forEach((cb) => {
            cb.checked = checked;
        });

        syncBulkDeleteUI(pageItems);
    };

    const onFilterChange = () => {
        currentPage = 1;
        applyFilterAndRenderItems();
    };

    const onPrevPageClick = () => {
        if (currentPage > 1) {
            currentPage -= 1;
            applyFilterAndRenderItems();
        }
    };

    const onNextPageClick = () => {
        const totalPages = Math.max(1, Math.ceil(getFilteredItems().length / ITEMS_PER_PAGE));
        if (currentPage < totalPages) {
            currentPage += 1;
            applyFilterAndRenderItems();
        }
    };

    fileInput?.addEventListener("change", onFileChange);
    gambarUrlInput?.addEventListener("input", onUrlChange);
    formEl?.addEventListener("submit", onFormSubmit);
    resetBtn?.addEventListener("click", onNewButtonClick);
    closeFormBtn?.addEventListener("click", closeFormPanel);
    cancelEditBtn?.addEventListener("click", closeFormPanel);
    listEl?.addEventListener("click", onListClick);
    listEl?.addEventListener("change", onListChange);
    selectAllCheckbox?.addEventListener("change", onSelectAllChange);
    bulkDeleteBtn?.addEventListener("click", handleBulkDelete);

    searchInput?.addEventListener("input", onFilterChange);
    filterJenisSelect?.addEventListener("change", onFilterChange);
    prevPageBtn?.addEventListener("click", onPrevPageClick);
    nextPageBtn?.addEventListener("click", onNextPageClick);

    resetForm();
    await loadInitialData();

    return () => {
        isDestroyed = true;
        if (feedbackTimerId !== null) {
            window.clearTimeout(feedbackTimerId);
            feedbackTimerId = null;
        }
        fileInput?.removeEventListener("change", onFileChange);
        gambarUrlInput?.removeEventListener("input", onUrlChange);
        formEl?.removeEventListener("submit", onFormSubmit);
        resetBtn?.removeEventListener("click", onNewButtonClick);
        closeFormBtn?.removeEventListener("click", closeFormPanel);
        cancelEditBtn?.removeEventListener("click", closeFormPanel);
        listEl?.removeEventListener("click", onListClick);
        listEl?.removeEventListener("change", onListChange);
        selectAllCheckbox?.removeEventListener("change", onSelectAllChange);
        bulkDeleteBtn?.removeEventListener("click", handleBulkDelete);

        searchInput?.removeEventListener("input", onFilterChange);
        filterJenisSelect?.removeEventListener("change", onFilterChange);
        prevPageBtn?.removeEventListener("click", onPrevPageClick);
        nextPageBtn?.removeEventListener("click", onNextPageClick);
    };
}

export const renderManajemenBerita = renderManajemenJasa;
export const initManajemenBeritaHandler = initManajemenJasaHandler;
export default renderManajemenJasa;