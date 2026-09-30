import { AppContext } from "./state/AppContext";
import { Router } from "./ui/Router";
import { bindNavToggles, renderSidebar, NAV_ENTRIES } from "./ui/Sidebar";
import { renderDashboardView } from "./ui/views/DashboardView";
import { renderIngredientsView } from "./ui/views/IngredientsView";
import { renderComponentsView } from "./ui/views/ComponentsView";
import { renderProductsView } from "./ui/views/ProductsView";
import { renderStockView } from "./ui/views/StockView";
import { renderOrdersView } from "./ui/views/OrdersView";
import { renderCustomersView } from "./ui/views/CustomersView";
import { renderSettingsView } from "./ui/views/SettingsView";
import { renderCrmPainelView } from "./ui/views/crm/CrmPainelView";
import { renderCrmContatosView } from "./ui/views/crm/CrmContatosView";
import { renderCrmInboxView } from "./ui/views/crm/CrmInboxView";
import { renderCrmFunilView } from "./ui/views/crm/CrmFunilView";
import { renderCrmTarefasView } from "./ui/views/crm/CrmTarefasView";
import { renderCrmAgendaView } from "./ui/views/crm/CrmAgendaView";
import { renderCrmCatalogoView } from "./ui/views/crm/CrmCatalogoView";
import { renderCrmRespostasView } from "./ui/views/crm/CrmRespostasView";
import { renderCrmEquipeView } from "./ui/views/crm/CrmEquipeView";
import { renderCrmAtividadesView } from "./ui/views/crm/CrmAtividadesView";
import { renderCrmEtiquetasView } from "./ui/views/crm/CrmEtiquetasView";
import { renderCrmWhatsAppView } from "./ui/views/crm/CrmWhatsAppView";
import { renderLoginView } from "./ui/views/LoginView";
import { qs } from "./ui/dom";
import { initMode, mountThemeToggle } from "./ui/theme";
import {
	mountFreshness, menuKeyFor, setActiveMenu, markDataChanged
} from "./ui/freshness";
import { icon } from "./ui/icons";
import { registerPwa } from "./ui/pwa";
import { pwaInstallable, setupPwaInstall } from "./ui/pwaInstall";
import { setupPwaUpdate } from "./ui/pwaInstall";

type ViewRenderer = (root: HTMLElement, ctx: AppContext) => () => void;

const VIEW_BY_PATH: Record<string, ViewRenderer> = {
	"/": renderCrmPainelView,
	"/contatos": renderCrmContatosView,
	"/inbox": renderCrmInboxView,
	"/funil": renderCrmFunilView,
	"/atividades": renderCrmAtividadesView,
	"/tarefas": renderCrmTarefasView,
	"/agenda": renderCrmAgendaView,
	"/catalogo": renderCrmCatalogoView,
	"/respostas": renderCrmRespostasView,
	"/etiquetas": renderCrmEtiquetasView,
	"/equipe": renderCrmEquipeView,
	"/login": renderLoginView,
	"/whatsapp": renderCrmWhatsAppView,
	"/atelie/painel": renderDashboardView,
	"/atelie/ingredientes": renderIngredientsView,
	"/atelie/components": renderComponentsView,
	"/atelie/produtos": renderProductsView,
	"/atelie/estoque": renderStockView,
	"/atelie/pedidos": renderOrdersView,
	"/atelie/clientes": renderCustomersView,
	"/atelie/configuracoes": renderSettingsView,
};

// Old flat routes (pre-CRM) resolve to the Ateliê section, so bookmarks /
// saved links keep working.
const LEGACY_TO_ATELIE: Record<string, string> = {
	"/dashboard": "/atelie/painel",
	"/ingredientes": "/atelie/ingredientes",
	"/components": "/atelie/components",
	"/produtos": "/atelie/produtos",
	"/estoque": "/atelie/estoque",
	"/pedidos": "/atelie/pedidos",
	"/clientes": "/atelie/clientes",
	"/configuracoes": "/atelie/configuracoes",
};

async function boot(): Promise<void> {
	// Re-apply the stored theme choice (`deskcomm-theme`) on every load /
	// reload, so a page coming up without BaseLayout's inline script still
	// honors what the user picked. Idempotent when the script already ran.
	initMode();
	const app = qs<HTMLElement>("#app");
	app.innerHTML = loadingHtml();
	const ctx = new AppContext();
	try {
		await ctx.loadAll();
	} catch (error) {
		app.innerHTML = errorHtml(error);
		return;
	}
	mountApp(app, ctx);
	wirePwa(window);
}

// PWA: registers the service worker, mounts the install button, and watches
// for a freshly installed worker so the user can be moved to the new bundle.
// Failures here must never break the SPA boot.
function wirePwa(win: Window): void {
	const env = {
		secure: win.isSecureContext,
		sw: win.navigator.serviceWorker
	};
	void registerPwa(env)
		.then((registration) => {
			if (!registration) return;
			const container = win.navigator.serviceWorker!;
			setupPwaUpdate(registration as never, {
				controller: container.controller,
				reload: () => win.location.reload()
			});
		})
		.catch(() => {});
	if (pwaInstallable(win)) setupPwaInstall(win);
}

function mountApp(app: HTMLElement, ctx: AppContext): void {
	app.innerHTML = shellHtml();
	mountThemeToggle(qs("#theme-slot"));
	mountFreshness(qs("#page-freshness"));
	subscribeFreshness(ctx);
	const router = new Router();
	const activate = buildActivator(app, ctx, router);

	wireHamburger(app);
	bindNavToggles(qs("#sidebar", app), window.localStorage, () => {
		renderNav(app, ctx, router.currentPath());
	});

	[...Object.keys(VIEW_BY_PATH), ...Object.keys(LEGACY_TO_ATELIE)].forEach(
		(path) => router.register(path, () => activate(path)),
	);
	router.setFallback(() => activate("/"));
	router.start();
}

function subscribeFreshness(ctx: AppContext): void {
	const repos = [
		ctx.ingredients, ctx.components, ctx.products, ctx.customers,
		ctx.orders, ctx.movements, ctx.settings, ctx.users,
		ctx.contacts, ctx.pipelines, ctx.stages, ctx.deals,
		ctx.tasks, ctx.quickReplies, ctx.events, ctx.conversations,
		ctx.messages, ctx.catalog, ctx.activities, ctx.notes,
		ctx.tags, ctx.appointmentTypes, ctx.auth
	];
	repos.forEach((repo) => repo.subscribe(() => markDataChanged()));
}

function buildActivator(
	app: HTMLElement,
	ctx: AppContext,
	router: Router,
): (path: string) => void {
	let disposeCurrentView: (() => void) | null = null;

	const activate = (path: string): void => {
		const resolved = legacyResolve(path);
		disposeCurrentView?.();
		renderNav(app, ctx, resolved);
		qs("#page-title").textContent = titleFor(resolved);
		setActiveMenu(menuKeyFor(resolved));
		disposeCurrentView = VIEW_BY_PATH[resolved](qs("#view-root"), ctx);
		wireFooter(app, ctx, () => activate(router.currentPath()), () =>
			router.currentPath(),
		);
	};
	return activate;
}

function legacyResolve(path: string): string {
	return LEGACY_TO_ATELIE[path] ?? path;
}

function renderNav(
	app: HTMLElement,
	ctx: AppContext,
	path: string,
): void {
	qs("#sidebar-slot").innerHTML =
		renderSidebar(path, ctx, window.localStorage);
	wireNavCloseOnMobile(app);
}

function wireFooter(
	app: HTMLElement,
	ctx: AppContext,
	refresh: () => void,
	currentPath: () => string,
): void {
	app.querySelectorAll<HTMLElement>("[data-foot-logout]").forEach((btn) =>
		btn.addEventListener("click", async () => {
			await ctx.auth.logout();
			refresh();
		}),
	);
	// Remember where the user was when they clicked "Entrar", so the login
	// screen can send them back (see src/ui/views/LoginView.ts returnPath).
	app.querySelectorAll<HTMLElement>("[data-foot-login]").forEach((link) =>
		link.addEventListener("click", () => {
			sessionStorage.setItem("login_return_path", currentPath());
		}),
	);
}

function loadingHtml(): string {
	return (
		`<div style="display:flex;align-items:center;justify-content:` +
		`center;min-height:100vh;color:var(--color-text-subtle);` +
		`font-family:var(--font-atkinson);">Carregando dados…</div>`
	);
}

function errorHtml(error: unknown): string {
	const message = error instanceof Error ? error.message : "Error desconhecido";
	return (
		`<div style="display:flex;align-items:center;justify-content:` +
		`center;min-height:100vh;flex-direction:column;gap:8px;font-family:` +
		`var(--font-atkinson);color:var(--color-error);">
		<strong>Não foi possível carregar os dados.</strong><span ` +
		`style="color:var(--color-text-subtle);font-size:13px;">${message}` +
		`</span></div>`
	);
}

function shellHtml(): string {
	return (
		`<div class="app-shell">
		<aside class="sidebar" id="sidebar"><div id="sidebar-slot"></div></aside>
		<div class="main">
			<div class="topbar">
				<div><button class="hamburger" id="hamburger" aria-label=` +
		`"Menu">${icon('menu')}</button></div>
				<h1 id="page-title" style="flex:1;"></h1>
				<span id="page-freshness"></span>
				<div id="theme-slot"></div>
			</div>
			<div class="content" id="view-root"></div>
		</div></div>`
	);
}

function titleFor(path: string): string {
	return NAV_ENTRIES.find((entry) => entry.path === path)?.label ?? "Painel";
}

// Bound once on mount — re-binding per navigation would stack duplicate
// listeners and cancel each toggle out (each click toggling twice).
function wireHamburger(app: HTMLElement): void {
	const sidebar = qs<HTMLElement>("#sidebar", app);
	qs<HTMLElement>("#hamburger", app).addEventListener("click", () =>
		sidebar.classList.toggle("open"),
	);
}

// Runs after every sidebar re-render; the old nav-item nodes (and their
// listeners) are gone, so this never accumulates duplicates.
function wireNavCloseOnMobile(app: HTMLElement): void {
	const sidebar = qs<HTMLElement>("#sidebar", app);
	app
		.querySelectorAll(".nav-item")
		.forEach((link) =>
			link.addEventListener("click", () =>
				sidebar.classList.remove("open"),
			),
		);
}

boot();
