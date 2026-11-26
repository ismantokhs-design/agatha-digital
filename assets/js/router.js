// File: assets/js/router.js
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDoc, setDoc, doc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";
import { renderHome, initHomeHandler } from './views/home.js';
import { renderGaleri, initGaleriHandler } from './views/galeri.js';
import { renderProduk, initProdukHandler } from './views/produk.js';
import { renderManajemen, initManajemenHandler } from './views/manajemen.js';
import { renderManajemenProduk, initManajemenProdukHandler } from './views/manajemen-produk.js';
import { renderManajemenDetailUnit, initManajemenDetailUnitHandler } from './views/manajemen-detail-unit.js';
import { renderManajemenGaleri, initManajemenGaleriHandler } from './views/manajemen-galeri.js';
import { renderManajemenJasa, initManajemenJasaHandler } from './views/manajemen-jasa.js';
import { renderManajemenPengaturan, initManajemenPengaturanHandler } from './views/manajemen-pengaturan.js';
import { renderManajemenText, initManajemenTextHandler } from './views/manajemen-text.js';
import { renderDatabaseControlSize, initDatabaseControlSizeHandler } from './views/database-control-size.js';
import { renderDatabaseResetData, initDatabaseResetDataHandler } from './views/database-reset-data.js';
import { renderKontak, initKontakHandler } from './views/kontak.js';
import { renderTamu, initTamuHandler } from './views/tamu.js';
import { renderStaf, initStafHandler } from './views/staf.js';
import { renderAnalytics, initAnalyticsHandler } from './views/analytics.js';
import { renderDatabase, initDatabaseHandler } from './views/database.js';
import { renderLogin, initLoginHandler } from './views/login.js';

const DEFAULT_USER_ROLE = 'Tamu';

function ensureGlobalScrollbarHiddenStyle() {
    if (typeof document === "undefined") return;
    if (document.getElementById("agahta-hide-scrollbar-style")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "agahta-hide-scrollbar-style";
    styleEl.textContent = `
        html,
        body,
        #app,
        .agahta-no-scrollbar {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
        }
        html::-webkit-scrollbar,
        body::-webkit-scrollbar,
        #app::-webkit-scrollbar,
        .agahta-no-scrollbar::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
            background: transparent !important;
        }
    `;
    (document.head || document.documentElement).appendChild(styleEl);
}

const PUBLIC_LANDING_ROUTES = ['/', '/produk', '/galeri', '/kontak'];

function extractRoutePath() {
    const raw = String(location.hash || "").slice(1).split("?")[0].trim().toLowerCase();
    if (!raw) return "/";
    return raw.startsWith("/") ? raw : `/${raw}`;
}

function isSafeAvatarSrc(src = "") {
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

async function inspectUsersBootstrap(currentUid) {
    try {
        const usersCol = collection(db, "users");
        const allUsersSnap = await getDocs(usersCol);
        const otherDocs = allUsersSnap.docs.filter(d => d.id !== currentUid);

        if (otherDocs.length === 0) {
            return { isFirstLogin: true, hasOtherAdmin: false };
        }

        const hasOtherAdmin = otherDocs.some(
            d => String(d.data()?.role || "").trim().toLowerCase() === "administrator"
        );

        return { isFirstLogin: false, hasOtherAdmin };
    } catch (err) {
        console.warn("Gagal memeriksa koleksi users di router:", err);
        return { isFirstLogin: false, hasOtherAdmin: false };
    }
}

const routeAliases = {
    '/katalog': '/produk',
    '/unit-usaha': '/',
    '/kas-layanan': '/',
    '/pengaturan': '/manajemen-pengaturan',
    '/event': '/manajemen-berita',
    '/unit-usaha/detail': '/manajemen-detail-unit',
    '/control-size': '/database-control-size'
};

const routes = {
    '/': renderHome,
    '/produk': renderProduk,
    '/galeri': renderGaleri,
    '/manajemen': renderManajemen,
    '/manajemen-produk': renderManajemenProduk,
    '/manajemen-detail-unit': renderManajemenDetailUnit,
    '/manajemen-galeri': renderManajemenGaleri,
    '/manajemen-berita': renderManajemenJasa,
    '/manajemen-pengaturan': renderManajemenPengaturan,
    '/text': renderManajemenText,
    '/database-control-size': renderDatabaseControlSize,
    '/reset-data': renderDatabaseResetData,
    '/kontak': renderKontak,
    '/tamu': renderTamu,
    '/staf': renderStaf,
    '/analytics': renderAnalytics,
    '/database': renderDatabase,
    '/login': renderLogin
};

const handlers = {
    '/': initHomeHandler,
    '/produk': initProdukHandler,
    '/galeri': initGaleriHandler,
    '/manajemen': initManajemenHandler,
    '/manajemen-produk': initManajemenProdukHandler,
    '/manajemen-detail-unit': initManajemenDetailUnitHandler,
    '/manajemen-galeri': initManajemenGaleriHandler,
    '/manajemen-berita': initManajemenJasaHandler,
    '/manajemen-pengaturan': initManajemenPengaturanHandler,
    '/text': initManajemenTextHandler,
    '/database-control-size': initDatabaseControlSizeHandler,
    '/reset-data': initDatabaseResetDataHandler,
    '/kontak': initKontakHandler,
    '/tamu': initTamuHandler,
    '/staf': initStafHandler,
    '/analytics': initAnalyticsHandler,
    '/database': initDatabaseHandler,
    '/login': initLoginHandler
};

const ADMIN_ONLY_ROUTES = [
    '/tamu',
    '/staf',
    '/analytics',
    '/manajemen',
    '/manajemen-produk',
    '/database',
    '/database-control-size',
    '/manajemen-pengaturan',
    '/manajemen-galeri',
    '/manajemen-berita',
    '/manajemen-detail-unit',
    '/text',
    '/control-size',
    '/reset-data'
];

function isCurrentUserAdmin() {
    const role = String(localStorage.getItem('user_role') || '').trim().toLowerCase();
    return role === 'administrator';
}

function setRunningTextVisibility(hide = false) {
    const runningTextEl = document.getElementById('global-running-text-container');
    if (runningTextEl) {
        runningTextEl.classList.toggle('hidden', Boolean(hide));
        runningTextEl.style.display = hide ? 'none' : '';
    }
    if (typeof window.syncLoginRunningTextBottom === 'function') {
        window.syncLoginRunningTextBottom(Boolean(hide));
    }
    if (!hide && typeof window.syncRunningTextPosition === 'function') {
        window.syncRunningTextPosition(false);
    }
}

function syncPublicNavbarActiveState(path) {
    const navRoot = document.getElementById('global-public-navbar') || document.getElementById('public-navbar');
    if (!navRoot) return;

    const normalizedPath = String(path || '/').toLowerCase();
    const links = navRoot.querySelectorAll('a[href], button[data-route], a[data-route]');

    links.forEach(el => {
        const rawHref = String(el.getAttribute('href') || '').trim().toLowerCase();
        const rawRouteAttr = String(el.getAttribute('data-route') || '').trim().toLowerCase();
        const targetRoute = rawRouteAttr
            ? (rawRouteAttr.startsWith('/') ? rawRouteAttr : `/${rawRouteAttr}`)
            : rawHref.startsWith('#')
                ? rawHref.slice(1).split('?')[0]
                : '';

        if (!targetRoute) return;

        const isMatch = targetRoute === normalizedPath;

        el.classList.toggle('is-active', isMatch);
        el.classList.toggle('active', isMatch);
        el.classList.remove('underline', 'underline-offset-8', 'decoration-2', 'decoration-[#c87d32]');
        if (isMatch) {
            el.setAttribute('aria-current', 'page');
        } else {
            el.removeAttribute('aria-current');
        }
    });
}

function syncGlobalPublicChrome(path, isPublicLanding) {
    const publicNavbar = document.getElementById('global-public-navbar') || document.getElementById('public-navbar');
    const publicFooter = document.getElementById('global-public-footer') || document.getElementById('public-footer');

    if (publicNavbar) {
        publicNavbar.classList.toggle('hidden', !isPublicLanding);
        publicNavbar.style.display = isPublicLanding ? '' : 'none';
    }
    if (publicFooter) {
        publicFooter.style.display = '';
        if (isPublicLanding) {
            publicFooter.classList.remove('hidden');
        } else {
            publicFooter.classList.add('hidden');
        }
    }

    if (typeof window.syncGlobalPublicNavbar === 'function') {
        window.syncGlobalPublicNavbar(isPublicLanding, path);
    }
    if (typeof window.syncGlobalPublicChrome === 'function') {
        window.syncGlobalPublicChrome({ path, isPublicLanding });
    }
    if (typeof window.applyPublicSettings === 'function') {
        window.applyPublicSettings({ path, isPublicLanding });
    }
    if (typeof window.syncGlobalPublicUserAvatar === 'function') {
        window.syncGlobalPublicUserAvatar();
    }

    syncPublicNavbarActiveState(path);

    document.dispatchEvent(new CustomEvent('agahta:route-change', {
        detail: { path, isPublicLanding }
    }));
}

function syncAdminMenuUI(path, isPublicLanding, hideRunningText = false) {
    if (typeof window.applyRoleMenuVisibility === 'function') {
        window.applyRoleMenuVisibility();
    }
    if (typeof window.syncActiveNav === 'function') {
        window.syncActiveNav();
    }
    syncGlobalPublicChrome(path, isPublicLanding);
    syncPublicNavbarActiveState(path);
    setRunningTextVisibility(hideRunningText);
    requestAnimationFrame(() => {
        syncPublicNavbarActiveState(path);
        setRunningTextVisibility(hideRunningText);
    });
}

let activeViewCleanup = null;
let renderSeq = 0;
let authSeq = 0;
let isLoggingOut = false;

function runActiveViewCleanup() {
    if (typeof activeViewCleanup === 'function') {
        try {
            activeViewCleanup();
        } catch (err) {
            console.warn("Cleanup view sebelumnya gagal:", err);
        }
        activeViewCleanup = null;
    }
}

window.handleLogout = () => {
    if (isLoggingOut) return;
    isLoggingOut = true;

    signOut(auth)
        .then(() => {
            runActiveViewCleanup();
            localStorage.clear();
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.style.display = '';
            if (location.hash !== '#/login') {
                location.hash = '#/login';
            } else {
                router();
            }
        })
        .catch(error => {
            console.error("Gagal keluar:", error);
        })
        .finally(() => {
            isLoggingOut = false;
        });
};

function appContainerHasContent() {
    const appEl = document.getElementById('app');
    return Boolean(appEl && appEl.children.length > 0);
}

export async function router() {
    ensureGlobalScrollbarHiddenStyle();
    const currentSeq = ++renderSeq;
    let path = extractRoutePath();

    if (Object.prototype.hasOwnProperty.call(routeAliases, path)) {
        const queryIdx = String(location.hash || "").indexOf("?");
        const querySuffix = queryIdx !== -1 ? String(location.hash).slice(queryIdx) : "";
        path = routeAliases[path];
        const normalizedHash = `#${path}${querySuffix}`;
        if (location.hash.toLowerCase() !== normalizedHash.toLowerCase()) {
            location.hash = normalizedHash;
            return;
        }
    }

    if (!Object.prototype.hasOwnProperty.call(routes, path)) {
        path = '/';
    }

    const appContainer = document.getElementById('app');
    const sidebar = document.getElementById('sidebar');
    const headerEl = document.querySelector('header:not(#global-public-navbar):not(#public-navbar)');
    const bottomNav = document.getElementById('bottom-nav');

    const isLoggedIn = Boolean(localStorage.getItem('user_email') || auth.currentUser);
    if (!isLoggedIn && path !== '/login') {
        if (location.hash !== '#/login') {
            location.hash = '#/login';
            return;
        }
        path = '/login';
    }

    if (ADMIN_ONLY_ROUTES.includes(path) && !isCurrentUserAdmin()) {
        if (location.hash !== '#/') {
            location.hash = '#/';
            return;
        }
        path = '/';
    }

    runActiveViewCleanup();

    const isPublicLanding = PUBLIC_LANDING_ROUTES.includes(path);
    const shouldHideRunningText = path === '/login' || isPublicLanding;

    if (path === '/login') {
        if (sidebar) sidebar.style.display = 'none';
        if (headerEl) headerEl.classList.add('hidden');
        if (bottomNav) bottomNav.classList.add('hidden');
        setRunningTextVisibility(true);
        if (appContainer) {
            appContainer.style.height = "";
            appContainer.className = "agahta-no-scrollbar flex-1 flex flex-col min-h-screen overflow-y-auto p-0 m-0 bg-transparent";
        }
    } else if (isPublicLanding) {
        if (sidebar) sidebar.style.display = 'none';
        if (headerEl) headerEl.classList.add('hidden');
        if (bottomNav) bottomNav.classList.add('hidden');
        setRunningTextVisibility(true);
        if (appContainer) {
            appContainer.style.height = "";
            appContainer.className = "agahta-no-scrollbar flex-1 min-h-0 overflow-y-auto p-0 m-0 bg-[#f6f3ec] dark:bg-stone-950";
        }
    } else {
        if (sidebar) sidebar.style.display = '';
        if (headerEl) headerEl.classList.remove('hidden');
        if (bottomNav) bottomNav.classList.remove('hidden');
        setRunningTextVisibility(false);
        if (appContainer) {
            appContainer.style.height = "";
            appContainer.className = "agahta-no-scrollbar flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-[#f6f3ec] dark:bg-stone-950 pb-28 md:pb-12";
        }
    }

    if (appContainer) {
        const renderFunction = routes[path] || renderHome;
        const initHandler = handlers[path] || initHomeHandler;

        const renderedHtml = await renderFunction();
        if (currentSeq !== renderSeq) return;
        appContainer.innerHTML = renderedHtml;

        const cleanupResult = typeof initHandler === 'function' ? await initHandler() : null;
        if (currentSeq !== renderSeq) {
            if (typeof cleanupResult === 'function') {
                try { cleanupResult(); } catch (_) {}
            }
            return;
        }
        if (typeof cleanupResult === 'function') {
            activeViewCleanup = cleanupResult;
        }
    }

    const activeSidebarPath =
        path === '/database-control-size' || path === '/reset-data'
            ? '/database'
            : path;

    const sidebarLinks = document.querySelectorAll('#sidebar-nav a');
    sidebarLinks.forEach(link => {
        const href = String(link.getAttribute('href') || '').toLowerCase();
        const routeAttr = String(link.getAttribute('data-route') || '').toLowerCase();
        const isActive = href === '#' + activeSidebarPath || (activeSidebarPath === '/' && routeAttr === 'home');
        if (isActive) {
            link.className = "flex items-center gap-3 px-3 py-2.5 rounded-none text-[#4a5a3f] dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/50 font-semibold transition";
        } else {
            link.className = "flex items-center gap-3 px-3 py-2.5 rounded-none text-stone-600 dark:text-stone-300 hover:bg-[#f6f3ec] dark:hover:bg-stone-800 transition";
        }
    });

    syncAdminMenuUI(path, isPublicLanding, shouldHideRunningText);
}

let isAuthListenerInitialized = false;
let isGlobalEventsInitialized = false;

export function initRouter() {
    ensureGlobalScrollbarHiddenStyle();
    if (!isAuthListenerInitialized) {
        isAuthListenerInitialized = true;
        onAuthStateChanged(auth, async (user) => {
            const currentAuthSeq = ++authSeq;
            const hadSessionEmail = Boolean(localStorage.getItem('user_email'));
            let path = extractRoutePath();

            if (!user) {
                if (hadSessionEmail) {
                    runActiveViewCleanup();
                    localStorage.clear();
                }
                if (path !== '/login') {
                    if (location.hash !== '#/login') {
                        location.hash = '#/login';
                    } else {
                        router();
                    }
                } else {
                    syncAdminMenuUI('/login', false, true);
                }
                return;
            }

            let userRole = localStorage.getItem('user_role') || DEFAULT_USER_ROLE;
            const email = String(user.email || "").trim();
            let photoURL = user.photoURL || localStorage.getItem('user_avatar') || "";

            const fallbackPrefix = email.includes('@') ? email.split('@')[0] : (user.displayName || DEFAULT_USER_ROLE);
            let displayName = localStorage.getItem('user_name') || user.displayName || fallbackPrefix;
            displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

            let existingUserDoc = null;
            try {
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (currentAuthSeq !== authSeq) return;
                if (userDocSnap.exists()) {
                    existingUserDoc = userDocSnap.data();
                }
            } catch (err) {
                console.error("Gagal membaca dokumen users:", err);
            }
            if (currentAuthSeq !== authSeq) return;

            const isExistingAdmin = String(existingUserDoc?.role || "").trim().toLowerCase() === "administrator";
            const { isFirstLogin, hasOtherAdmin } = await inspectUsersBootstrap(user.uid);
            if (currentAuthSeq !== authSeq) return;

            const canBootstrapAsAdmin = isFirstLogin || (!hasOtherAdmin && (!existingUserDoc || isExistingAdmin));
            const assignedRole = canBootstrapAsAdmin
                ? "Administrator"
                : (existingUserDoc?.role || DEFAULT_USER_ROLE);

            try {
                const userDocRef = doc(db, "users", user.uid);

                if (existingUserDoc) {
                    if (existingUserDoc.nama) displayName = existingUserDoc.nama;
                    userRole = assignedRole;
                    if (existingUserDoc.photoURL) photoURL = existingUserDoc.photoURL;
                } else {
                    await setDoc(userDocRef, {
                        uid: user.uid,
                        email: email,
                        nama: displayName,
                        photoURL: photoURL,
                        role: assignedRole,
                        createdAt: new Date().toISOString()
                    });
                    userRole = assignedRole;
                }
            } catch (err) {
                console.error("Gagal memuat data pengguna di Firestore:", err);
            }

            if (currentAuthSeq !== authSeq || !auth.currentUser) return;

            const nameParts = displayName.trim().split(/\s+/);
            const initials = nameParts.length > 1
                ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
                : displayName.substring(0, 2).toUpperCase();

            localStorage.setItem('user_name', displayName);
            localStorage.setItem('user_email', email);
            localStorage.setItem('user_role', userRole);
            localStorage.setItem('user_initial', initials);
            if (isSafeAvatarSrc(photoURL)) {
                localStorage.setItem('user_avatar', photoURL);
            }

            const currentPathNow = extractRoutePath();
            const isLandingNow = PUBLIC_LANDING_ROUTES.includes(currentPathNow);
            syncAdminMenuUI(currentPathNow, isLandingNow, currentPathNow === '/login' || isLandingNow);

            const userNameEl = document.getElementById('user-name');
            const userEmailEl = document.getElementById('user-email');
            const userRoleEl = document.getElementById('user-role');
            const mobileNameEl = document.getElementById('mobile-dropdown-name');
            const mobileEmailEl = document.getElementById('mobile-dropdown-email');
            const mobileRoleEl = document.getElementById('mobile-user-role');

            if (userNameEl) userNameEl.textContent = displayName;
            if (userEmailEl) userEmailEl.textContent = email;
            if (userRoleEl) userRoleEl.textContent = userRole;
            if (mobileNameEl) mobileNameEl.textContent = displayName;
            if (mobileEmailEl) mobileEmailEl.textContent = email;
            if (mobileRoleEl) mobileRoleEl.textContent = userRole;

            const userInitialEl = document.getElementById('user-initial');
            if (userInitialEl) {
                if (isSafeAvatarSrc(photoURL)) {
                    const img = document.createElement('img');
                    img.src = photoURL;
                    img.alt = "Profile";
                    img.className = "w-full h-full object-cover rounded-none";
                    img.onerror = function() {
                        userInitialEl.textContent = initials;
                    };
                    userInitialEl.replaceChildren(img);
                } else {
                    userInitialEl.textContent = initials;
                }
            }

            const mobileAvatarImg = document.getElementById('mobile-user-avatar-img');
            if (mobileAvatarImg) {
                if (isSafeAvatarSrc(photoURL)) {
                    mobileAvatarImg.src = photoURL;
                    mobileAvatarImg.classList.remove('hidden');
                    mobileAvatarImg.style.display = 'block';
                } else {
                    mobileAvatarImg.classList.add('hidden');
                    mobileAvatarImg.style.display = 'none';
                }
            }

            path = extractRoutePath();

            if (path === '/login') {
                if (location.hash !== '#/') {
                    location.hash = '#/';
                } else {
                    router();
                }
            } else if (ADMIN_ONLY_ROUTES.includes(path) && !isCurrentUserAdmin()) {
                if (location.hash !== '#/') {
                    location.hash = '#/';
                } else {
                    router();
                }
            } else if (!appContainerHasContent()) {
                router();
            }
        });
    }

    if (!isGlobalEventsInitialized) {
        isGlobalEventsInitialized = true;
        window.addEventListener('hashchange', router);

        const handleLinkClick = e => {
            const linkEl = e.target.closest('[data-link]');
            if (!linkEl) return;
            const targetHash = linkEl.getAttribute('href');
            if (!targetHash || !targetHash.startsWith('#')) return;

            e.preventDefault();
            if (location.hash.toLowerCase() !== targetHash.toLowerCase()) {
                location.hash = targetHash;
            } else {
                router();
            }

            const popup = document.getElementById('mobile-more-popup');
            if (popup) popup.classList.add('hidden');

            if (window.innerWidth < 768) {
                const sidebar = document.getElementById('sidebar');
                const backdrop = document.getElementById('sidebar-backdrop');
                if (sidebar) sidebar.classList.add('-translate-x-full');
                if (backdrop) backdrop.classList.add('hidden');
            }
        };

        const bootRouter = () => {
            const initialPath = extractRoutePath();
            const isLanding = PUBLIC_LANDING_ROUTES.includes(initialPath);
            syncAdminMenuUI(initialPath, isLanding, initialPath === '/login' || isLanding);
            router();
            document.body.addEventListener('click', handleLinkClick);
        };

        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', bootRouter, { once: true });
        } else {
            bootRouter();
        }
    }
}

export default router;