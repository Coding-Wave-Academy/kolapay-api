// =====================================================================
// api.js: KolaPay helper for your team's app.
// Load it BEFORE your own code:
//   <script src="api.js"></script>
//   <script src="app.js"></script>
// Change the three settings below. Nothing else.
// =====================================================================

const API_URL = "https://kolapay-api.onrender.com/v1";
const API_KEY = "kp_team_REPLACE_ME";
const USE_MOCK = false; // true = fake data, works with no internet

// ---------------------------------------------------------------------
// request(): every function below uses this one.
// It adds your key and login token, and turns every problem into
// an error object: { code, message, details }.
// ---------------------------------------------------------------------
async function request(path, method = "GET", body) {
  if (USE_MOCK) return mockRequest(path, method, body);

  const token = localStorage.getItem("kp_token");

  // The free server sleeps when nobody uses it. If a request is slow,
  // tell the page so it can show "Waking up the server...".
  const slowTimer = setTimeout(() => {
    window.dispatchEvent(new Event("api-waking"));
  }, 5000);

  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw { code: "NETWORK_ERROR", message: "You're offline. Check your connection and try again." };
  } finally {
    clearTimeout(slowTimer);
  }

  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) {
    if (data.error.code === "SESSION_EXPIRED") localStorage.removeItem("kp_token");
    throw data.error; // always { code, message, details }
  }
  return data;
}

// ---------------------------------------------------------------------
// The functions your app calls. Every one returns a promise: use await.
// ---------------------------------------------------------------------

// Log in with an account ID and a 4-digit PIN (both as text).
async function login(accountId, pin) {
  const data = await request("/auth/login", "POST", { accountId, pin });
  localStorage.setItem("kp_token", data.token);
  return data.account; // { id, name, balance }
}

function logout() {
  localStorage.removeItem("kp_token");
}

function isLoggedIn() {
  return Boolean(localStorage.getItem("kp_token")) || USE_MOCK;
}

// { id, name, balance, currency }
const getMe = () => request("/me");

// type: "", "sent" or "received". search: a name or an amount.
// Returns { data: [transactions], summary: { sent, received, fees, count } }
const getTransactions = (type = "", search = "") =>
  request(`/transactions?type=${type}&search=${encodeURIComponent(search)}`);

// { amount, fee, total, canAfford, balance }
const getFee = (amount) => request(`/fees?amount=${amount}`);

// { id, name } of any account, e.g. lookupAccount("KP-0107")
const lookupAccount = (accountId) => request(`/accounts/${accountId}`);

// amount must be a NUMBER: use Number(input.value) first.
// Returns { transaction, balance }
const sendMoney = (to, amount, note = "") => request("/transfers", "POST", { to, amount, note });

// { data: [{ id, accountId, name, favourite }] }
const getContacts = (search = "") => request(`/contacts?search=${encodeURIComponent(search)}`);
const addContact = (accountId, name = "") => request("/contacts", "POST", { accountId, name });
const setFavourite = (contactId, favourite) => request(`/contacts/${contactId}`, "PATCH", { favourite });
const removeContact = (contactId) => request(`/contacts/${contactId}`, "DELETE");

// Shows 25000 as "25,000 FCFA".
const formatFcfa = (amount) => `${amount.toLocaleString("en-US")} FCFA`;

// =====================================================================
// MOCK MODE: fake data that follows the same rules as the real API.
// You don't need to read below this line until Day 7.
// =====================================================================

const mock = {
  me: { id: "KP-0042", name: "Nkeng Ashu", balance: 25000 },
  people: {
    "KP-0088": "Brenda Fon", "KP-0107": "Ayuk Eta", "KP-0031": "Mbah Divine",
    "KP-0190": "Tabe Ndip", "KP-0154": "Mami Clara", "KP-0213": "Bih Grace",
  },
  contacts: [
    { id: 1, accountId: "KP-0088", name: "Brenda Fon", favourite: true },
    { id: 2, accountId: "KP-0107", name: "Ayuk Eta", favourite: true },
    { id: 3, accountId: "KP-0031", name: "Mbah Divine", favourite: true },
    { id: 4, accountId: "KP-0190", name: "Tabe Ndip", favourite: true },
    { id: 5, accountId: "KP-0154", name: "Mami Clara", favourite: false },
    { id: 6, accountId: "KP-0213", name: "Bih Grace", favourite: false },
  ],
  transactions: [
    ["sent", "KP-0088", 5000, 1, "Lunch"],
    ["received", "KP-0107", 2500, 3, ""],
    ["sent", "KP-0031", 12000, 25, "Rent share"],
    ["received", "KP-0190", 800, 30, ""],
    ["sent", "KP-0154", 1500, 48, "Eru at Buea market"],
    ["received", "KP-0213", 10000, 54, ""],
  ],
  nextId: 7,
};

function mockFee(amount) {
  if (amount <= 5000) return 50;
  if (amount <= 50000) return 250;
  return 500;
}

function mockTransaction([type, other, amount, hoursAgo, note], index) {
  const fee = type === "sent" ? mockFee(amount) : 0;
  return {
    id: `TX-MOCK-${String(index + 1).padStart(4, "0")}`,
    type, amount, fee, total: amount + fee,
    counterparty: { id: other, name: mock.people[other] || other },
    note,
    createdAt: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
  };
}

function mockError(code, message, details) {
  return { code, message, details };
}

async function mockRequest(path, method, body = {}) {
  await new Promise((resolve) => setTimeout(resolve, 300)); // feels like a real network
  const url = new URL(path, "http://mock");
  const route = `${method} ${url.pathname}`;
  const q = (name) => url.searchParams.get(name) || "";
  const all = mock.transactions.map(mockTransaction);

  if (route === "POST /auth/login") {
    if (body.pin !== "1234") throw mockError("INVALID_PIN", "Wrong PIN. 2 attempts left. (Mock PIN is 1234)", { attemptsLeft: 2 });
    return { token: "mock-token", expiresAt: new Date(Date.now() + 8 * 3600000).toISOString(), account: { ...mock.me } };
  }
  if (route === "GET /me") return { ...mock.me, currency: "XAF" };

  if (route === "GET /transactions") {
    const search = q("search").toLowerCase().replace(/,/g, "");
    const data = all
      .filter((t) => !q("type") || t.type === q("type"))
      .filter((t) => !search || t.counterparty.name.toLowerCase().includes(search) || String(t.amount).startsWith(search))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const week = all.filter((t) => Date.now() - Date.parse(t.createdAt) < 7 * 86400000);
    const sum = (list) => list.reduce((total, t) => total + t.amount, 0);
    const sent = week.filter((t) => t.type === "sent");
    return {
      data,
      summary: {
        sent: sum(sent),
        received: sum(week.filter((t) => t.type === "received")),
        fees: sent.reduce((total, t) => total + t.fee, 0),
        count: week.length,
      },
    };
  }

  if (route === "GET /fees") {
    const amount = Number(q("amount"));
    const fee = mockFee(amount);
    return { amount, fee, total: amount + fee, canAfford: mock.me.balance >= amount + fee, balance: mock.me.balance };
  }

  if (method === "GET" && url.pathname.startsWith("/accounts/")) {
    const id = url.pathname.split("/")[2].toUpperCase();
    if (!mock.people[id]) throw mockError("ACCOUNT_NOT_FOUND", `No account found with ID ${id}.`, { accountId: id });
    return { id, name: mock.people[id] };
  }

  if (route === "POST /transfers") {
    const { to, amount, note } = body;
    if (typeof amount !== "number" || !Number.isInteger(amount)) {
      throw mockError("VALIDATION_ERROR", "Amount must be a number, not text. Use Number() before sending.", { field: "amount" });
    }
    if (amount < 100) throw mockError("AMOUNT_TOO_SMALL", "The minimum transfer is 100 FCFA.", { min: 100 });
    if (amount > 500000) throw mockError("AMOUNT_TOO_LARGE", "The maximum transfer is 500,000 FCFA.", { max: 500000 });
    if (to === mock.me.id) throw mockError("SELF_TRANSFER", "You can't send money to your own account.");
    if (!mock.people[to]) throw mockError("ACCOUNT_NOT_FOUND", `No account found with ID ${to}.`, { accountId: to });
    const total = amount + mockFee(amount);
    if (total > mock.me.balance) {
      const needed = total - mock.me.balance;
      throw mockError("INSUFFICIENT_FUNDS",
        `You need ${formatFcfa(needed)} more. Your balance is ${formatFcfa(mock.me.balance)}.`,
        { total, balance: mock.me.balance, needed });
    }
    mock.me.balance -= total;
    mock.transactions.unshift(["sent", to, amount, 0, note || ""]);
    const transaction = mockTransaction(mock.transactions[0], mock.nextId++ - 1);
    return { transaction, balance: mock.me.balance };
  }

  if (route === "GET /contacts") {
    const search = q("search").toLowerCase();
    const data = mock.contacts
      .filter((c) => !search || c.name.toLowerCase().includes(search) || c.accountId.toLowerCase().includes(search))
      .sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));
    return { data };
  }

  if (route === "POST /contacts") {
    const accountId = String(body.accountId || "").toUpperCase();
    if (!mock.people[accountId]) throw mockError("ACCOUNT_NOT_FOUND", `No account found with ID ${accountId}.`, { accountId });
    const existing = mock.contacts.find((c) => c.accountId === accountId);
    if (existing) throw mockError("CONTACT_EXISTS", "This person is already in your contacts.", { contactId: existing.id });
    const contact = { id: mock.contacts.length + 1, accountId, name: body.name || mock.people[accountId], favourite: false };
    mock.contacts.push(contact);
    return contact;
  }

  if (url.pathname.startsWith("/contacts/")) {
    const id = Number(url.pathname.split("/")[2]);
    const contact = mock.contacts.find((c) => c.id === id);
    if (!contact) throw mockError("NOT_FOUND", "That contact was not found.");
    if (method === "PATCH") {
      Object.assign(contact, body);
      return contact;
    }
    if (method === "DELETE") {
      mock.contacts = mock.contacts.filter((c) => c.id !== id);
      return null;
    }
  }

  throw mockError("NOT_FOUND", `${method} ${url.pathname} was not found.`);
}
