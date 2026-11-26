// File: assets/js/views/manajemen-produk.js
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../firebase-init.js";

const PRODUK_COLLECTION = "produk";
const SATUAN_COLLECTION = "satuan_produk";
const KATEGORI_COLLECTION = "kategori_produk";
const DEFAULT_SATUAN_LIST = ["pcs", "paket", "kg", "lusin", "botol", "box"];
const DEFAULT_KATEGORI_LIST = ["Keamanan & CCTV", "Kebutuhan Pokok", "Kerajinan", "Elektronik", "Umum"];
const DEFAULT_PRODUCT_IMAGE = "assets/icons/Logo.png";
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

function normalizeStatus(data = {}) {
    if (typeof data.aktif === "boolean") {
        return data.aktif ? "Tersedia" : "Habis";
    }
    const raw = String(data.status || "").trim();
    const lower = raw.toLowerCase();
    if (["tersedia", "aktif", "active", "ready", "true"].includes(lower)) return "Tersedia";
    if (["habis", "nonaktif", "inactive", "kosong", "false"].includes(lower)) return "Habis";
    return raw || "Tersedia";
}

function parseThousandsNumber(rawValue = "") {
    const digitsOnly = String(rawValue ?? "").replace(/\D/g, "");
    if (!digitsOnly) return 0;
    const parsed = Number.parseInt(digitsOnly, 10);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function formatThousandsInput(rawValue = "") {
    const num = typeof rawValue === "number" ? Math.max(0, Math.floor(rawValue)) : parseThousandsNumber(rawValue);
    if (!num) return "";
    return num.toLocaleString("id-ID");
}

function formatRupiah(value = 0) {
    const num = typeof value === "number" ? value : parseThousandsNumber(value);
    if (!Number.isFinite(num) || num <= 0) return "Hubungi Admin";
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(num);
}

function compressProductImage(file, maxWidth = 720, quality = 0.65) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith("image/")) {
            reject(new Error("File harus berupa gambar."));
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                if (dataUrl.length > 900000) {
                    reject(new Error("Ukuran gambar terlalu besar untuk database. Pilih gambar beresolusi lebih kecil."));
                    return;
                }
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error("Gagal memproses gambar."));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
        reader.readAsDataURL(file);
    });
}

export function renderManajemenProduk() {
    const defaultSatuanOptions = DEFAULT_SATUAN_LIST
        .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
        .join("");

    const defaultKategoriOptions = DEFAULT_KATEGORI_LIST
        .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`)
        .join("");

    return `
        <div class="w-full space-y-5">
            <!-- Header Halaman -->
            <div class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2">
                        <a
                            href="#/manajemen"
                            data-link
                            data-route="manajemen"
                            class="px-2.5 py-1 text-xs font-semibold bg-[#f6f3ec] dark:bg-stone-800 hover:border-[#c87d32] hover:text-[#c87d32] text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-none transition"
                        >
                            ← Kembali
                        </a>
                        <h1 class="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-snug">
                            Manajemen Produk
                        </h1>
                    </div>
                    <p id="manajemen-produk-summary" class="text-xs text-stone-600 dark:text-stone-400 mt-1.5">
                        Kelola katalog produk, harga, stok &amp; status ketersediaan.
                    </p>
                </div>

                <button
                    type="button"
                    id="btn-tambah-produk"
                    class="px-3.5 py-2 text-xs font-semibold bg-[#5c6d4e] hover:bg-[#4b5a3f] text-white rounded-none transition cursor-pointer flex-shrink-0"
                >
                    + Tambah Produk
                </button>
            </div>

            <!-- Toast Feedback Pojok Kanan Atas -->
            <div id="produk-feedback" role="status" aria-live="polite" class="hidden fixed top-4 right-4 z-[60] max-w-sm text-xs px-4 py-3 border rounded-none shadow-lg transition-all duration-200"></div>

            <!-- Popup Modal Form Tambah / Edit Produk -->
            <div
                id="produk-form-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="produk-form-heading"
                class="hidden fixed inset-0 z-50 bg-stone-950/75 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
            >
                <div class="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-4 sm:p-6 space-y-4 shadow-2xl my-auto">
                    <div class="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
                        <div class="flex items-center gap-2">
                            <h2 id="produk-form-heading" class="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">
                                Tambah Produk Baru
                            </h2>
                            <span id="produk-editing-badge" class="hidden px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-none">
                                Mode Edit
                            </span>
                        </div>
                        <button
                            type="button"
                            id="btn-tutup-form-produk"
                            class="text-xs font-semibold text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 cursor-pointer"
                        >
                            Tutup Form
                        </button>
                    </div>

                    <form id="form-manajemen-produk" class="space-y-4">
                        <input type="hidden" id="produk-edit-id" value="">

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                            <div class="md:col-span-2">
                                <label for="produk-nama" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                    Nama Produk *
                                </label>
                                <input
                                    type="text"
                                    id="produk-nama"
                                    required
                                    placeholder="Contoh: Kamera CCTV Outdoor"
                                    class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <div>
                                <div class="flex items-center justify-between gap-1 mb-1">
                                    <label for="produk-kategori" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                                        Kategori
                                    </label>
                                    <div class="inline-flex items-center gap-1">
                                        <button
                                            type="button"
                                            id="btn-toggle-tambah-kategori"
                                            class="px-1.5 py-0.5 text-[10px] font-bold bg-[#f6f3ec] dark:bg-stone-800 hover:border-[#5c6d4e] hover:text-[#4a5a3f] text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-none transition cursor-pointer"
                                            title="Tambah kategori baru"
                                        >
                                            + Tambah
                                        </button>
                                        <button
                                            type="button"
                                            id="btn-hapus-kategori"
                                            class="px-1.5 py-0.5 text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-none transition cursor-pointer"
                                            title="Hapus kategori terpilih"
                                        >
                                            Hapus
                                        </button>
                                    </div>
                                </div>
                                <select
                                    id="produk-kategori"
                                    class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                                    ${defaultKategoriOptions}
                                </select>
                                <div id="kategori-tambah-box" class="hidden mt-1.5 flex items-center gap-1">
                                    <input
                                        type="text"
                                        id="input-kategori-baru"
                                        placeholder="Nama kategori baru"
                                        class="flex-1 min-w-0 px-2 py-1 text-xs bg-[#faf8f3] dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                    >
                                    <button
                                        type="button"
                                        id="btn-simpan-kategori"
                                        class="px-2 py-1 text-[11px] font-bold bg-[#5c6d4e] hover:bg-[#4b5a3f] text-white rounded-none transition cursor-pointer flex-shrink-0"
                                    >
                                        Simpan
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                            <div>
                                <label for="produk-harga" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                    Harga (Rp)
                                </label>
                                <input
                                    type="text"
                                    inputmode="numeric"
                                    id="produk-harga"
                                    placeholder="0"
                                    class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-[#c87d32] dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <div>
                                <label for="produk-stok" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                    Stok
                                </label>
                                <input
                                    type="number"
                                    id="produk-stok"
                                    min="0"
                                    step="1"
                                    placeholder="0"
                                    class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                            </div>

                            <div>
                                <div class="flex items-center justify-between gap-1 mb-1">
                                    <label for="produk-satuan" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                                        Satuan
                                    </label>
                                    <div class="inline-flex items-center gap-1">
                                        <button
                                            type="button"
                                            id="btn-toggle-tambah-satuan"
                                            class="px-1.5 py-0.5 text-[10px] font-bold bg-[#f6f3ec] dark:bg-stone-800 hover:border-[#5c6d4e] hover:text-[#4a5a3f] text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-none transition cursor-pointer"
                                            title="Tambah satuan baru"
                                        >
                                            + Tambah
                                        </button>
                                        <button
                                            type="button"
                                            id="btn-hapus-satuan"
                                            class="px-1.5 py-0.5 text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-none transition cursor-pointer"
                                            title="Hapus satuan terpilih"
                                        >
                                            Hapus
                                        </button>
                                    </div>
                                </div>
                                <select
                                    id="produk-satuan"
                                    class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                                    ${defaultSatuanOptions}
                                </select>
                                <div id="satuan-tambah-box" class="hidden mt-1.5 flex items-center gap-1">
                                    <input
                                        type="text"
                                        id="input-satuan-baru"
                                        placeholder="Nama satuan (mis. karung)"
                                        class="flex-1 min-w-0 px-2 py-1 text-xs bg-[#faf8f3] dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                    >
                                    <button
                                        type="button"
                                        id="btn-simpan-satuan"
                                        class="px-2 py-1 text-[11px] font-bold bg-[#5c6d4e] hover:bg-[#4b5a3f] text-white rounded-none transition cursor-pointer flex-shrink-0"
                                    >
                                        Simpan
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label for="produk-status" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                    Status
                                </label>
                                <select
                                    id="produk-status"
                                    class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                >
                                    <option value="Tersedia">Tersedia</option>
                                    <option value="Habis">Habis</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label for="produk-deskripsi" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                Deskripsi Produk *
                            </label>
                            <textarea
                                id="produk-deskripsi"
                                rows="3"
                                required
                                placeholder="Tuliskan spesifikasi atau rincian produk..."
                                class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32] leading-relaxed"
                            ></textarea>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                            <div class="md:col-span-2 space-y-3">
                                <div>
                                    <label for="produk-file" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                        Upload Gambar Produk
                                    </label>
                                    <input
                                        type="file"
                                        id="produk-file"
                                        accept="image/*"
                                        class="block w-full text-xs text-stone-600 dark:text-stone-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-none file:border file:border-stone-300 dark:file:border-stone-700 file:text-xs file:font-semibold file:bg-[#f6f3ec] dark:file:bg-stone-800 file:text-stone-700 dark:file:text-stone-200 hover:file:border-[#c87d32] cursor-pointer"
                                    >
                                </div>

                                <div>
                                    <label for="produk-gambar-url" class="block text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                                        Atau URL Gambar
                                    </label>
                                    <input
                                        type="text"
                                        id="produk-gambar-url"
                                        placeholder="https://... atau biarkan kosong untuk gambar default"
                                        class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                                    >
                                </div>
                            </div>

                            <div class="bg-[#f6f3ec] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-none p-2.5 flex flex-col items-center justify-center">
                                <div class="w-full h-32 bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden flex items-center justify-center">
                                    <img
                                        id="produk-preview-img"
                                        src="${DEFAULT_PRODUCT_IMAGE}"
                                        alt="Preview Gambar Produk"
                                        class="w-full h-full object-cover rounded-none"
                                        onerror="this.onerror=null;this.src='${DEFAULT_PRODUCT_IMAGE}';"
                                    >
                                </div>
                                <span class="text-[10px] text-stone-500 dark:text-stone-400 mt-1.5">
                                    Preview Gambar
                                </span>
                            </div>
                        </div>

                        <div class="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-stone-200 dark:border-stone-800">
                            <button
                                type="button"
                                id="btn-batal-edit-produk"
                                class="hidden px-4 py-2 text-xs font-semibold bg-[#f6f3ec] dark:bg-stone-800 hover:border-[#c87d32] hover:text-[#c87d32] text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-none transition cursor-pointer"
                            >
                                Batal Edit
                            </button>
                            <button
                                type="submit"
                                id="btn-simpan-produk"
                                class="px-5 py-2 text-xs font-bold bg-[#5c6d4e] hover:bg-[#4b5a3f] text-white rounded-none transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                Simpan Produk
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Filter, Aksi Massal & Tabel Produk -->
            <section class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-4 sm:p-6 space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div class="flex flex-wrap items-center gap-2">
                        <select
                            id="filter-produk-status"
                            class="px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                        >
                            <option value="all">Semua Status</option>
                            <option value="Tersedia">Tersedia</option>
                            <option value="Habis">Habis</option>
                        </select>

                        <button
                            type="button"
                            id="btn-hapus-terpilih-produk"
                            class="hidden inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/70 rounded-none transition cursor-pointer"
                        >
                            <span>Hapus Terpilih</span>
                            <span id="produk-selected-count" class="px-1.5 py-0.5 text-[10px] font-bold bg-rose-600 text-white rounded-none">0</span>
                        </button>
                    </div>

                    <div class="w-full sm:w-72">
                        <input
                            type="text"
                            id="filter-produk-search"
                            placeholder="Cari nama produk, kategori, atau deskripsi..."
                            class="w-full px-3 py-2 text-xs bg-[#f6f3ec] dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
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
                                            id="produk-select-all"
                                            class="w-4 h-4 rounded-none border-stone-300 dark:border-stone-700 cursor-pointer align-middle"
                                        >
                                    </th>
                                    <th class="px-4 py-3 w-28">Gambar</th>
                                    <th class="px-4 py-3">Produk &amp; Harga</th>
                                    <th class="px-4 py-3">Deskripsi</th>
                                    <th class="px-4 py-3 text-right w-36">Aksi</th>
                                </tr>
                            </thead>
                            <tbody id="manajemen-produk-list" class="divide-y divide-stone-200 dark:divide-stone-800 text-xs text-stone-800 dark:text-stone-200">
                                <tr>
                                    <td colspan="5" class="p-8 text-center text-xs text-stone-500 dark:text-stone-400">
                                        Memuat daftar produk...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div id="produk-pagination-bar" class="px-4 py-3 border-t border-stone-200 dark:border-stone-800 bg-[#faf8f3] dark:bg-stone-900 flex items-center justify-end gap-2 text-xs">
                        <button
                            type="button"
                            id="produk-prev-page"
                            class="px-2.5 py-1 border border-transparent hover:border-stone-300 dark:hover:border-stone-700 rounded-none text-stone-600 dark:text-stone-300 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                            &lt; Previous
                        </button>
                        <span
                            id="produk-page-indicator"
                            class="px-2.5 py-1 border border-stone-300 dark:border-stone-700 bg-[#f6f3ec] dark:bg-stone-800 font-semibold text-stone-900 dark:text-stone-100 rounded-none"
                        >
                            1
                        </span>
                        <button
                            type="button"
                            id="produk-next-page"
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

export async function initManajemenProdukHandler() {
    let isDestroyed = false;
    let allProducts = [];
    let satuanDocs = [];
    let kategoriDocs = [];
    const selectedIds = new Set();
    let currentPage = 1;
    let currentImageData = "";
    let feedbackTimerId = null;

    const formPanel = document.getElementById("produk-form-panel");
    const formEl = document.getElementById("form-manajemen-produk");
    const editIdInput = document.getElementById("produk-edit-id");
    const formHeading = document.getElementById("produk-form-heading");
    const editingBadge = document.getElementById("produk-editing-badge");
    const openBtn = document.getElementById("btn-tambah-produk");
    const closeFormBtn = document.getElementById("btn-tutup-form-produk");
    const cancelEditBtn = document.getElementById("btn-batal-edit-produk");
    const submitBtn = document.getElementById("btn-simpan-produk");
    const feedbackEl = document.getElementById("produk-feedback");

    const namaInput = document.getElementById("produk-nama");
    const kategoriSelect = document.getElementById("produk-kategori");
    const toggleTambahKategoriBtn = document.getElementById("btn-toggle-tambah-kategori");
    const hapusKategoriBtn = document.getElementById("btn-hapus-kategori");
    const kategoriTambahBox = document.getElementById("kategori-tambah-box");
    const kategoriBaruInput = document.getElementById("input-kategori-baru");
    const simpanKategoriBtn = document.getElementById("btn-simpan-kategori");

    const hargaInput = document.getElementById("produk-harga");
    const stokInput = document.getElementById("produk-stok");
    const satuanSelect = document.getElementById("produk-satuan");
    const toggleTambahSatuanBtn = document.getElementById("btn-toggle-tambah-satuan");
    const hapusSatuanBtn = document.getElementById("btn-hapus-satuan");
    const satuanTambahBox = document.getElementById("satuan-tambah-box");
    const satuanBaruInput = document.getElementById("input-satuan-baru");
    const simpanSatuanBtn = document.getElementById("btn-simpan-satuan");

    const statusSelect = document.getElementById("produk-status");
    const deskripsiTextarea = document.getElementById("produk-deskripsi");
    const fileInput = document.getElementById("produk-file");
    const gambarUrlInput = document.getElementById("produk-gambar-url");
    const previewImg = document.getElementById("produk-preview-img");

    const searchInput = document.getElementById("filter-produk-search");
    const filterStatusSelect = document.getElementById("filter-produk-status");
    const bulkDeleteBtn = document.getElementById("btn-hapus-terpilih-produk");
    const selectedCountEl = document.getElementById("produk-selected-count");
    const selectAllCheckbox = document.getElementById("produk-select-all");
    const listEl = document.getElementById("manajemen-produk-list");
    const summaryEl = document.getElementById("manajemen-produk-summary");
    const prevPageBtn = document.getElementById("produk-prev-page");
    const nextPageBtn = document.getElementById("produk-next-page");
    const pageIndicatorEl = document.getElementById("produk-page-indicator");

    function hideFeedback() {
        if (feedbackTimerId !== null) {
            window.clearTimeout(feedbackTimerId);
            feedbackTimerId = null;
        }
        feedbackEl?.classList.add("hidden");
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
        feedbackEl.className = `fixed top-4 right-4 z-[60] max-w-sm text-xs px-4 py-3 border rounded-none shadow-lg transition-all duration-200 font-semibold ${styles[type] || styles.info}`;
        feedbackEl.textContent = message;
        feedbackEl.classList.remove("hidden");

        if (durationMs > 0) {
            feedbackTimerId = window.setTimeout(() => {
                feedbackTimerId = null;
                if (!isDestroyed) feedbackEl?.classList.add("hidden");
            }, durationMs);
        }
    }

    function getAllKategoriNames() {
        const names = [...DEFAULT_KATEGORI_LIST];
        kategoriDocs.forEach((docItem) => {
            const val = String(docItem.nama || "").trim();
            if (val && !names.some((n) => n.toLowerCase() === val.toLowerCase())) {
                names.push(val);
            }
        });
        return names;
    }

    function syncHapusKategoriButton() {
        if (!hapusKategoriBtn || !kategoriSelect) return;
        const currentVal = String(kategoriSelect.value || "").trim().toLowerCase();
        const customDoc = kategoriDocs.find((d) => String(d.nama || "").trim().toLowerCase() === currentVal);
        const canDelete = Boolean(customDoc) || (
            !DEFAULT_KATEGORI_LIST.some((d) => d.toLowerCase() === currentVal) &&
            kategoriSelect.options.length > 1
        );
        hapusKategoriBtn.disabled = !canDelete;
        hapusKategoriBtn.classList.toggle("opacity-40", !canDelete);
        hapusKategoriBtn.classList.toggle("pointer-events-none", !canDelete);
    }

    function renderKategoriOptions(selectedValue = "") {
        if (!kategoriSelect) return;
        const allNames = getAllKategoriNames();
        const desired = String(selectedValue || kategoriSelect.value || allNames[0] || "Umum").trim();
        if (desired && !allNames.some((n) => n.toLowerCase() === desired.toLowerCase())) {
            allNames.push(desired);
        }

        kategoriSelect.innerHTML = allNames
            .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
            .join("");

        const matched = allNames.find((n) => n.toLowerCase() === desired.toLowerCase()) || allNames[0] || "Umum";
        kategoriSelect.value = matched;
        syncHapusKategoriButton();
    }

    async function loadKategoriList(preferredValue = "") {
        try {
            const snap = await getDocs(collection(db, KATEGORI_COLLECTION));
            if (isDestroyed) return;
            const list = [];
            snap.forEach((docSnap) => {
                const data = docSnap.data() || {};
                const nama = String(data.nama || "").trim();
                if (nama) list.push({ id: docSnap.id, nama });
            });
            kategoriDocs = list;
        } catch (err) {
            console.warn("Gagal memuat koleksi kategori_produk:", err);
        }
        renderKategoriOptions(preferredValue);
    }

    function toggleTambahKategoriBox(forceOpen = null) {
        if (!kategoriTambahBox) return;
        const shouldOpen = typeof forceOpen === "boolean"
            ? forceOpen
            : kategoriTambahBox.classList.contains("hidden");
        kategoriTambahBox.classList.toggle("hidden", !shouldOpen);
        if (shouldOpen) {
            if (kategoriBaruInput) kategoriBaruInput.value = "";
            kategoriBaruInput?.focus();
        }
    }

    async function handleSimpanKategori() {
        const namaBaru = String(kategoriBaruInput?.value || "").trim();
        if (!namaBaru) {
            showFeedback("Nama kategori wajib diisi.", "error");
            kategoriBaruInput?.focus();
            return;
        }

        const exists = getAllKategoriNames().some((n) => n.toLowerCase() === namaBaru.toLowerCase());
        if (exists) {
            renderKategoriOptions(namaBaru);
            toggleTambahKategoriBox(false);
            showFeedback(`Kategori "${namaBaru}" sudah tersedia.`, "info");
            return;
        }

        if (simpanKategoriBtn) {
            simpanKategoriBtn.disabled = true;
            simpanKategoriBtn.textContent = "...";
        }

        try {
            const docRef = await addDoc(collection(db, KATEGORI_COLLECTION), {
                nama: namaBaru,
                createdAt: new Date().toISOString()
            });
            kategoriDocs.push({ id: docRef.id, nama: namaBaru });
            renderKategoriOptions(namaBaru);
            toggleTambahKategoriBox(false);
            showFeedback(`Kategori "${namaBaru}" berhasil ditambahkan.`, "success");
        } catch (err) {
            console.error("Gagal menambah kategori:", err);
            showFeedback("Gagal menyimpan kategori ke database.", "error");
        } finally {
            if (simpanKategoriBtn && !isDestroyed) {
                simpanKategoriBtn.disabled = false;
                simpanKategoriBtn.textContent = "Simpan";
            }
        }
    }

    async function handleHapusKategori() {
        const currentVal = String(kategoriSelect?.value || "").trim();
        if (!currentVal) return;

        const customDoc = kategoriDocs.find((d) => d.nama.toLowerCase() === currentVal.toLowerCase());
        if (!customDoc) {
            showFeedback("Kategori bawaan tidak dapat dihapus.", "error");
            return;
        }

        if (!window.confirm(`Hapus kategori "${customDoc.nama}"?`)) return;

        try {
            await deleteDoc(doc(db, KATEGORI_COLLECTION, customDoc.id));
            kategoriDocs = kategoriDocs.filter((d) => d.id !== customDoc.id);
            renderKategoriOptions(DEFAULT_KATEGORI_LIST[0] || "Umum");
            showFeedback(`Kategori "${customDoc.nama}" berhasil dihapus.`, "success");
        } catch (err) {
            console.error("Gagal menghapus kategori:", err);
            showFeedback("Gagal menghapus kategori dari database.", "error");
        }
    }

    function getAllSatuanNames() {
        const names = [...DEFAULT_SATUAN_LIST];
        satuanDocs.forEach((docItem) => {
            const val = String(docItem.nama || "").trim();
            if (val && !names.some((n) => n.toLowerCase() === val.toLowerCase())) {
                names.push(val);
            }
        });
        return names;
    }

    function syncHapusSatuanButton() {
        if (!hapusSatuanBtn || !satuanSelect) return;
        const currentVal = String(satuanSelect.value || "").trim().toLowerCase();
        const customDoc = satuanDocs.find((d) => String(d.nama || "").trim().toLowerCase() === currentVal);
        const canDelete = Boolean(customDoc) || (
            !DEFAULT_SATUAN_LIST.some((d) => d.toLowerCase() === currentVal) &&
            satuanSelect.options.length > 1
        );
        hapusSatuanBtn.disabled = !canDelete;
        hapusSatuanBtn.classList.toggle("opacity-40", !canDelete);
        hapusSatuanBtn.classList.toggle("pointer-events-none", !canDelete);
    }

    function renderSatuanOptions(selectedValue = "") {
        if (!satuanSelect) return;
        const allNames = getAllSatuanNames();
        const desired = String(selectedValue || satuanSelect.value || allNames[0] || "pcs").trim();
        if (desired && !allNames.some((n) => n.toLowerCase() === desired.toLowerCase())) {
            allNames.push(desired);
        }

        satuanSelect.innerHTML = allNames
            .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
            .join("");

        const matched = allNames.find((n) => n.toLowerCase() === desired.toLowerCase()) || allNames[0] || "pcs";
        satuanSelect.value = matched;
        syncHapusSatuanButton();
    }

    async function loadSatuanList(preferredValue = "") {
        try {
            const snap = await getDocs(collection(db, SATUAN_COLLECTION));
            if (isDestroyed) return;
            const list = [];
            snap.forEach((docSnap) => {
                const data = docSnap.data() || {};
                const nama = String(data.nama || "").trim();
                if (nama) list.push({ id: docSnap.id, nama });
            });
            satuanDocs = list;
        } catch (err) {
            console.warn("Gagal memuat koleksi satuan_produk:", err);
        }
        renderSatuanOptions(preferredValue);
    }

    function toggleTambahSatuanBox(forceOpen = null) {
        if (!satuanTambahBox) return;
        const shouldOpen = typeof forceOpen === "boolean"
            ? forceOpen
            : satuanTambahBox.classList.contains("hidden");
        satuanTambahBox.classList.toggle("hidden", !shouldOpen);
        if (shouldOpen) {
            if (satuanBaruInput) satuanBaruInput.value = "";
            satuanBaruInput?.focus();
        }
    }

    async function handleSimpanSatuan() {
        const namaBaru = String(satuanBaruInput?.value || "").trim();
        if (!namaBaru) {
            showFeedback("Nama satuan wajib diisi.", "error");
            satuanBaruInput?.focus();
            return;
        }

        const exists = getAllSatuanNames().some((n) => n.toLowerCase() === namaBaru.toLowerCase());
        if (exists) {
            renderSatuanOptions(namaBaru);
            toggleTambahSatuanBox(false);
            showFeedback(`Satuan "${namaBaru}" sudah tersedia.`, "info");
            return;
        }

        if (simpanSatuanBtn) {
            simpanSatuanBtn.disabled = true;
            simpanSatuanBtn.textContent = "...";
        }

        try {
            const docRef = await addDoc(collection(db, SATUAN_COLLECTION), {
                nama: namaBaru,
                createdAt: new Date().toISOString()
            });
            satuanDocs.push({ id: docRef.id, nama: namaBaru });
            renderSatuanOptions(namaBaru);
            toggleTambahSatuanBox(false);
            showFeedback(`Satuan "${namaBaru}" berhasil ditambahkan.`, "success");
        } catch (err) {
            console.error("Gagal menambah satuan:", err);
            showFeedback("Gagal menyimpan satuan ke database.", "error");
        } finally {
            if (simpanSatuanBtn && !isDestroyed) {
                simpanSatuanBtn.disabled = false;
                simpanSatuanBtn.textContent = "Simpan";
            }
        }
    }

    async function handleHapusSatuan() {
        const currentVal = String(satuanSelect?.value || "").trim();
        if (!currentVal) return;

        const customDoc = satuanDocs.find((d) => d.nama.toLowerCase() === currentVal.toLowerCase());
        if (!customDoc) {
            showFeedback("Satuan bawaan tidak dapat dihapus.", "error");
            return;
        }

        if (!window.confirm(`Hapus satuan "${customDoc.nama}"?`)) return;

        try {
            await deleteDoc(doc(db, SATUAN_COLLECTION, customDoc.id));
            satuanDocs = satuanDocs.filter((d) => d.id !== customDoc.id);
            renderSatuanOptions(DEFAULT_SATUAN_LIST[0] || "pcs");
            showFeedback(`Satuan "${customDoc.nama}" berhasil dihapus.`, "success");
        } catch (err) {
            console.error("Gagal menghapus satuan:", err);
            showFeedback("Gagal menghapus satuan dari database.", "error");
        }
    }

    const onHargaInput = () => {
        if (!hargaInput) return;
        hargaInput.value = formatThousandsInput(hargaInput.value);
    };

    function updatePreviewImage(src = "") {
        if (!previewImg) return;
        const cleanSrc = String(src || "").trim();
        previewImg.src = isSafeImageSrc(cleanSrc) ? cleanSrc : DEFAULT_PRODUCT_IMAGE;
    }

    function resetForm() {
        if (editIdInput) editIdInput.value = "";
        if (formHeading) formHeading.textContent = "Tambah Produk Baru";
        if (editingBadge) editingBadge.classList.add("hidden");
        if (cancelEditBtn) cancelEditBtn.classList.add("hidden");
        if (submitBtn) submitBtn.textContent = "Simpan Produk";

        if (namaInput) namaInput.value = "";
        renderKategoriOptions(DEFAULT_KATEGORI_LIST[0] || "Umum");
        toggleTambahKategoriBox(false);
        if (hargaInput) hargaInput.value = "";
        if (stokInput) stokInput.value = "";
        renderSatuanOptions(DEFAULT_SATUAN_LIST[0] || "pcs");
        toggleTambahSatuanBox(false);
        if (statusSelect) statusSelect.value = "Tersedia";
        if (deskripsiTextarea) deskripsiTextarea.value = "";
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
            namaInput?.focus();
        }
    }

    function closeFormPanel() {
        toggleTambahKategoriBox(false);
        toggleTambahSatuanBox(false);
        formPanel?.classList.add("hidden");
        resetForm();
    }

    function fillFormForEdit(item) {
        if (!item) return;
        formPanel?.classList.remove("hidden");
        toggleTambahKategoriBox(false);
        toggleTambahSatuanBox(false);

        if (editIdInput) editIdInput.value = item.id;
        if (formHeading) formHeading.textContent = `Edit Produk: ${item.nama || item.judul || ""}`;
        if (editingBadge) editingBadge.classList.remove("hidden");
        if (cancelEditBtn) cancelEditBtn.classList.remove("hidden");
        if (submitBtn) submitBtn.textContent = "Perbarui Produk";

        if (namaInput) namaInput.value = item.nama || item.judul || "";
        renderKategoriOptions(item.kategori || DEFAULT_KATEGORI_LIST[0] || "Umum");
        if (hargaInput) hargaInput.value = formatThousandsInput(item.harga ?? "");
        if (stokInput) stokInput.value = item.stok ?? "";
        renderSatuanOptions(item.satuan || DEFAULT_SATUAN_LIST[0] || "pcs");
        if (statusSelect) statusSelect.value = normalizeStatus(item);
        if (deskripsiTextarea) deskripsiTextarea.value = item.deskripsi || item.isi || "";

        const imgVal = String(item.gambar || item.foto || "").trim();
        currentImageData = imgVal.startsWith("data:image/") ? imgVal : "";
        if (gambarUrlInput) gambarUrlInput.value = imgVal.startsWith("data:image/") ? "" : imgVal;
        if (fileInput) fileInput.value = "";

        updatePreviewImage(imgVal);
        hideFeedback();
        namaInput?.focus();
    }

    function syncBulkDeleteUI(pageItems = []) {
        const count = selectedIds.size;
        if (selectedCountEl) selectedCountEl.textContent = `${count}`;
        if (bulkDeleteBtn) bulkDeleteBtn.classList.toggle("hidden", count === 0);
        if (selectAllCheckbox) {
            selectAllCheckbox.checked =
                pageItems.length > 0 && pageItems.every((item) => selectedIds.has(String(item.id)));
        }
    }

    function getFilteredProducts() {
        const keyword = String(searchInput?.value || "").trim().toLowerCase();
        const statusFilter = String(filterStatusSelect?.value || "all").trim();

        return allProducts.filter((item) => {
            const st = normalizeStatus(item);
            if (statusFilter !== "all" && st !== statusFilter) return false;
            if (!keyword) return true;
            const haystack = [item.nama, item.judul, item.kategori, item.deskripsi, item.satuan]
                .map((v) => String(v || "").toLowerCase())
                .join(" ");
            return haystack.includes(keyword);
        });
    }

    function renderProductRow(item) {
        const nama = item.nama || item.judul || "Tanpa Nama";
        const namaSafe = escapeHtml(nama);
        const kategoriSafe = escapeHtml(item.kategori || "Umum");
        const hargaLabel = escapeHtml(formatRupiah(item.harga));
        const stokVal = Number(item.stok ?? 0);
        const satuanSafe = escapeHtml(item.satuan || "pcs");
        const stokLabel = Number.isFinite(stokVal) ? `${stokVal} ${satuanSafe}` : satuanSafe;
        const statusLabel = normalizeStatus(item);
        const statusSafe = escapeHtml(statusLabel);
        const isReady = statusLabel === "Tersedia";
        const deskripsiSafe = escapeHtml(item.deskripsi || item.isi || "-");
        const rawImg = String(item.gambar || item.foto || "").trim();
        const imgSrc = escapeHtml(isSafeImageSrc(rawImg) ? rawImg : DEFAULT_PRODUCT_IMAGE);
        const idSafe = escapeHtml(item.id);
        const checkedAttr = selectedIds.has(String(item.id)) ? "checked" : "";

        const badgeClass = isReady
            ? "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
            : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800";

        return `
            <tr class="hover:bg-[#f6f3ec]/60 dark:hover:bg-stone-800/40 transition">
                <td class="px-4 py-3 align-middle text-center">
                    <input
                        type="checkbox"
                        data-produk-check="${idSafe}"
                        ${checkedAttr}
                        class="w-4 h-4 rounded-none border-stone-300 dark:border-stone-700 cursor-pointer align-middle"
                    >
                </td>
                <td class="px-4 py-3 align-middle">
                    <div class="w-24 h-12 bg-[#f6f3ec] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-none overflow-hidden flex items-center justify-center">
                        <img
                            src="${imgSrc}"
                            alt="${namaSafe}"
                            class="w-full h-full object-cover rounded-none"
                            onerror="this.onerror=null;this.src='${DEFAULT_PRODUCT_IMAGE}';"
                        >
                    </div>
                </td>
                <td class="px-4 py-3 align-middle">
                    <div class="font-bold text-stone-900 dark:text-stone-100 leading-snug">${namaSafe}</div>
                    <div class="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                        <span class="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-none ${badgeClass}">
                            ${statusSafe}
                        </span>
                        <span class="font-semibold text-stone-800 dark:text-stone-200">${hargaLabel}</span>
                        <span>• Stok: ${escapeHtml(stokLabel)}</span>
                        <span>• ${kategoriSafe}</span>
                    </div>
                </td>
                <td class="px-4 py-3 align-middle text-stone-700 dark:text-stone-300 max-w-md">
                    <p class="line-clamp-2 leading-relaxed">${deskripsiSafe}</p>
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

    function applyFilterAndRender() {
        if (!listEl || isDestroyed) return;

        const filtered = getFilteredProducts();
        const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        if (summaryEl) {
            summaryEl.textContent = `Menampilkan ${filtered.length} dari ${allProducts.length} produk`;
        }
        if (pageIndicatorEl) {
            pageIndicatorEl.textContent = `${currentPage}`;
            pageIndicatorEl.title = `Halaman ${currentPage} dari ${totalPages}`;
        }
        if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
        if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;

        if (!pageItems.length) {
            listEl.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-xs text-stone-500 dark:text-stone-400">
                        Belum ada produk yang sesuai dengan filter.
                    </td>
                </tr>
            `;
            syncBulkDeleteUI([]);
            return;
        }

        listEl.innerHTML = pageItems.map(renderProductRow).join("");
        syncBulkDeleteUI(pageItems);
    }

    async function loadProducts() {
        try {
            const snap = await getDocs(collection(db, PRODUK_COLLECTION));
            if (isDestroyed) return;

            const list = [];
            snap.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...(docSnap.data() || {}) });
            });
            list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
            allProducts = list;

            const validIds = new Set(list.map((item) => String(item.id)));
            [...selectedIds].forEach((id) => {
                if (!validIds.has(id)) selectedIds.delete(id);
            });

            applyFilterAndRender();
        } catch (err) {
            console.error("Gagal memuat produk:", err);
            if (!isDestroyed && listEl) {
                listEl.innerHTML = `
                    <tr>
                        <td colspan="5" class="p-6 text-center text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40">
                            Gagal memuat data produk dari database.
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
            const compressed = await compressProductImage(file);
            currentImageData = compressed;
            if (gambarUrlInput) gambarUrlInput.value = "";
            updatePreviewImage(compressed);
            hideFeedback();
        } catch (err) {
            if (fileInput) fileInput.value = "";
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

        const nama = String(namaInput?.value || "").trim();
        const kategori = String(kategoriSelect?.value || "").trim() || DEFAULT_KATEGORI_LIST[0] || "Umum";
        const harga = parseThousandsNumber(hargaInput?.value || 0);
        const stok = Number(stokInput?.value || 0);
        const satuan = String(satuanSelect?.value || "").trim() || DEFAULT_SATUAN_LIST[0] || "pcs";
        const status = statusSelect?.value === "Habis" ? "Habis" : "Tersedia";
        const deskripsi = String(deskripsiTextarea?.value || "").trim();
        const rawGambar = currentImageData || String(gambarUrlInput?.value || "").trim();
        const gambarFinal = isSafeImageSrc(rawGambar) ? rawGambar : DEFAULT_PRODUCT_IMAGE;
        const editId = String(editIdInput?.value || "").trim();

        if (!nama) {
            showFeedback("Nama produk wajib diisi.", "error");
            namaInput?.focus();
            return;
        }
        if (!deskripsi) {
            showFeedback("Deskripsi produk wajib diisi.", "error");
            deskripsiTextarea?.focus();
            return;
        }

        const nowIso = new Date().toISOString();
        const payload = {
            nama,
            kategori,
            harga: Number.isFinite(harga) && harga >= 0 ? harga : 0,
            stok: Number.isFinite(stok) && stok >= 0 ? stok : 0,
            satuan,
            status,
            aktif: status === "Tersedia",
            deskripsi,
            gambar: gambarFinal,
            updatedAt: nowIso
        };

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Menyimpan...";
        }

        try {
            if (editId) {
                await updateDoc(doc(db, PRODUK_COLLECTION, editId), payload);
                showFeedback("Produk berhasil diperbarui.", "success");
            } else {
                payload.createdAt = nowIso;
                await addDoc(collection(db, PRODUK_COLLECTION), payload);
                showFeedback("Produk baru berhasil disimpan.", "success");
            }
            await loadProducts();
            closeFormPanel();
        } catch (err) {
            console.error("Gagal menyimpan produk:", err);
            showFeedback("Gagal menyimpan produk ke database.", "error");
        } finally {
            if (submitBtn && !isDestroyed) {
                submitBtn.disabled = false;
                submitBtn.textContent = editIdInput?.value ? "Perbarui Produk" : "Simpan Produk";
            }
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const idsToDelete = [...selectedIds];
        if (!window.confirm(`Hapus ${idsToDelete.length} produk terpilih?`)) return;

        const results = await Promise.allSettled(
            idsToDelete.map((id) => deleteDoc(doc(db, PRODUK_COLLECTION, id)))
        );

        let successCount = 0;
        results.forEach((res, idx) => {
            const id = idsToDelete[idx];
            if (res.status === "fulfilled") {
                successCount += 1;
                selectedIds.delete(id);
                if (editIdInput?.value === id) closeFormPanel();
            }
        });

        showFeedback(
            successCount === idsToDelete.length
                ? `${successCount} produk terpilih berhasil dihapus.`
                : `${successCount} dari ${idsToDelete.length} produk berhasil dihapus.`,
            successCount > 0 ? "success" : "error"
        );
        await loadProducts();
    };

    const onListClick = async (e) => {
        const btn = e.target.closest("button[data-action][data-id]");
        if (!btn) return;
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        const item = allProducts.find((p) => String(p.id) === String(id));
        if (!item) return;

        if (action === "edit") {
            fillFormForEdit(item);
            return;
        }

        if (action === "delete") {
            if (!window.confirm(`Hapus produk "${item.nama || item.judul || "ini"}"?`)) return;
            try {
                await deleteDoc(doc(db, PRODUK_COLLECTION, id));
                selectedIds.delete(String(id));
                allProducts = allProducts.filter((p) => String(p.id) !== String(id));
                if (editIdInput?.value === id) closeFormPanel();
                applyFilterAndRender();
                showFeedback("Produk berhasil dihapus.", "success");
            } catch (err) {
                console.error("Gagal menghapus produk:", err);
                showFeedback("Gagal menghapus produk.", "error");
            }
        }
    };

    const onListChange = (e) => {
        const cb = e.target.closest("[data-produk-check]");
        if (!cb) return;
        const id = cb.getAttribute("data-produk-check");
        if (!id) return;
        if (cb.checked) selectedIds.add(id);
        else selectedIds.delete(id);

        const filtered = getFilteredProducts();
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        syncBulkDeleteUI(filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE));
    };

    const onSelectAllChange = () => {
        const checked = Boolean(selectAllCheckbox?.checked);
        const filtered = getFilteredProducts();
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        pageItems.forEach((item) => {
            if (checked) selectedIds.add(String(item.id));
            else selectedIds.delete(String(item.id));
        });
        listEl?.querySelectorAll("[data-produk-check]").forEach((cb) => {
            cb.checked = checked;
        });
        syncBulkDeleteUI(pageItems);
    };

    const onBackdropClick = (e) => {
        if (e.target === formPanel) closeFormPanel();
    };

    const onKeyDown = (e) => {
        if (e.key === "Escape" && formPanel && !formPanel.classList.contains("hidden")) {
            closeFormPanel();
        }
    };

    const onKategoriBaruKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSimpanKategori();
        }
    };

    const onSatuanBaruKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSimpanSatuan();
        }
    };

    const onFilterChange = () => {
        currentPage = 1;
        applyFilterAndRender();
    };

    const onPrevPage = () => {
        if (currentPage > 1) {
            currentPage -= 1;
            applyFilterAndRender();
        }
    };

    const onNextPage = () => {
        const totalPages = Math.max(1, Math.ceil(getFilteredProducts().length / ITEMS_PER_PAGE));
        if (currentPage < totalPages) {
            currentPage += 1;
            applyFilterAndRender();
        }
    };

    const onOpenCreateModal = () => openFormPanel(null);
    const onToggleKategoriClick = () => toggleTambahKategoriBox();
    const onToggleSatuanClick = () => toggleTambahSatuanBox();

    openBtn?.addEventListener("click", onOpenCreateModal);
    closeFormBtn?.addEventListener("click", closeFormPanel);
    cancelEditBtn?.addEventListener("click", closeFormPanel);
    formPanel?.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeyDown);
    formEl?.addEventListener("submit", onFormSubmit);

    kategoriSelect?.addEventListener("change", syncHapusKategoriButton);
    toggleTambahKategoriBtn?.addEventListener("click", onToggleKategoriClick);
    simpanKategoriBtn?.addEventListener("click", handleSimpanKategori);
    hapusKategoriBtn?.addEventListener("click", handleHapusKategori);
    kategoriBaruInput?.addEventListener("keydown", onKategoriBaruKeyDown);

    hargaInput?.addEventListener("input", onHargaInput);
    satuanSelect?.addEventListener("change", syncHapusSatuanButton);
    toggleTambahSatuanBtn?.addEventListener("click", onToggleSatuanClick);
    simpanSatuanBtn?.addEventListener("click", handleSimpanSatuan);
    hapusSatuanBtn?.addEventListener("click", handleHapusSatuan);
    satuanBaruInput?.addEventListener("keydown", onSatuanBaruKeyDown);

    fileInput?.addEventListener("change", onFileChange);
    gambarUrlInput?.addEventListener("input", onUrlChange);
    listEl?.addEventListener("click", onListClick);
    listEl?.addEventListener("change", onListChange);
    selectAllCheckbox?.addEventListener("change", onSelectAllChange);
    bulkDeleteBtn?.addEventListener("click", handleBulkDelete);
    searchInput?.addEventListener("input", onFilterChange);
    filterStatusSelect?.addEventListener("change", onFilterChange);
    prevPageBtn?.addEventListener("click", onPrevPage);
    nextPageBtn?.addEventListener("click", onNextPage);

    resetForm();
    await Promise.all([loadKategoriList(), loadSatuanList(), loadProducts()]);

    return () => {
        isDestroyed = true;
        if (feedbackTimerId !== null) {
            window.clearTimeout(feedbackTimerId);
            feedbackTimerId = null;
        }
        openBtn?.removeEventListener("click", onOpenCreateModal);
        closeFormBtn?.removeEventListener("click", closeFormPanel);
        cancelEditBtn?.removeEventListener("click", closeFormPanel);
        formPanel?.removeEventListener("click", onBackdropClick);
        document.removeEventListener("keydown", onKeyDown);
        formEl?.removeEventListener("submit", onFormSubmit);

        kategoriSelect?.removeEventListener("change", syncHapusKategoriButton);
        toggleTambahKategoriBtn?.removeEventListener("click", onToggleKategoriClick);
        simpanKategoriBtn?.removeEventListener("click", handleSimpanKategori);
        hapusKategoriBtn?.removeEventListener("click", handleHapusKategori);
        kategoriBaruInput?.removeEventListener("keydown", onKategoriBaruKeyDown);

        hargaInput?.removeEventListener("input", onHargaInput);
        satuanSelect?.removeEventListener("change", syncHapusSatuanButton);
        toggleTambahSatuanBtn?.removeEventListener("click", onToggleSatuanClick);
        simpanSatuanBtn?.removeEventListener("click", handleSimpanSatuan);
        hapusSatuanBtn?.removeEventListener("click", handleHapusSatuan);
        satuanBaruInput?.removeEventListener("keydown", onSatuanBaruKeyDown);

        fileInput?.removeEventListener("change", onFileChange);
        gambarUrlInput?.removeEventListener("input", onUrlChange);
        listEl?.removeEventListener("click", onListClick);
        listEl?.removeEventListener("change", onListChange);
        selectAllCheckbox?.removeEventListener("change", onSelectAllChange);
        bulkDeleteBtn?.removeEventListener("click", handleBulkDelete);
        searchInput?.removeEventListener("input", onFilterChange);
        filterStatusSelect?.removeEventListener("change", onFilterChange);
        prevPageBtn?.removeEventListener("click", onPrevPage);
        nextPageBtn?.removeEventListener("click", onNextPage);
    };
}

export default renderManajemenProduk;