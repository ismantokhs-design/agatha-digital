// File: assets/js/views/home.js
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { db, auth } from "../firebase-init.js";

const DEFAULT_IMG = "assets/icons/Logo.png";
const DEFAULT_WA_NUMBER = "6289602510491";
const DEFAULT_BRAND_NAME = "Agahta Digital";
const PROFILE_CACHE_KEY = "agahta_profil_cache_v1";
const RUNNING_TEXT_CACHE_KEY = "agahta_running_text_cache_v1";

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

function normalizeWaNumber(phone = "", fallback = DEFAULT_WA_NUMBER) {
    let digits = String(phone || "").replace(/\D/g, "");
    if (!digits) digits = String(fallback || DEFAULT_WA_NUMBER).replace(/\D/g, "");
    if (digits.startsWith("0")) digits = "62" + digits.slice(1);
    return digits || DEFAULT_WA_NUMBER;
}

function stripBasicMarkdown(text = "") {
    return String(text || "").replace(/\*\*/g, "").trim();
}

function buildHeroTitle(brandName = DEFAULT_BRAND_NAME) {
    const clean = String(brandName || "").trim() || DEFAULT_BRAND_NAME;
    return `Solusi & Informasi Digital di ${clean}`;
}

function syncGlobalPublicNavbarData(profile = {}) {
    const nama = profile.nama || DEFAULT_BRAND_NAME;
    const pubBrand = document.getElementById("global-public-brand");
    const pubLogo = document.getElementById("global-public-logo");
    const pubBooking = document.getElementById("global-public-booking-btn");

    if (pubBrand && nama) {
        pubBrand.textContent = nama;
    }
    if (pubLogo && profile.iconUrl && isSafeImageSrc(profile.iconUrl)) {
        pubLogo.src = profile.iconUrl;
    }
    if (pubBooking) {
        const digits = normalizeWaNumber(profile.telp);
        const msg = encodeURIComponent(`Halo ${nama}, saya ingin bertanya terkait produk dan layanan.`);
        pubBooking.href = `https://wa.me/${digits}?text=${msg}`;
    }
    if (typeof window.syncGlobalPublicUserAvatar === "function") {
        window.syncGlobalPublicUserAvatar();
    }
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
        // Abaikan jika storage penuh atau dibatasi
    }
}

function readCachedRunningText() {
    try {
        return String(sessionStorage.getItem(RUNNING_TEXT_CACHE_KEY) || "").trim();
    } catch {
        return "";
    }
}

function writeCachedRunningText(text) {
    try {
        sessionStorage.setItem(RUNNING_TEXT_CACHE_KEY, String(text || "").trim());
    } catch {
        // Abaikan jika storage penuh atau dibatasi
    }
}

function getFallbackDomRunningText() {
    const globalEl = document.getElementById("global-running-text-container");
    if (!globalEl) return "";
    const marqueeOrSpan =
        globalEl.querySelector("#global-running-text") ||
        globalEl.querySelector("marquee") ||
        globalEl.querySelector("[data-running-text]");
    const raw = (marqueeOrSpan ? marqueeOrSpan.textContent : globalEl.textContent) || "";
    return raw.replace(/^📢\s*INFO:\s*/i, "").replace(/\s+/g, " ").trim();
}

function normalizeProfileData(p = {}) {
    const nama = String(p.nama || DEFAULT_BRAND_NAME).trim() || DEFAULT_BRAND_NAME;
    const tagline = String(p.tagline || p.subjudul || "").trim();
    const deskripsi = stripBasicMarkdown(p.deskripsi || p.tentang || p.profil || "");
    const alamat = String(p.alamat || p.alamat_lengkap || "-").trim() || "-";
    const telp = String(p.telepon || p.telp || p.no_hp || p.wa || "-").trim() || "-";
    const email = String(p.email || "-").trim() || "-";
    const bannerUrl = String(p.bannerUrl || p.banner || "").trim();
    const rawIcon = String(p.iconUrl || p.logo || "").trim();
    const iconUrl = isSafeImageSrc(rawIcon) ? rawIcon : DEFAULT_IMG;

    return {
        nama,
        tagline,
        deskripsi,
        alamat,
        telp,
        email,
        bannerUrl: isSafeImageSrc(bannerUrl) ? bannerUrl : "",
        iconUrl
    };
}

function setSmoothImageSrc(imgEl, targetSrc, fallbackSrc = DEFAULT_IMG, instantIfAlreadyShown = false) {
    if (!imgEl) return;
    const validSrc = isSafeImageSrc(targetSrc) ? targetSrc : fallbackSrc;
    if (!validSrc) return;

    const currentAttrSrc = imgEl.getAttribute("src") || "";
    if (currentAttrSrc === validSrc && imgEl.complete && imgEl.naturalWidth > 0) {
        imgEl.classList.remove("opacity-0");
        imgEl.classList.add("opacity-100");
        return;
    }

    if (!instantIfAlreadyShown) {
        imgEl.classList.remove("opacity-100");
        imgEl.classList.add("opacity-0");
    }

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

function applyRunningTextToDom(text) {
    const barEl = document.getElementById("home-running-text-bar");
    const trackEl = document.getElementById("home-running-text-track");
    const clean = String(text || "").trim();
    if (!barEl || !trackEl) return;

    if (!clean) {
        barEl.classList.add("hidden");
        return;
    }

    barEl.classList.remove("hidden");
    const safeHtml = escapeHtml(clean);
    trackEl.innerHTML = `<span>${safeHtml}</span><span class="mx-12 opacity-40">•</span><span>${safeHtml}</span>`;
}

function applyProfileToDom(profile) {
    const nama = profile.nama || DEFAULT_BRAND_NAME;
    const heroImg = document.getElementById("hero-banner-img");
    const heroTitle = document.getElementById("hero-title");
    const heroSub = document.getElementById("hero-subtitle");
    const aboutEl = document.getElementById("about-description");
    const fPhone = document.getElementById("global-footer-phone") || document.getElementById("footer-phone");
    const fEmail = document.getElementById("global-footer-email") || document.getElementById("footer-email");
    const fAddr = document.getElementById("global-footer-address") || document.getElementById("footer-address");
    const fBrand = document.getElementById("global-footer-brand") || document.getElementById("footer-brand");

    if (profile.bannerUrl) {
        setSmoothImageSrc(heroImg, profile.bannerUrl, "", true);
    }

    const nextHeroTitle = buildHeroTitle(nama);
    if (heroTitle && heroTitle.textContent !== nextHeroTitle) {
        heroTitle.textContent = nextHeroTitle;
    }
    if (heroSub && profile.tagline && heroSub.textContent !== profile.tagline) {
        heroSub.textContent = profile.tagline;
    }
    if (aboutEl && profile.deskripsi && aboutEl.textContent !== profile.deskripsi) {
        aboutEl.textContent = profile.deskripsi;
    }
    if (fPhone && fPhone.textContent !== profile.telp) fPhone.textContent = profile.telp;
    if (fEmail && fEmail.textContent !== profile.email) fEmail.textContent = profile.email;
    if (fAddr && fAddr.textContent !== profile.alamat) fAddr.textContent = profile.alamat;
    if (fBrand && fBrand.textContent !== nama) fBrand.textContent = nama;

    syncGlobalPublicNavbarData(profile);
}

function dismissLoginOverlaySmoothly() {
    const overlay = document.getElementById("login-home-transition");
    if (!overlay) return;
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    setTimeout(() => {
        overlay.remove();
    }, 350);
}

export function renderHome() {
    const cached = readCachedProfile();
    const cachedRunningText = readCachedRunningText() || getFallbackDomRunningText();
    const brandText = escapeHtml(cached?.nama || DEFAULT_BRAND_NAME);
    const bannerSrc = escapeHtml(cached?.bannerUrl || "");
    const heroTitleText = escapeHtml(buildHeroTitle(brandText));
    const heroSubtitleText = escapeHtml(
        cached?.tagline ||
        "Katalog produk, galeri kegiatan, dan layanan informasi terpadu."
    );
    const aboutText = escapeHtml(
        cached?.deskripsi ||
        "Portal digital Agahta Digital untuk informasi produk, dokumentasi galeri, serta layanan komunikasi yang mudah diakses."
    );
    const safeRunningText = escapeHtml(cachedRunningText);

    return `
        <style>
            html,
            body,
            .home-landing-root,
            .home-no-scrollbar {
                scrollbar-width: none;
                -ms-overflow-style: none;
            }
            html::-webkit-scrollbar,
            body::-webkit-scrollbar,
            .home-landing-root::-webkit-scrollbar,
            .home-no-scrollbar::-webkit-scrollbar {
                display: none;
                width: 0;
                height: 0;
            }
            .home-landing-root {
                width: 100%;
                min-height: 100%;
                display: flex;
                flex-direction: column;
            }
            @keyframes homeMarqueeScroll {
                0% { transform: translateX(0%); }
                100% { transform: translateX(-50%); }
            }
            .home-marquee-track {
                display: inline-flex;
                align-items: center;
                white-space: nowrap;
                min-width: 200%;
                animation: homeMarqueeScroll 26s linear infinite;
            }
            .home-marquee-wrap:hover .home-marquee-track {
                animation-play-state: paused;
            }
        </style>
        <div class="home-landing-root bg-[#f6f3ec] dark:bg-stone-950 text-stone-800 dark:text-stone-100">
            <!-- HERO BANNER -->
            <section class="relative w-full h-[210px] sm:h-[245px] lg:h-[265px] overflow-hidden bg-stone-800 shrink-0">
                <img
                    id="hero-banner-img"
                    src="${bannerSrc}"
                    alt="Banner Utama ${brandText}"
                    class="absolute inset-0 z-0 w-full h-full object-cover object-center ${bannerSrc ? "opacity-100" : "opacity-0"} transition-opacity duration-200"
                />
                <div class="absolute inset-0 z-10 bg-gradient-to-r from-black/80 via-black/45 to-transparent"></div>

                <div class="relative z-20 max-w-6xl mx-auto h-full px-4 md:px-6 flex flex-col justify-center text-white">
                    <h1 id="hero-title" class="text-xl sm:text-2xl lg:text-4xl font-extrabold leading-tight max-w-2xl drop-shadow-sm">
                        ${heroTitleText}
                    </h1>
                    <p id="hero-subtitle" class="mt-2 text-xs sm:text-sm text-stone-100 max-w-xl leading-snug line-clamp-2 drop-shadow-sm">
                        ${heroSubtitleText}
                    </p>
                    <div class="mt-4 flex flex-wrap items-center gap-2.5">
                        <a href="#/produk" data-link class="bg-[#d47a2a] hover:bg-[#bc681e] text-white text-xs font-semibold px-4 py-2 rounded-full transition">
                            Lihat Produk
                        </a>
                        <a href="#/kontak" data-link class="border border-white/80 hover:bg-white/15 text-white text-xs font-semibold px-4 py-2 rounded-full transition">
                            Hubungi Kami
                        </a>
                    </div>
                </div>
            </section>

            <!-- RUNNING TEXT -->
            <div id="home-running-text-bar" class="${safeRunningText ? "" : "hidden"} w-full bg-[#fcf7e8] dark:bg-stone-900 border-b border-amber-200/80 dark:border-stone-800 shrink-0 overflow-hidden">
                <div class="max-w-6xl mx-auto px-4 md:px-6 h-8 flex items-center gap-2.5 text-xs">
                    <span class="inline-flex items-center gap-1 font-bold text-[#9a5518] dark:text-amber-400 shrink-0">
                        <span aria-hidden="true">📢</span>
                        <span>INFO:</span>
                    </span>
                    <div class="home-marquee-wrap flex-1 min-w-0 overflow-hidden relative">
                        <div id="home-running-text-track" class="home-marquee-track text-[#7c4514] dark:text-amber-200 font-medium">
                            <span>${safeRunningText}</span><span class="mx-12 opacity-40">•</span><span>${safeRunningText}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TENTANG KAMI -->
            <main class="max-w-6xl w-full mx-auto px-4 md:px-6 py-6 flex-1 min-h-0">
                <section class="bg-[#faf8f3] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-none p-5 md:p-6 space-y-2.5">
                    <h2 class="text-base md:text-lg font-bold text-stone-900 dark:text-stone-100">Tentang Kami</h2>
                    <p id="about-description" class="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed whitespace-pre-line">
                        ${aboutText}
                    </p>
                </section>
            </main>
        </div>
    `;
}

export function initHomeHandler() {
    let isDestroyed = false;

    dismissLoginOverlaySmoothly();

    if (readCachedProfile()) {
        applyProfileToDom(readCachedProfile());
    } else if (typeof window.syncGlobalPublicUserAvatar === "function") {
        window.syncGlobalPublicUserAvatar();
    }

    const initialRunningText = readCachedRunningText() || getFallbackDomRunningText();
    if (initialRunningText) {
        applyRunningTextToDom(initialRunningText);
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (isDestroyed) return;
        if (user?.photoURL && isSafeImageSrc(user.photoURL)) {
            localStorage.setItem("user_avatar", user.photoURL);
        }
        if (user?.displayName) {
            const formattedName = user.displayName.charAt(0).toUpperCase() + user.displayName.slice(1);
            if (!localStorage.getItem("user_name")) {
                localStorage.setItem("user_name", formattedName);
            }
        }
        if (typeof window.syncGlobalPublicUserAvatar === "function") {
            window.syncGlobalPublicUserAvatar();
        }
    });

    (async () => {
        const [profResult, runningTextResult] = await Promise.allSettled([
            getDoc(doc(db, "pengaturan", "profil_perusahaan")),
            getDocs(collection(db, "running_text"))
        ]);

        if (isDestroyed) return;

        let profileRunningText = "";
        if (profResult.status === "fulfilled" && profResult.value.exists()) {
            const rawProf = profResult.value.data() || {};
            profileRunningText = String(rawProf.runningText || rawProf.running_text || rawProf.pengumuman || "").trim();
            const normalized = normalizeProfileData(rawProf);
            writeCachedProfile(normalized);
            applyProfileToDom(normalized);
        } else if (profResult.status === "rejected") {
            console.warn("Profil perusahaan belum dapat dimuat:", profResult.reason?.message || profResult.reason);
        }

        let resolvedRunningText = "";
        if (runningTextResult.status === "fulfilled") {
            const activeTexts = [];
            runningTextResult.value.forEach((tDoc) => {
                const d = tDoc.data() || {};
                const statusStr = String(d.status || "Aktif").trim().toLowerCase();
                const isActive = typeof d.aktif === "boolean"
                    ? d.aktif
                    : (statusStr === "aktif" || statusStr === "active" || statusStr === "true" || statusStr === "");
                const isi = String(d.teks || d.text || d.isi || d.pesan || d.judul || "").trim();
                if (isActive && isi) {
                    activeTexts.push({
                        isi,
                        urutan: Number(d.urutan ?? 999),
                        createdAt: String(d.createdAt || "")
                    });
                }
            });
            activeTexts.sort((a, b) => a.urutan - b.urutan || b.createdAt.localeCompare(a.createdAt));
            if (activeTexts.length) {
                resolvedRunningText = activeTexts.map((item) => item.isi).join("   •   ");
            }
        }

        if (!resolvedRunningText) {
            resolvedRunningText = profileRunningText || getFallbackDomRunningText() || readCachedRunningText();
        }
        writeCachedRunningText(resolvedRunningText);
        applyRunningTextToDom(resolvedRunningText);
    })();

    return () => {
        isDestroyed = true;
        unsubscribeAuth?.();
    };
}

export default renderHome;