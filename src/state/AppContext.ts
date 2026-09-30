import { ApiRepository } from '../repositories/ApiRepository';
import { ApiSettingsRepository } from '../repositories/ApiSettingsRepository';
import { ApiAuthRepository } from '../repositories/ApiAuthRepository';
import { WahaApiRepository } from '../repositories/WahaApiRepository';
import type { IRepository } from '../repositories/IRepository';
import { PricingService } from '../services/PricingService';
import { StockService } from '../services/StockService';
import { OrderService } from '../services/OrderService';
import { CustomerService } from '../services/CustomerService';
import { CrmService, type CrmRepositories } from '../services/CrmService';
import { WhatsappService } from '../services/WhatsappService';
import type {
	Ingredient, RecipeComponent, Product, Customer, Order, StockMovement
} from '../domain/types';
import type {
	User, Contact, Pipeline, Stage, Deal, Task, QuickReply,
	CalendarEvent, Conversation, Message, CatalogProduct,
	CrmActivity, ConversationNote, Tag, AppointmentType
} from '../domain/crm';

type CrmRepoBundle = CrmRepositories & {
	users: IRepository<User>;
	auth: ApiAuthRepository;
	waha: WahaApiRepository;
};

// The ONLY place that knows concrete classes. Everything downstream
// (services, views) is handed interfaces/instances, never `new`s
// a repository itself. Data now lives in Cloudflare D1, reached through
// the Worker's /api routes — swapping that again later means editing
// only this file (and the matching /src/pages/api routes).
export class AppContext {
	private readonly erpRepos = this.buildErpRepos();
	private readonly crmRepos = this.buildCrmRepos();

	readonly ingredients: IRepository<Ingredient> = this.erpRepos.ingredients;
	readonly components: IRepository<RecipeComponent> = this.erpRepos.components;
	readonly products: IRepository<Product> = this.erpRepos.products;
	readonly customers: IRepository<Customer> = this.erpRepos.customers;
	readonly orders: IRepository<Order> = this.erpRepos.orders;
	readonly movements: IRepository<StockMovement> = this.erpRepos.movements;
	readonly settings: ApiSettingsRepository = this.erpRepos.settings;

	readonly users: IRepository<User> = this.crmRepos.users;
	readonly contacts: IRepository<Contact> = this.crmRepos.contacts;
	readonly pipelines: IRepository<Pipeline> = this.crmRepos.pipelines;
	readonly stages: IRepository<Stage> = this.crmRepos.stages;
	readonly deals: IRepository<Deal> = this.crmRepos.deals;
	readonly tasks: IRepository<Task> = this.crmRepos.tasks;
	readonly quickReplies: IRepository<QuickReply> = this.crmRepos.quickReplies;
	readonly events: IRepository<CalendarEvent> = this.crmRepos.events;
	readonly conversations: IRepository<Conversation> =
		this.crmRepos.conversations;
	readonly messages: IRepository<Message> = this.crmRepos.messages;
	readonly catalog: IRepository<CatalogProduct> = this.crmRepos.catalog;
	readonly activities: IRepository<CrmActivity> = this.crmRepos.activities;
	readonly notes: IRepository<ConversationNote> = this.crmRepos.notes;
	readonly tags: IRepository<Tag> = this.crmRepos.tags;
	readonly appointmentTypes: IRepository<AppointmentType> =
		this.crmRepos.appointmentTypes;
	readonly auth: ApiAuthRepository = this.crmRepos.auth;
	readonly waha: WahaApiRepository = this.crmRepos.waha;

	private readonly services = this.buildServices();

	readonly pricing: PricingService = this.services.pricing;
	readonly stock: StockService = this.services.stock;
	readonly order: OrderService = this.services.order;
	readonly customer: CustomerService = this.services.customer;
	readonly crm: CrmService = this.services.crm;
	readonly whatsapp: WhatsappService = this.services.whatsapp;

	private buildErpRepos(): {
		ingredients: IRepository<Ingredient>;
		components: IRepository<RecipeComponent>;
		products: IRepository<Product>;
		customers: IRepository<Customer>;
		orders: IRepository<Order>;
		movements: IRepository<StockMovement>;
		settings: ApiSettingsRepository;
	} {
		const token = () => this.auth.token();
		return {
			ingredients: new ApiRepository<Ingredient>('/api/ingredients', token),
			components: new ApiRepository<RecipeComponent>('/api/components', token),
			products: new ApiRepository<Product>('/api/products', token),
			customers: new ApiRepository<Customer>('/api/customers', token),
			orders: new ApiRepository<Order>('/api/orders', token),
			movements: new ApiRepository<StockMovement>(
				'/api/stock-movements', token
			),
			settings: new ApiSettingsRepository('/api/settings')
		};
	}

	private buildCrmRepos(): CrmRepoBundle {
		const token = () => this.auth.token();
		const api = <T extends { id: string }>(path: string) =>
			new ApiRepository<T>(path, token);
		return {
			users: api<User>('/api/users'),
			contacts: api<Contact>('/api/crm/contacts'),
			pipelines: api<Pipeline>('/api/crm/pipelines'),
			stages: api<Stage>('/api/crm/stages'),
			deals: api<Deal>('/api/crm/deals'),
			tasks: api<Task>('/api/crm/tasks'),
			quickReplies: api<QuickReply>('/api/crm/quick-replies'),
			events: api<CalendarEvent>('/api/crm/calendar-events'),
			conversations: api<Conversation>('/api/crm/conversations'),
			messages: api<Message>('/api/crm/messages'),
			catalog: api<CatalogProduct>('/api/crm/catalog-products'),
			activities: api<CrmActivity>('/api/crm/activities'),
			notes: api<ConversationNote>('/api/crm/conversation-notes'),
			tags: api<Tag>('/api/crm/tags'),
			appointmentTypes: api<AppointmentType>('/api/crm/appointment-types'),
			auth: new ApiAuthRepository(),
			waha: new WahaApiRepository('/api/whatsapp', token)
		};
	}

	private buildServices(): {
		pricing: PricingService;
		stock: StockService;
		order: OrderService;
		customer: CustomerService;
		crm: CrmService;
		whatsapp: WhatsappService;
	} {
		const pricing = new PricingService(this.ingredients, this.components);
		const stock = new StockService(
			this.ingredients, this.components, this.products, this.movements
		);
		const order = new OrderService(this.orders, stock);
		const customer = new CustomerService(this.orders, order);
		const crm = new CrmService(this.buildCrmRepositories());
		const whatsapp = new WhatsappService(
			this.waha, this.messages, this.conversations
		);
		return { pricing, stock, order, customer, crm, whatsapp };
	}

	private buildCrmRepositories(): CrmRepositories {
		return {
			contacts: this.contacts,
			pipelines: this.pipelines,
			stages: this.stages,
			deals: this.deals,
			tasks: this.tasks,
			quickReplies: this.quickReplies,
			events: this.events,
			conversations: this.conversations,
			messages: this.messages,
			catalog: this.catalog,
			activities: this.activities,
			notes: this.notes,
			appointmentTypes: this.appointmentTypes,
			tags: this.tags
		};
	}

	// Hydrates every repository's cache from D1 in parallel. Called once by
	// main.ts before the app shell is rendered.
	async loadAll(): Promise<void> {
		await this.loadAllOf([
			this.ingredients, this.components, this.products,
			this.customers, this.orders, this.movements, this.settings,
			this.users, this.contacts, this.pipelines, this.stages,
			this.deals, this.tasks, this.quickReplies, this.events,
			this.conversations, this.messages, this.catalog,
			this.activities, this.notes, this.tags, this.appointmentTypes,
			this.auth
		]);
	}

	private async loadAllOf(
		repos: Array<{ load(): Promise<void> }>
	): Promise<void> {
		await Promise.all(repos.map((repo) => repo.load()));
	}
}