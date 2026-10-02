// Recorte LGPD: o que pertence a um usuario, e so isso.
//
// `contacts` (CRM) e `customers` (ERP) sao tabelas distintas sem chave
// comum — `seed-contact-ana` e `seed-customer-ana` sao a mesma pessoa,
// ligada apenas por nome/telefone/email. Por isso a juncao usa a
// identidade normalizada (`contactFingerprint`), e nao
// `contact.id === customer.id`, que casaria zero linhas e devolveria uma
// exportacao vazia fingindo estar filtrada.
//
// `orders` liga em `customers.id`, entao segue da lista de clientes.
import type {
	Contact, Conversation, Message, Deal, Task, ConsentRecord, User
} from './crm';
import type { Customer, Order } from './types';

export interface LgpdData {
	contacts: Contact[];
	conversations: Conversation[];
	messages: Message[];
	deals: Deal[];
	tasks: Task[];
	customers: Customer[];
	orders: Order[];
	consents: ConsentRecord[];
}

export interface LgpdScope {
	contacts: Contact[];
	conversations: Conversation[];
	messages: Message[];
	deals: Deal[];
	tasks: Task[];
	customers: Customer[];
	orders: Order[];
	consents: ConsentRecord[];
}

// Telefone normalizado > email normalizado > nome normalizado. A ordem importa:
// telefone e' o identificador mais estavel, e cair direto no nome traria
// homonimos para dentro do recorte de outra pessoa.
function identityKeys(person: {
	name: string;
	phone: string;
	email: string;
}): string[] {
	const keys: string[] = [];
	const phone = person.phone.replace(/\D/g, '').replace(/^55(?=\d{10,})/, '');
	if (phone.length >= 8) keys.push(`p:${phone}`);
	const email = person.email.trim().toLowerCase();
	if (email) keys.push(`e:${email}`);
	const name = person.name.trim().toLowerCase();
	if (name) keys.push(`n:${name}`);
	return keys;
}

export function customersForContacts(
	contacts: Contact[],
	customers: Customer[]
): Customer[] {
	const wanted = new Set<string>();
	for (const contact of contacts) {
		for (const key of identityKeys(contact)) wanted.add(key);
	}
	return customers.filter((customer) =>
		identityKeys(customer).some((key) => wanted.has(key))
	);
}

export function scopeForUser(user: User, all: LgpdData): LgpdScope {
	const contacts = all.contacts.filter((c) => c.assignedUserId === user.id);
	const contactIds = new Set(contacts.map((c) => c.id));
	const conversations = all.conversations.filter((c) =>
		contactIds.has(c.contactId)
	);
	const conversationIds = new Set(conversations.map((c) => c.id));
	const customers = customersForContacts(contacts, all.customers);
	const customerIds = new Set(customers.map((c) => c.id));
	return {
		contacts,
		conversations,
		messages: all.messages.filter((m) =>
			conversationIds.has(m.conversationId)
		),
		deals: all.deals.filter((d) => d.assignedUserId === user.id),
		tasks: all.tasks.filter((t) => t.assigneeUserId === user.id),
		customers,
		orders: all.orders.filter((o) => customerIds.has(o.customerId)),
		consents: all.consents.filter(
			(c) => c.subjectId === user.id && c.subjectType === 'user'
		),
	};
}

export function buildLgpdPayload(
	user: User,
	all: LgpdData,
	profile: Record<string, unknown>,
	now: () => string
): Record<string, unknown> {
	const scope = scopeForUser(user, all);
	return {
		profile,
		contacts: scope.contacts,
		conversations: scope.conversations,
		messages: scope.messages,
		deals: scope.deals,
		tasks: scope.tasks,
		customers: scope.customers,
		orders: scope.orders,
		consents: scope.consents,
		exportedAt: now(),
		formatVersion: '1.0',
	};
}