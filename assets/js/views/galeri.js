// File: assets/js/views/galeri.js
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../firebase-init.js";

const JASA_COLLECTIONS = ["jasa_layanan", "layanan", "jasa"];
const DEFAULT_IMG = "assets/icons/Logo.png";
const DEFAULT_WA_NUMBER = "6289602510491";
const PROFILE_CACHE_KEY = "bumkal_profil_cache_v1";

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

function escapeHtml(value = "") {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatHargaLayanan(item = {}) {
    const rawHarga = item.harga ?? item.tarif ?? item.biaya ?? item.price;
    if (rawHarga === undefined || rawHarga === null || String(rawHarga).trim() === "") {
        return "Hubungi Admin";
    }
    const num = Number(String(rawHarga).replace(/[^\d.-]/g, ""));
    if (Number.isFinite(num) && num > 0) {
        const formatted = new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            maximumFractionDigits: 0
        }).format(num);
        const satuan = String(item.satuan || item.unit || "").trim();
        return satuan ? `${formatted} / ${satuan}` : formatted;
    }
    return String(rawHarga).trim() || "Hubungi Admin";
}

function formatWhatsAppUrl(rawPhone = "", brandName = "BUMKal Sinar Mitra Desa", serviceName = "") {
    let digits = String(rawPhone || "").replace(/\D/g, "");
    if (!digits) digits = DEFAULT_WA_NUMBER;
    if (digits.startsWith("0")) {
        digits = "62" + digits.slice(1);
    }
    const text = serviceName
        ? `Halo ${brandName}, saya ingin menanyakan informasi dan pemesanan jasa layanan "${serviceName}".`
        : `Halo ${brandName}, saya ingin bertanya terkait jasa layanan dan paket kegiatan.`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function readCachedProfile() {
    try {
        const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function writeCachedProfile(profileData) {
    try {
        sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileData));
    } catch {
        // Abaikan jika storage tidak tersedia
    }
}

function normalizeProfileData(p = {}) {
    const nama = String(p.nama || "BUMKal Sinar Mitra Desa").trim() || "BUMKal Sinar Mitra Desa";
    const alamat = String(p.alamat || p.alamat_lengkap || "Srihardono, Pundong, Bantul, Indonesia").trim() || "Srihardono, Pundong, Bantul, Indonesia";
    const telp = String(p.telepon || p.telp || p.no_hp || p.wa || "089602510491").trim() || "089602510491";
    const email = String(p.email || "bumkalsri@gmail.com").trim() || "bumkalsri@gmail.com";
    const rawIcon = String(p.iconUrl || p.logo || "").trim();
    const iconUrl = isSafeImageSrc(rawIcon) ? rawIcon : DEFAULT_IMG;

    return { nama, alamat, telp, email, iconUrl };
}

function setSmoothImageSrc(imgEl, targetSrc, fallbackSrc = DEFAULT_IMG) {
    if (!imgEl) return;
    const validSrc = isSafeImageSrc(targetSrc) ? targetSrc : fallbackSrc;
    if (!validSrc) return;

    const currentAttrSrc = imgEl.getAttribute("src") || "";
    if (currentAttrSrc === validSrc && imgEl.complete && imgEl.naturalWidth > 0) {
        imgEl.classList.remove("opacity-0");
        imgEl.classList.add("opacity-100");
        return;
    }

    imgEl.classList.remove("opacity-100");
    imgEl.classList.add("opacity-0");

    const reveal = () => {
        imgEl.classList.remove("opacity-0");
        imgEl.classList.add("opacity-100");
    };

    imgEl.onload = reveal;
    imgEl.onerror = () => {
        if (validSrc !== fallbackSrc && fallbackSrc) {
            imgEl.onerror = reveal;
            imgEl.src = fallbackSrc;
        } else {
            reveal();
        }
    };
    imgEl.src = validSrc;
    if (imgEl.complete && imgEl.naturalWidth > 0) {
        reveal();
    }
}

function applyProfileToDom(profile) {
    const nama = profile.nama || "BUMKal Sinar Mitra Desa";
    const pubBrand = document.getElementById("global-public-brand");
    const pubLogo = document.getElementById("global-public-logo");
    const pubBooking = document.getElementById("global-public-booking-btn");
    const fPhone = document.getElementById("global-footer-phone") || document.getElementById("footer-phone");
    const fEmail = document.getElementById("global-footer-email") || document.getElementById("footer-email");
    const fAddr = document.getElementById("global-footer-address") || document.getElementById("footer-address");
    const fBrand = document.getElementById("global-footer-brand") || document.getElementById("footer-brand");

    if (pubBrand && pubBrand.textContent !== nama) pubBrand.textContent = nama;
    if (pubLogo && profile.iconUrl) setSmoothImageSrc(pubLogo, profile.iconUrl, DEFAULT_IMG);
    if (pubBooking) {
        pubBooking.href = formatWhatsAppUrl(profile.telp, nama);
    }
    if (fPhone && fPhone.textContent !== profile.telp) fPhone.textContent = profile.telp;
    if (fEmail && fEmail.textContent !== profile.email) fEmail.textContent = profile.email;
    if (fAddr && fAddr.textContent !== profile.alamat) fAddr.textContent = profile.alamat;
    if (fBrand && fBrand.textContent !== nama) fBrand.textContent = nama;

    if (typeof window.syncGlobalPublicUserAvatar === "function") {
        window.syncGlobalPublicUserAvatar();
    }
}

async function fetchJasaLayananItems() {
    for (const colName of JASA_COLLECTIONS) {
        try {
            const snap = await getDocs(collection(db, colName));
            if (!snap.empty) {
                const items = [];
                snap.forEach((docSnap) => {
                    items.push({ id: docSnap.id, ...(docSnap.data() || {}) });
                });
                items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
                return items;
            }
        } catch (err) {
            console.warn(`Gagal memuat koleksi ${colName}:`, err);
        }
    }
    return [];
}

export function renderGaleri() {
    return `
        <div class="galeri-landing-root bg-[#f6f3ec] dark:bg-stone-950 text-stone-800 dark:text-stone-100 min-h-full">
            <!-- KONTEN UTAMA -->
            <div class="max-w-6xl w-full mx-auto px-4 md:px-6 py-5 space-y-5">
                <!-- Header & Filter -->
                <div class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-4 sm:p-5 space-y-3.5">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                            <h1 class="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-snug">
                                Jasa Layanan &amp; Paket Pelayanan
                            </h1>
                            <p id="galeri-summary" class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                                Memuat daftar jasa layanan...
                            </p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div class="sm:col-span-2">
                            <label for="galeri-search" class="sr-only">Cari jasa layanan</label>
                            <input
                                type="text"
                                id="galeri-search"
                                placeholder="Cari nama jasa, kategori layanan, atau deskripsi..."
                                class="w-full px-3 py-2 text-xs bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-[#c87d32]"
                            >
                        </div>

                        <div>
                            <label for="galeri-kategori-filter" class="sr-only">Filter kategori layanan</label>
                            <select
                                id="galeri-kategori-filter"
                                class="w-full px-3 py-2 text-xs bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-none text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#c87d32]"
                            >
                                <option value="all">Semua Kategori</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Grid Jasa Layanan -->
                <section
                    id="galeri-grid"
                    class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-2"
                >
                    <div class="col-span-full bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-8 text-center text-xs text-stone-500 dark:text-stone-400">
                        Memuat data jasa layanan dari database...
                    </div>
                </section>
            </div>
        </div>

        <!-- LIGHTBOX MODAL DETAIL JASA -->
        <div id="galeri-lightbox" class="hidden fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 max-w-2xl w-full overflow-hidden shadow-2xl">
                <div class="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800">
                    <h2 id="lightbox-title" class="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">Detail Jasa Layanan</h2>
                    <button id="btn-close-lightbox" type="button" class="text-xs font-semibold px-2.5 py-1 bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-300 transition cursor-pointer">
                        Tutup ✕
                    </button>
                </div>
                <div class="bg-stone-900 flex items-center justify-center max-h-[60vh] overflow-hidden">
                    <img id="lightbox-img" src="" alt="" class="w-full max-h-[60vh] object-contain">
                </div>
                <div class="p-4 space-y-2">
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                        <span id="lightbox-category" class="text-[11px] font-semibold uppercase tracking-wider text-[#c87d32]"></span>
                        <span id="lightbox-price" class="text-xs font-bold text-[#4a5a3f] dark:text-emerald-300"></span>
                    </div>
                    <p id="lightbox-desc" class="text-xs text-stone-600 dark:text-stone-300 leading-relaxed whitespace-pre-line"></p>
                    <div class="pt-2 flex justify-end">
                        <a
                            id="lightbox-wa-btn"
                            href="#"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold bg-[#5c6d4e] hover:bg-[#4b5a3f] text-white rounded-none transition"
                        >
                            Pesan / Tanya via WhatsApp
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export async function initGaleriHandler() {
    let isDestroyed = false;
    let allItems = [];
    let activeProfile = readCachedProfile() || normalizeProfileData({});

    const sidebarEl = document.getElementById("sidebar");
    const prevSidebarDisplay = sidebarEl ? sidebarEl.style.display : "";
    if (sidebarEl) {
        sidebarEl.style.display = "none";
    }

    if (readCachedProfile()) {
        applyProfileToDom(activeProfile);
    } else if (typeof window.syncGlobalPublicUserAvatar === "function") {
        window.syncGlobalPublicUserAvatar();
    }

    const gridEl = document.getElementById("galeri-grid");
    const summaryEl = document.getElementById("galeri-summary");
    const searchInput = document.getElementById("galeri-search");
    const categorySelect = document.getElementById("galeri-kategori-filter");
    const lightboxEl = document.getElementById("galeri-lightbox");
    const btnCloseLightbox = document.getElementById("btn-close-lightbox");

    if (typeof window.syncRunningTextPosition === "function") {
        window.syncRunningTextPosition(true);
    }

    function populateCategories(items) {
        if (!categorySelect) return;
        const currentVal = categorySelect.value || "all";
        const categories = Array.from(
            new Set(
                items
                    .map((it) => String(it.kategori || it.category || "").trim())
                    .filter(Boolean)
            )
        ).sort((a, b) => a.localeCompare(b, "id"));

        categorySelect.innerHTML = `<option value="all">Semua Kategori</option>` + categories
            .map((cat) => `<option value="${escapeHtml(cat.toLowerCase())}">${escapeHtml(cat)}</option>`)
            .join("");

        if (Array.from(categorySelect.options).some((opt) => opt.value === currentVal)) {
            categorySelect.value = currentVal;
        }
    }

    function renderJasaCard(item, idx) {
        const namaJasa = item.nama || item.judul || item.title || "Jasa Layanan";
        const judulSafe = escapeHtml(namaJasa);
        const deskripsiSafe = escapeHtml(item.deskripsi || item.keterangan || item.isi || "-");
        const kategoriSafe = escapeHtml(item.kategori || item.category || "Layanan Umum");
        const hargaSafe = escapeHtml(formatHargaLayanan(item));
        const rawImg = item.gambar || item.foto || item.imageUrl || item.url || DEFAULT_IMG;
        const imgSrc = escapeHtml(isSafeImageSrc(rawImg) ? rawImg : DEFAULT_IMG);
        const waHref = escapeHtml(formatWhatsAppUrl(activeProfile.telp, activeProfile.nama, namaJasa));

        return `
            <article
                data-galeri-index="${idx}"
                class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none overflow-hidden flex flex-col justify-between hover:border-[#c87d32] transition cursor-pointer group"
            >
                <div>
                    <div class="relative w-full h-44 bg-stone-100 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800 overflow-hidden">
                        <img
                            src="${imgSrc}"
                            alt="${judulSafe}"
                            class="w-full h-full object-cover transition duration-300 group-hover:scale-[1.03]"
                            onerror="this.onerror=null;this.src='${DEFAULT_IMG}';"
                        >
                        <span class="absolute top-2.5 left-2.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-stone-900/75 text-white border border-white/20 rounded-none">
                            ${kategoriSafe}
                        </span>
                    </div>
                    <div class="p-4 space-y-1.5">
                        <div class="flex items-start justify-between gap-2">
                            <h2 class="text-sm font-bold text-stone-900 dark:text-stone-100 line-clamp-1">${judulSafe}</h2>
                        </div>
                        <p class="text-xs font-semibold text-[#4a5a3f] dark:text-emerald-300">${hargaSafe}</p>
                        <p class="text-xs text-stone-600 dark:text-stone-300 line-clamp-2 leading-relaxed">${deskripsiSafe}</p>
                    </div>
                </div>
                <div class="px-4 pb-4 pt-1 flex items-center justify-between gap-2 border-t border-stone-200/70 dark:border-stone-800/70">
                    <span class="text-[11px] font-semibold text-stone-500 dark:text-stone-400">Lihat detail</span>
                    <a
                        href="${waHref}"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-stop-lightbox="true"
                        class="text-[11px] font-bold text-[#c87d32] hover:underline"
                    >
                        Pesan Jasa →
                    </a>
                </div>
            </article>
        `;
    }

    function applyFilterAndRender() {
        if (!gridEl || isDestroyed) return;

        const keyword = String(searchInput?.value || "").trim().toLowerCase();
        const selectedCategory = String(categorySelect?.value || "all").trim().toLowerCase();

        const filtered = allItems.filter((item) => {
            const itemCat = String(item.kategori || item.category || "layanan umum").trim().toLowerCase();
            if (selectedCategory !== "all" && itemCat !== selectedCategory) {
                return false;
            }
            if (!keyword) return true;
            const haystack = [
                item.nama,
                item.judul,
                item.title,
                item.deskripsi,
                item.keterangan,
                item.isi,
                item.kategori,
                item.category
            ]
                .map((v) => String(v || "").toLowerCase())
                .join(" ");
            return haystack.includes(keyword);
        });

        if (summaryEl) {
            summaryEl.textContent = `Menampilkan ${filtered.length} dari ${allItems.length} jasa layanan`;
        }

        if (!filtered.length) {
            gridEl.innerHTML = `
                <div class="col-span-full bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-8 text-center">
                    <img src="${DEFAULT_IMG}" alt="Kosong" class="h-12 w-12 object-contain mx-auto mb-2.5 opacity-80">
                    <p class="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        Belum ada jasa layanan yang sesuai.
                    </p>
                </div>
            `;
            return;
        }

        gridEl.innerHTML = filtered.map((it, i) => renderJasaCard(it, i)).join("");
        gridEl._filteredItems = filtered;
    }

    const closeLightbox = () => {
        lightboxEl?.classList.add("hidden");
    };

    const onGridClick = (e) => {
        if (e.target.closest('[data-stop-lightbox="true"]')) return;
        const card = e.target.closest("[data-galeri-index]");
        if (!card || !lightboxEl) return;
        const idx = Number(card.getAttribute("data-galeri-index"));
        const list = gridEl?._filteredItems || allItems;
        const item = list[idx];
        if (!item) return;

        const namaJasa = item.nama || item.judul || item.title || "Jasa Layanan";
        const rawImg = item.gambar || item.foto || item.imageUrl || item.url || DEFAULT_IMG;
        const imgEl = document.getElementById("lightbox-img");
        const titleEl = document.getElementById("lightbox-title");
        const catEl = document.getElementById("lightbox-category");
        const priceEl = document.getElementById("lightbox-price");
        const descEl = document.getElementById("lightbox-desc");
        const waBtnEl = document.getElementById("lightbox-wa-btn");

        if (imgEl) {
            imgEl.onerror = () => {
                imgEl.onerror = null;
                imgEl.src = DEFAULT_IMG;
            };
            imgEl.src = isSafeImageSrc(rawImg) ? rawImg : DEFAULT_IMG;
        }
        if (titleEl) titleEl.textContent = namaJasa;
        if (catEl) catEl.textContent = item.kategori || item.category || "Layanan Umum";
        if (priceEl) priceEl.textContent = formatHargaLayanan(item);
        if (descEl) descEl.textContent = item.deskripsi || item.keterangan || item.isi || "-";
        if (waBtnEl) {
            waBtnEl.href = formatWhatsAppUrl(activeProfile.telp, activeProfile.nama, namaJasa);
        }

        lightboxEl.classList.remove("hidden");
    };

    const onBackdropClick = (e) => {
        if (e.target === lightboxEl) closeLightbox();
    };

    const onKeyDown = (e) => {
        if (e.key === "Escape") closeLightbox();
    };

    const onFilterChange = () => applyFilterAndRender();

    searchInput?.addEventListener("input", onFilterChange);
    categorySelect?.addEventListener("change", onFilterChange);
    gridEl?.addEventListener("click", onGridClick);
    btnCloseLightbox?.addEventListener("click", closeLightbox);
    lightboxEl?.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeyDown);

    const [profResult, jasaItems] = await Promise.all([
        getDoc(doc(db, "pengaturan", "profil_perusahaan")).catch((err) => ({ status: "rejected", reason: err })),
        fetchJasaLayananItems()
    ]);

    if (isDestroyed) return;

    if (profResult && profResult.status !== "rejected" && profResult.exists()) {
        activeProfile = normalizeProfileData(profResult.data() || {});
        writeCachedProfile(activeProfile);
        applyProfileToDom(activeProfile);
    }

    allItems = jasaItems;
    populateCategories(allItems);
    applyFilterAndRender();

    return () => {
        isDestroyed = true;
        if (sidebarEl) {
            sidebarEl.style.display = prevSidebarDisplay;
        }
        searchInput?.removeEventListener("input", onFilterChange);
        categorySelect?.removeEventListener("change", onFilterChange);
        gridEl?.removeEventListener("click", onGridClick);
        btnCloseLightbox?.removeEventListener("click", closeLightbox);
        lightboxEl?.removeEventListener("click", onBackdropClick);
        document.removeEventListener("keydown", onKeyDown);
    };
}

export default renderGaleri;