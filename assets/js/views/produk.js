// File: assets/js/views/produk.js
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { db, auth } from "../firebase-init.js";

const DEFAULT_BRAND_NAME = "BUMKal Sinar Mitra Desa";
const DEFAULT_WA_NUMBER = "6289602510491";
const DEFAULT_IMG = "assets/icons/logo.png";
const PROFILE_CACHE_KEY = "bumkal_profil_cache_v1";
const DESC_PREVIEW_LIMIT = 95;

function escapeHtml(value = "") {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function isSafeImageSrc(val = "") {
    const trimmed = String(val || "").trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") return false;
    return (
        trimmed.startsWith("https://") ||
        trimmed.startsWith("http://") ||
        trimmed.startsWith("assets/") ||
        trimmed.startsWith("./") ||
        trimmed.startsWith("/") ||
        trimmed.startsWith("data:image/")
    );
}

function readCachedProfile() {
    try {
        const raw = sessionStorage.getItem(PROFILE_CACHE_KEY) || sessionStorage.getItem("agahta_profil_cache_v1");
        if (!raw) return { nama: DEFAULT_BRAND_NAME, telepon: DEFAULT_WA_NUMBER };
        const parsed = JSON.parse(raw);
        return {
            nama: String(parsed?.nama || DEFAULT_BRAND_NAME).trim() || DEFAULT_BRAND_NAME,
            telepon: String(parsed?.telepon || parsed?.telp || parsed?.no_hp || parsed?.wa || DEFAULT_WA_NUMBER).trim() || DEFAULT_WA_NUMBER
        };
    } catch {
        return { nama: DEFAULT_BRAND_NAME, telepon: DEFAULT_WA_NUMBER };
    }
}

function writeCachedProfile(profileData) {
    try {
        sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileData));
    } catch {
        // Abaikan jika storage tidak tersedia
    }
}

function formatRupiah(amount) {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) return "Hubungi Kami";
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(num);
}

function buildWaOrderUrl(rawPhone, brandName, productName, priceLabel) {
    let digits = String(rawPhone || "").replace(/\D/g, "");
    if (!digits) digits = DEFAULT_WA_NUMBER;
    if (digits.startsWith("0")) digits = "62" + digits.slice(1);
    const text = encodeURIComponent(
        `Halo ${brandName}, saya ingin menanyakan produk *${productName}* (${priceLabel}).`
    );
    return `https://wa.me/${digits}?text=${text}`;
}

function buildDescriptionHtml(deskripsi = "", index = 0) {
    const clean = String(deskripsi || "").trim();
    if (!clean) {
        return `<p class="text-[11px] sm:text-xs text-stone-400 dark:text-stone-500 italic">Belum ada deskripsi produk.</p>`;
    }

    if (clean.length <= DESC_PREVIEW_LIMIT) {
        return `<p class="text-[11px] sm:text-xs text-stone-600 dark:text-stone-400 leading-relaxed">${escapeHtml(clean)}</p>`;
    }

    const snippet = clean.slice(0, DESC_PREVIEW_LIMIT).trimEnd();
    return `
        <p class="text-[11px] sm:text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            ${escapeHtml(snippet)}
            <button
                type="button"
                data-open-detail="${index}"
                class="inline font-semibold text-[#c87d32] hover:underline cursor-pointer ml-0.5"
            >Selanjutnya.....</button>
        </p>
    `;
}

function mapProdukDoc(docId, data = {}) {
    const nama = String(
        data.nama ||
        data.namaProduk ||
        data.nama_produk ||
        data.judul ||
        data.title ||
        "Produk"
    ).trim();

    const kategori = String(
        data.kategori ||
        data.category ||
        data.jenis ||
        "Umum"
    ).trim() || "Umum";

    const deskripsi = String(
        data.deskripsi ||
        data.description ||
        data.keterangan ||
        ""
    ).trim();

    const hargaRaw = data.harga ?? data.price ?? data.nominal ?? 0;
    const harga = typeof hargaRaw === "string"
        ? Number(hargaRaw.replace(/[^\d.-]/g, "")) || 0
        : Number(hargaRaw) || 0;

    const satuan = String(data.satuan || data.unit || "").trim();
    const stok = data.stok ?? data.stock ?? null;

    const gambar = String(
        data.gambar ||
        data.gambarUrl ||
        data.foto ||
        data.fotoUrl ||
        data.image ||
        data.imageUrl ||
        ""
    ).trim();

    const aktif = typeof data.aktif === "boolean"
        ? data.aktif
        : !["nonaktif", "inactive", "false", "arsip", "habis"].includes(String(data.status || "").trim().toLowerCase());

    return {
        id: docId,
        nama,
        kategori,
        deskripsi,
        harga,
        satuan,
        stok,
        gambar,
        aktif
    };
}

export function renderProduk() {
    const profile = readCachedProfile();
    const brandName = escapeHtml(profile.nama);

    return `
        <div class="max-w-5xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-6 text-stone-800 dark:text-stone-100">
            <div class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-3 sm:p-6 space-y-4 sm:space-y-5">
                <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-stone-200 dark:border-stone-800 pb-4">
                    <div>
                        <div id="produk-brand-label" class="text-[11px] font-bold uppercase tracking-wider text-[#5c6d4e] dark:text-emerald-400">
                            ${brandName}
                        </div>
                        <h1 class="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                            Katalog Produk
                        </h1>
                        <p id="produk-brand-subtitle" class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                            Daftar produk dan layanan tersedia di ${brandName}.
                        </p>
                    </div>

                    <div id="produk-count-badge" class="text-[11px] font-semibold text-stone-600 dark:text-stone-300 bg-[#f6f3ec] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 px-3 py-1.5 rounded-none self-start sm:self-auto">
                        Memuat produk...
                    </div>
                </div>

                <!-- Filter Pencarian & Kategori -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div class="sm:col-span-2">
                        <label for="produk-search-input" class="block text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                            Cari Produk
                        </label>
                        <input
                            id="produk-search-input"
                            type="search"
                            placeholder="Ketik nama atau deskripsi produk..."
                            class="w-full px-3 py-2 text-xs bg-white dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                        >
                    </div>

                    <div>
                        <label for="produk-category-select" class="block text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                            Kategori
                        </label>
                        <select
                            id="produk-category-select"
                            class="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-none text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                        >
                            <option value="all">Semua Kategori</option>
                        </select>
                    </div>
                </div>

                <!-- Status Pesan -->
                <div id="produk-status-box" class="hidden text-xs px-3 py-2.5 bg-[#f6f3ec] dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-none text-stone-700 dark:text-stone-200"></div>

                <!-- Grid Daftar Produk (2 Kolom Kanan-Kiri di HP, 3 Kolom di Desktop) -->
                <div id="produk-grid" class="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
                    <div class="col-span-full py-10 text-center text-xs text-stone-500 dark:text-stone-400">
                        Memuat data produk...
                    </div>
                </div>
            </div>
        </div>

        <!-- MODAL DETAIL & GAMBAR BESAR -->
        <div
            id="produk-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="produk-detail-title"
            class="hidden fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
        >
            <div class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 max-w-2xl w-full overflow-hidden shadow-2xl my-auto">
                <div class="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800">
                    <h2 id="produk-detail-title" class="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                        Detail Produk
                    </h2>
                    <button
                        id="btn-close-produk-detail"
                        type="button"
                        class="text-xs font-semibold px-2.5 py-1 bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-300 dark:hover:bg-stone-700 transition cursor-pointer"
                    >
                        Tutup ✕
                    </button>
                </div>

                <div class="bg-stone-900 flex items-center justify-center max-h-[60vh] overflow-hidden border-b border-stone-200 dark:border-stone-800">
                    <img
                        id="produk-detail-img"
                        src="${DEFAULT_IMG}"
                        alt=""
                        class="w-full max-h-[60vh] object-contain"
                    >
                </div>

                <div class="p-4 sm:p-5 space-y-3">
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                        <span id="produk-detail-category" class="text-[11px] font-bold uppercase tracking-wider text-[#5c6d4e] dark:text-emerald-400"></span>
                        <span id="produk-detail-stock" class="text-[11px] font-semibold px-2 py-0.5 bg-[#f6f3ec] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300"></span>
                    </div>

                    <div id="produk-detail-price" class="text-sm font-extrabold text-stone-900 dark:text-stone-100"></div>

                    <p id="produk-detail-desc" class="text-xs text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-line"></p>

                    <div class="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-2">
                        <a
                            id="produk-detail-wa-btn"
                            href="#"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="px-3.5 py-2 text-xs font-semibold bg-[#5c6d4e] hover:bg-[#4b5a3f] text-white rounded-none transition"
                        >
                            Tanya Produk
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function initProdukHandler() {
    let isDestroyed = false;
    let allProducts = [];
    let filteredProducts = [];
    let activeProfile = readCachedProfile();

    const brandLabelEl = document.getElementById("produk-brand-label");
    const brandSubtitleEl = document.getElementById("produk-brand-subtitle");
    const searchInput = document.getElementById("produk-search-input");
    const categorySelect = document.getElementById("produk-category-select");
    const countBadge = document.getElementById("produk-count-badge");
    const statusBox = document.getElementById("produk-status-box");
    const gridEl = document.getElementById("produk-grid");
    const detailModalEl = document.getElementById("produk-detail-modal");
    const closeDetailBtn = document.getElementById("btn-close-produk-detail");

    function applyBrandHeader() {
        if (isDestroyed) return;
        if (brandLabelEl) brandLabelEl.textContent = activeProfile.nama;
        if (brandSubtitleEl) {
            brandSubtitleEl.textContent = `Daftar produk dan layanan tersedia di ${activeProfile.nama}.`;
        }
    }

    function setStatus(msg = "", tone = "neutral") {
        if (!statusBox || isDestroyed) return;
        if (!msg) {
            statusBox.classList.add("hidden");
            statusBox.textContent = "";
            return;
        }
        statusBox.classList.remove("hidden");
        statusBox.textContent = msg;
        if (tone === "error") {
            statusBox.className = "text-xs px-3 py-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-none text-rose-800 dark:text-rose-200 font-medium";
        } else {
            statusBox.className = "text-xs px-3 py-2.5 bg-[#f6f3ec] dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-none text-stone-700 dark:text-stone-200";
        }
    }

    function populateCategories(items) {
        if (!categorySelect || isDestroyed) return;
        const previous = categorySelect.value || "all";
        const categories = Array.from(
            new Set(items.map((item) => item.kategori).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b, "id"));

        categorySelect.innerHTML = [
            `<option value="all">Semua Kategori</option>`,
            ...categories.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
        ].join("");

        if (categories.includes(previous)) {
            categorySelect.value = previous;
        } else {
            categorySelect.value = "all";
        }
    }

    function openDetailModal(item) {
        if (!item || !detailModalEl || isDestroyed) return;
        const safeImg = isSafeImageSrc(item.gambar) ? item.gambar : DEFAULT_IMG;
        const priceText = formatRupiah(item.harga);
        const priceFullText = item.satuan && item.harga > 0 ? `${priceText} / ${item.satuan}` : priceText;

        const imgEl = document.getElementById("produk-detail-img");
        const titleEl = document.getElementById("produk-detail-title");
        const catEl = document.getElementById("produk-detail-category");
        const stockEl = document.getElementById("produk-detail-stock");
        const priceEl = document.getElementById("produk-detail-price");
        const descEl = document.getElementById("produk-detail-desc");
        const waBtnEl = document.getElementById("produk-detail-wa-btn");

        if (imgEl) {
            imgEl.onerror = () => {
                imgEl.onerror = null;
                imgEl.src = DEFAULT_IMG;
            };
            imgEl.src = safeImg;
            imgEl.alt = item.nama;
        }
        if (titleEl) titleEl.textContent = item.nama;
        if (catEl) catEl.textContent = item.kategori;
        if (stockEl) {
            const hasStock = item.stok !== null && item.stok !== undefined && String(item.stok).trim() !== "";
            stockEl.textContent = hasStock ? `Stok: ${item.stok}` : "Stok: Hubungi Admin";
        }
        if (priceEl) priceEl.textContent = priceFullText;
        if (descEl) descEl.textContent = item.deskripsi || "Belum ada deskripsi produk.";
        if (waBtnEl) {
            waBtnEl.href = buildWaOrderUrl(activeProfile.telepon, activeProfile.nama, item.nama, priceText);
        }

        detailModalEl.classList.remove("hidden");
    }

    function closeDetailModal() {
        detailModalEl?.classList.add("hidden");
    }

    function renderFilteredGrid() {
        if (!gridEl || isDestroyed) return;

        const keyword = String(searchInput?.value || "").trim().toLowerCase();
        const selectedCat = String(categorySelect?.value || "all");

        filteredProducts = allProducts.filter((item) => {
            if (!item.aktif) return false;
            const matchCat = selectedCat === "all" || item.kategori === selectedCat;
            if (!matchCat) return false;
            if (!keyword) return true;
            const haystack = `${item.nama} ${item.kategori} ${item.deskripsi}`.toLowerCase();
            return haystack.includes(keyword);
        });

        if (countBadge) {
            countBadge.textContent = `${filteredProducts.length} Produk`;
        }

        if (filteredProducts.length === 0) {
            gridEl.innerHTML = `
                <div class="col-span-full py-10 text-center bg-[#f6f3ec] dark:bg-stone-950/50 border border-stone-200 dark:border-stone-800 rounded-none space-y-1">
                    <div class="text-xs font-bold text-stone-700 dark:text-stone-200">Tidak ada produk yang cocok</div>
                    <div class="text-[11px] text-stone-500 dark:text-stone-400">Coba ubah kata kunci pencarian atau pilih kategori lain.</div>
                </div>
            `;
            return;
        }

        gridEl.innerHTML = filteredProducts.map((item, idx) => {
            const safeImg = isSafeImageSrc(item.gambar) ? item.gambar : DEFAULT_IMG;
            const imgSrcSafe = escapeHtml(safeImg);
            const fallbackImgSafe = escapeHtml(DEFAULT_IMG);
            const priceText = formatRupiah(item.harga);
            const priceDisplay = item.satuan && item.harga > 0
                ? `${escapeHtml(priceText)} <span class="text-[10px] sm:text-[11px] font-normal text-stone-500 dark:text-stone-400">/ ${escapeHtml(item.satuan)}</span>`
                : escapeHtml(priceText);

            const stockBadge = item.stok !== null && item.stok !== undefined && String(item.stok).trim() !== ""
                ? `<span class="text-[9px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 bg-[#f6f3ec] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 flex-shrink-0">Stok: ${escapeHtml(String(item.stok))}</span>`
                : "";

            const waUrl = escapeHtml(buildWaOrderUrl(activeProfile.telepon, activeProfile.nama, item.nama, priceText));
            const descHtml = buildDescriptionHtml(item.deskripsi, idx);

            return `
                <article
                    data-produk-card="${idx}"
                    class="bg-white dark:bg-stone-950/70 border border-stone-200 dark:border-stone-800 hover:border-[#c87d32] rounded-none flex flex-col justify-between overflow-hidden transition cursor-pointer group"
                >
                    <div>
                        <img
                            src="${imgSrcSafe}"
                            alt="${escapeHtml(item.nama)}"
                            loading="lazy"
                            onerror="this.onerror=null;this.src='${fallbackImgSafe}';"
                            class="w-full h-28 sm:h-40 object-cover bg-[#f6f3ec] dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 transition duration-300 group-hover:scale-[1.02]"
                        >
                        <div class="p-2.5 sm:p-3.5 space-y-1.5 sm:space-y-2">
                            <div class="flex items-center justify-between gap-1.5 flex-wrap">
                                <span class="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#5c6d4e] dark:text-emerald-400 truncate">
                                    ${escapeHtml(item.kategori)}
                                </span>
                                ${stockBadge}
                            </div>

                            <h2 class="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 leading-snug line-clamp-2">
                                ${escapeHtml(item.nama)}
                            </h2>

                            ${descHtml}
                        </div>
                    </div>

                    <div class="px-2.5 sm:px-3.5 py-2.5 sm:py-3 bg-[#f6f3ec] dark:bg-stone-900/80 border-t border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div class="text-[11px] sm:text-xs font-extrabold text-stone-900 dark:text-stone-100">
                            ${priceDisplay}
                        </div>
                        <a
                            href="${waUrl}"
                            target="_blank"
                            rel="noopener noreferrer"
                            data-stop-detail="true"
                            class="px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold bg-[#5c6d4e] hover:bg-[#4b5a3f] text-white rounded-none transition text-center flex-shrink-0"
                        >
                            Tanya Produk
                        </a>
                    </div>
                </article>
            `;
        }).join("");
    }

    async function loadProfileIfNeeded() {
        try {
            const profSnap = await getDoc(doc(db, "pengaturan", "profil_perusahaan"));
            if (isDestroyed || !profSnap.exists()) return;
            const p = profSnap.data() || {};
            const normalized = {
                nama: String(p.nama || DEFAULT_BRAND_NAME).trim() || DEFAULT_BRAND_NAME,
                telepon: String(p.telepon || p.telp || p.no_hp || p.wa || DEFAULT_WA_NUMBER).trim() || DEFAULT_WA_NUMBER
            };
            activeProfile = normalized;
            writeCachedProfile(normalized);
            applyBrandHeader();
            if (allProducts.length > 0) {
                renderFilteredGrid();
            }
        } catch (err) {
            console.warn("Gagal memuat profil perusahaan di katalog produk:", err?.message || err);
        }
    }

    async function loadProduk() {
        if (isDestroyed) return;
        setStatus("", "neutral");

        try {
            const snap = await getDocs(collection(db, "produk"));
            if (isDestroyed) return;

            const items = [];
            snap.forEach((docSnap) => {
                const mapped = mapProdukDoc(docSnap.id, docSnap.data() || {});
                if (mapped.aktif) {
                    items.push(mapped);
                }
            });

            items.sort((a, b) => a.nama.localeCompare(b.nama, "id"));
            allProducts = items;
            populateCategories(allProducts);
            renderFilteredGrid();
        } catch (err) {
            if (isDestroyed) return;
            console.warn("Gagal memuat koleksi produk:", err?.message || err);
            allProducts = [];
            if (countBadge) countBadge.textContent = "0 Produk";
            setStatus(`Gagal memuat data produk: ${err?.message || "Periksa izin akses Firestore"}.`, "error");
            if (gridEl) {
                gridEl.innerHTML = `
                    <div class="col-span-full py-10 text-center text-xs text-stone-500 dark:text-stone-400">
                        Data produk belum dapat ditampilkan.
                    </div>
                `;
            }
        }
    }

    const onGridClick = (e) => {
        if (e.target.closest('[data-stop-detail="true"]')) return;
        const moreBtn = e.target.closest("[data-open-detail]");
        if (moreBtn) {
            const idx = Number(moreBtn.getAttribute("data-open-detail"));
            if (filteredProducts[idx]) openDetailModal(filteredProducts[idx]);
            return;
        }
        const card = e.target.closest("[data-produk-card]");
        if (!card) return;
        const idx = Number(card.getAttribute("data-produk-card"));
        if (filteredProducts[idx]) openDetailModal(filteredProducts[idx]);
    };

    const onBackdropClick = (e) => {
        if (e.target === detailModalEl) closeDetailModal();
    };

    const onKeyDown = (e) => {
        if (e.key === "Escape") closeDetailModal();
    };

    const unsubscribeAuth = onAuthStateChanged(auth, () => {
        if (!isDestroyed) {
            loadProduk();
        }
    });

    searchInput?.addEventListener("input", renderFilteredGrid);
    categorySelect?.addEventListener("change", renderFilteredGrid);
    gridEl?.addEventListener("click", onGridClick);
    closeDetailBtn?.addEventListener("click", closeDetailModal);
    detailModalEl?.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeyDown);

    loadProfileIfNeeded();

    return () => {
        isDestroyed = true;
        if (typeof unsubscribeAuth === "function") unsubscribeAuth();
        searchInput?.removeEventListener("input", renderFilteredGrid);
        categorySelect?.removeEventListener("change", renderFilteredGrid);
        gridEl?.removeEventListener("click", onGridClick);
        closeDetailBtn?.removeEventListener("click", closeDetailModal);
        detailModalEl?.removeEventListener("click", onBackdropClick);
        document.removeEventListener("keydown", onKeyDown);
    };
}

export default renderProduk;