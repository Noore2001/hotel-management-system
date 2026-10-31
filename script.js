/* ===== Grand Stay – Hotel Management System ===== */

const STORE_KEY = "hotel_mgmt_v1";
const CURRENCY = "₹";
const GST_RATE = 0.12;

const ROLES = ["Manager", "Receptionist", "Housekeeping", "Chef", "Waiter", "Security", "Maintenance", "Accountant"];
const SHIFTS = { Morning: "6 AM – 2 PM", Evening: "2 PM – 10 PM", Night: "10 PM – 6 AM" };
const SERVICE_PRICES = { Restaurant: 500, "Room Service": 400, Laundry: 200, Spa: 1500, Minibar: 250, Transport: 800, Other: 0 };
const HK_TYPES = ["Checkout cleaning", "Regular cleaning", "Deep cleaning", "Linen change", "Maintenance check"];
const EXPENSE_CATEGORIES = ["Utilities", "Supplies", "Food & Beverage", "Repairs", "Marketing", "Other"];

/* ---------- Data layer ---------- */
const seedData = () => ({
  rooms: [
    { id: 1, number: "101", type: "Single", price: 1500, status: "available" },
    { id: 2, number: "102", type: "Single", price: 1500, status: "available" },
    { id: 3, number: "201", type: "Double", price: 2500, status: "available" },
    { id: 4, number: "202", type: "Double", price: 2500, status: "maintenance" },
    { id: 5, number: "301", type: "Deluxe", price: 4000, status: "available" },
    { id: 6, number: "401", type: "Suite", price: 7500, status: "available" },
  ],
  bookings: [],
  staff: [
    { id: 1, name: "Rahul Sharma", role: "Manager", shift: "Morning", phone: "9876500001", email: "rahul@grandstay.com", salary: 45000, joined: "2023-01-15" },
    { id: 2, name: "Priya Nair", role: "Receptionist", shift: "Morning", phone: "9876500002", email: "priya@grandstay.com", salary: 22000, joined: "2023-06-01" },
    { id: 3, name: "Amit Verma", role: "Receptionist", shift: "Night", phone: "9876500003", email: "", salary: 22000, joined: "2024-02-10" },
    { id: 4, name: "Sunita Devi", role: "Housekeeping", shift: "Morning", phone: "9876500004", email: "", salary: 15000, joined: "2023-08-20" },
    { id: 5, name: "Ravi Kumar", role: "Housekeeping", shift: "Evening", phone: "9876500005", email: "", salary: 15000, joined: "2024-05-05" },
    { id: 6, name: "Chef Arjun", role: "Chef", shift: "Evening", phone: "9876500006", email: "", salary: 30000, joined: "2022-11-11" },
  ],
  attendance: {}, // { "YYYY-MM-DD": { staffId: "present" | "absent" | "leave" } }
  housekeeping: [],
  expenses: [],
  nextRoomId: 7,
  nextBookingId: 1,
  nextStaffId: 7,
  nextTaskId: 1,
  nextChargeId: 1,
  nextExpenseId: 1,
});

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    // merge so data saved by the older version still works with the new modules
    return raw ? { ...seedData(), ...JSON.parse(raw) } : seedData();
  } catch {
    return seedData();
  }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable – app keeps working in memory */
  }
}

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const money = (n) => `${CURRENCY}${Number(n).toLocaleString("en-IN")}`;
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const monthStr = () => todayStr().slice(0, 7);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function nightsBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
function fillSelect(el, options, keepValue = true) {
  const prev = el.value;
  el.innerHTML = options.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join("");
  if (keepValue && options.some(([v]) => String(v) === prev)) el.value = prev;
}
const roomById = (id) => db.rooms.find((r) => r.id === id);
const staffById = (id) => db.staff.find((s) => s.id === id);

const chargesTotal = (b) => (b.charges || []).reduce((s, c) => s + c.qty * c.price, 0);
const bookingSubtotal = (b) => b.total + chargesTotal(b);

/* A room is free for [in, out) if no active booking overlaps */
function isRoomFree(roomId, inDate, outDate) {
  const room = roomById(roomId);
  if (!room || room.status === "maintenance") return false;
  return !db.bookings.some(
    (b) =>
      b.roomId === roomId &&
      (b.status === "booked" || b.status === "checked-in") &&
      inDate < b.checkOut &&
      outDate > b.checkIn
  );
}

function downloadCSV(filename, rows) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Navigation ---------- */
document.querySelectorAll(".nav-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.page).classList.add("active");
    renderAll();
  })
);
function goTo(page) {
  document.querySelector(`[data-page="${page}"]`).click();
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const total = db.rooms.length;
  const count = (s) => db.rooms.filter((r) => r.status === s).length;
  const occupied = count("occupied");
  const revenue = db.bookings.filter((b) => b.status === "checked-out").reduce((s, b) => s + bookingSubtotal(b), 0);
  const occRate = total ? Math.round((occupied / total) * 100) : 0;
  const today = todayStr();
  const att = db.attendance[today] || {};
  const present = db.staff.filter((s) => att[s.id] === "present").length;
  const openTasks = db.housekeeping.filter((t) => t.status !== "done").length;

  const cards = [
    ["Total Rooms", total],
    ["Available", count("available")],
    ["Occupied", occupied],
    ["Cleaning / Maintenance", `${count("cleaning")} / ${count("maintenance")}`],
    ["Occupancy", occRate + "%"],
    ["Revenue (all time)", money(revenue)],
    ["Upcoming Bookings", db.bookings.filter((b) => b.status === "booked").length],
    ["Staff Present Today", `${present} / ${db.staff.length}`],
    ["Open Cleaning Tasks", openTasks],
  ];
  $("statCards").innerHTML = cards.map(([l, v]) => `<div class="stat"><span>${l}</span><strong>${v}</strong></div>`).join("");

  const rows = db.bookings.filter((b) => (b.checkIn === today || b.checkOut === today) && b.status !== "cancelled");
  $("todayTable").innerHTML = rows.length
    ? rows
        .map(
          (b) => `<tr><td>${esc(b.guest)}</td><td>${esc(roomById(b.roomId)?.number ?? "-")}</td>
          <td>${b.checkIn}</td><td>${b.checkOut}</td><td><span class="badge ${b.status}">${b.status}</span></td></tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty">No check-ins or check-outs today.</td></tr>`;

  const onDuty = db.staff.filter((s) => att[s.id] === "present");
  $("dutyList").innerHTML = onDuty.length
    ? onDuty.map((s) => `<span class="chip">${esc(s.name)}<small>${esc(s.role)} • ${s.shift}</small></span>`).join("")
    : `<span class="empty">Nobody marked present yet. Mark attendance in the Staff tab.</span>`;
}

/* ---------- Rooms ---------- */
function renderRooms() {
  const f = $("roomFilter").value;
  const list = db.rooms.filter((r) => f === "all" || r.status === f);
  $("roomGrid").innerHTML = list.length
    ? list
        .map((r) => {
          let btn = "";
          if (r.status === "available" || r.status === "maintenance")
            btn = `<button class="btn btn-sm btn-amber" onclick="toggleMaintenance(${r.id})">${
              r.status === "maintenance" ? "Mark Ready" : "Maintenance"
            }</button>`;
          else if (r.status === "cleaning")
            btn = `<button class="btn btn-sm btn-green" onclick="markRoomClean(${r.id})">Mark Clean</button>`;
          return `
      <div class="room ${r.status}">
        <h4>Room ${esc(r.number)}</h4>
        <p>${r.type} • ${money(r.price)}/night</p>
        <span class="badge ${r.status}">${r.status}</span>
        <div class="actions">${btn}<button class="btn btn-sm btn-red" onclick="deleteRoom(${r.id})">Delete</button></div>
      </div>`;
        })
        .join("")
    : `<p class="empty">No rooms found.</p>`;
}

$("roomFilter").addEventListener("change", renderRooms);

$("roomForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const number = $("roomNumber").value.trim();
  if (db.rooms.some((r) => r.number === number)) return toast("Room number already exists");
  db.rooms.push({
    id: db.nextRoomId++,
    number,
    type: $("roomType").value,
    price: Number($("roomPrice").value),
    status: "available",
  });
  save();
  e.target.reset();
  toast("Room added");
  renderAll();
});

function toggleMaintenance(id) {
  const r = roomById(id);
  r.status = r.status === "maintenance" ? "available" : "maintenance";
  save();
  renderAll();
}
function markRoomClean(id) {
  const r = roomById(id);
  r.status = "available";
  db.housekeeping.filter((t) => t.roomId === id && t.status !== "done").forEach((t) => (t.status = "done"));
  save();
  toast(`Room ${r.number} is ready`);
  renderAll();
}
function deleteRoom(id) {
  const hasActive = db.bookings.some((b) => b.roomId === id && ["booked", "checked-in"].includes(b.status));
  if (hasActive) return toast("Room has active bookings");
  if (!confirm("Delete this room?")) return;
  db.rooms = db.rooms.filter((r) => r.id !== id);
  save();
  renderAll();
}

/* ---------- Bookings ---------- */
function setupDateInputs() {
  const t = todayStr();
  $("checkIn").min = t;
  $("checkOut").min = t;
}

function refreshRoomOptions() {
  const inD = $("checkIn").value;
  const outD = $("checkOut").value;
  const sel = $("bookingRoom");
  const prev = sel.value;
  if (!inD || !outD || outD <= inD) {
    sel.innerHTML = `<option value="">Pick valid dates first</option>`;
    $("priceHint").textContent = "Select dates and room to see total.";
    return;
  }
  const free = db.rooms.filter((r) => isRoomFree(r.id, inD, outD));
  sel.innerHTML = free.length
    ? free.map((r) => `<option value="${r.id}">Room ${esc(r.number)} – ${r.type} (${money(r.price)})</option>`).join("")
    : `<option value="">No rooms available</option>`;
  if (free.some((r) => String(r.id) === prev)) sel.value = prev;
  updatePriceHint();
}

function updatePriceHint() {
  const inD = $("checkIn").value, outD = $("checkOut").value;
  const room = roomById(Number($("bookingRoom").value));
  if (room && inD && outD && outD > inD) {
    const n = nightsBetween(inD, outD);
    $("priceHint").textContent = `${n} night(s) × ${money(room.price)} = ${money(n * room.price)}`;
  }
}

["checkIn", "checkOut"].forEach((id) => $(id).addEventListener("change", refreshRoomOptions));
$("bookingRoom").addEventListener("change", updatePriceHint);

$("bookingForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const inD = $("checkIn").value, outD = $("checkOut").value;
  const roomId = Number($("bookingRoom").value);
  if (outD <= inD) return toast("Check-out must be after check-in");
  if (!roomId || !isRoomFree(roomId, inD, outD)) return toast("Room not available");
  const nights = nightsBetween(inD, outD);
  db.bookings.push({
    id: db.nextBookingId++,
    guest: $("guestName").value.trim(),
    phone: $("guestPhone").value.trim(),
    roomId,
    checkIn: inD,
    checkOut: outD,
    nights,
    total: nights * roomById(roomId).price,
    charges: [],
    status: "booked",
  });
  save();
  e.target.reset();
  toast("Booking created");
  renderAll();
});

function renderBookings() {
  refreshRoomOptions();
  const list = [...db.bookings].reverse();
  $("bookingTable").innerHTML = list.length
    ? list
        .map((b) => {
          let actions = "";
          if (b.status === "booked")
            actions = `<button class="btn btn-sm btn-green" onclick="checkIn(${b.id})">Check-in</button>
                       <button class="btn btn-sm btn-red" onclick="cancelBooking(${b.id})">Cancel</button>`;
          else if (b.status === "checked-in")
            actions = `<button class="btn btn-sm btn-amber" onclick="checkOut(${b.id})">Check-out</button>`;
          else if (b.status === "checked-out")
            actions = `<button class="btn btn-sm" onclick="openInvoice(${b.id})">Invoice</button>`;
          const extra = chargesTotal(b);
          return `<tr>
            <td>${b.id}</td><td>${esc(b.guest)}</td><td>${esc(roomById(b.roomId)?.number ?? "deleted")}</td>
            <td>${b.checkIn} → ${b.checkOut}</td>
            <td>${money(bookingSubtotal(b))}${extra ? `<small>incl. ${money(extra)} services</small>` : ""}</td>
            <td><span class="badge ${b.status}">${b.status}</span></td><td>${actions}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="7" class="empty">No bookings yet.</td></tr>`;
}

function checkIn(id) {
  const b = db.bookings.find((x) => x.id === id);
  const room = roomById(b.roomId);
  if (room.status === "occupied") return toast("Room is currently occupied");
  if (room.status === "cleaning") return toast("Room is still being cleaned");
  if (room.status === "maintenance") return toast("Room is under maintenance");
  b.status = "checked-in";
  room.status = "occupied";
  save();
  toast(`${b.guest} checked in`);
  renderAll();
}
function checkOut(id) {
  const b = db.bookings.find((x) => x.id === id);
  b.status = "checked-out";
  b.checkedOutOn = todayStr();
  const room = roomById(b.roomId);
  if (room) {
    room.status = "cleaning";
    db.housekeeping.push({
      id: db.nextTaskId++,
      roomId: room.id,
      type: "Checkout cleaning",
      staffId: pickHousekeeper(),
      notes: `After ${b.guest}`,
      created: todayStr(),
      status: "pending",
    });
  }
  save();
  toast(`${b.guest} checked out – cleaning task created`);
  renderAll();
  openInvoice(id);
}
function cancelBooking(id) {
  if (!confirm("Cancel this booking?")) return;
  db.bookings.find((x) => x.id === id).status = "cancelled";
  save();
  renderAll();
}

/* Least-busy housekeeper, preferring those marked present today */
function pickHousekeeper() {
  const att = db.attendance[todayStr()] || {};
  const hk = db.staff.filter((s) => s.role === "Housekeeping" && att[s.id] !== "absent" && att[s.id] !== "leave");
  if (!hk.length) return null;
  const load = (s) => db.housekeeping.filter((t) => t.staffId === s.id && t.status !== "done").length;
  return hk.sort((a, b) => load(a) - load(b))[0].id;
}

/* ---------- Guests ---------- */
function renderGuests() {
  const q = $("guestSearch").value.toLowerCase();
  const map = {};
  db.bookings
    .filter((b) => b.status !== "cancelled")
    .forEach((b) => {
      map[b.phone] ??= { name: b.guest, phone: b.phone, stays: 0, spent: 0 };
      map[b.phone].stays++;
      if (b.status === "checked-out") map[b.phone].spent += bookingSubtotal(b);
    });
  const guests = Object.values(map).filter((g) => g.name.toLowerCase().includes(q) || g.phone.includes(q));
  $("guestTable").innerHTML = guests.length
    ? guests
        .map((g) => `<tr><td>${esc(g.name)}</td><td>${esc(g.phone)}</td><td>${g.stays}</td><td>${money(g.spent)}</td></tr>`)
        .join("")
    : `<tr><td colspan="4" class="empty">No guests found.</td></tr>`;
}
$("guestSearch").addEventListener("input", renderGuests);

/* ---------- Services / extra charges ---------- */
fillSelect($("svcCategory"), Object.keys(SERVICE_PRICES).map((k) => [k, k]));
$("svcPrice").value = SERVICE_PRICES.Restaurant;
$("svcCategory").addEventListener("change", () => ($("svcPrice").value = SERVICE_PRICES[$("svcCategory").value]));

function renderServices() {
  const active = db.bookings.filter((b) => b.status === "checked-in");
  fillSelect(
    $("svcBooking"),
    active.length
      ? active.map((b) => [b.id, `#${b.id} – ${b.guest} (Room ${roomById(b.roomId)?.number ?? "-"})`])
      : [["", "No checked-in guests"]]
  );

  const rows = [];
  db.bookings.forEach((b) => (b.charges || []).forEach((c) => rows.push({ b, c })));
  rows.sort((x, y) => y.c.id - x.c.id);
  $("serviceTable").innerHTML = rows.length
    ? rows
        .map(
          ({ b, c }) => `<tr>
        <td>${c.date}</td><td>${esc(b.guest)}</td><td>${esc(roomById(b.roomId)?.number ?? "-")}</td>
        <td>${esc(c.category)}</td><td>${esc(c.desc)}</td><td>${c.qty}</td><td>${money(c.qty * c.price)}</td>
        <td>${
          b.status === "checked-in"
            ? `<button class="btn btn-sm btn-red" onclick="deleteCharge(${b.id},${c.id})">Remove</button>`
            : ""
        }</td></tr>`
        )
        .join("")
    : `<tr><td colspan="8" class="empty">No service charges yet.</td></tr>`;
}

$("serviceForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const b = db.bookings.find((x) => x.id === Number($("svcBooking").value));
  if (!b || b.status !== "checked-in") return toast("Select a checked-in guest");
  const category = $("svcCategory").value;
  (b.charges ??= []).push({
    id: db.nextChargeId++,
    category,
    desc: $("svcDesc").value.trim() || category,
    qty: Number($("svcQty").value),
    price: Number($("svcPrice").value),
    date: todayStr(),
  });
  save();
  $("svcDesc").value = "";
  $("svcQty").value = 1;
  toast("Charge added");
  renderAll();
});

function deleteCharge(bookingId, chargeId) {
  const b = db.bookings.find((x) => x.id === bookingId);
  b.charges = b.charges.filter((c) => c.id !== chargeId);
  save();
  renderAll();
}

/* ---------- Housekeeping ---------- */
fillSelect($("hkType"), HK_TYPES.map((t) => [t, t]));
$("hkFilter").addEventListener("change", renderHousekeeping);

function staffOptions(includeNone = true) {
  const sorted = [...db.staff].sort((a, b) => (b.role === "Housekeeping") - (a.role === "Housekeeping"));
  return [...(includeNone ? [["", "Unassigned"]] : []), ...sorted.map((s) => [s.id, `${s.name} (${s.role})`])];
}

function renderHousekeeping() {
  fillSelect($("hkRoom"), db.rooms.map((r) => [r.id, `Room ${r.number}`]));
  fillSelect($("hkStaff"), staffOptions());

  const f = $("hkFilter").value;
  const list = db.housekeeping.filter((t) => f === "all" || t.status === f).sort((a, b) => b.id - a.id);
  $("hkTable").innerHTML = list.length
    ? list
        .map((t) => {
          const opts = staffOptions()
            .map(([v, l]) => `<option value="${v}" ${String(v) === String(t.staffId ?? "") ? "selected" : ""}>${esc(l)}</option>`)
            .join("");
          let actions = "";
          if (t.status === "pending") actions += `<button class="btn btn-sm btn-blue" onclick="setTaskStatus(${t.id},'in-progress')">Start</button>`;
          if (t.status !== "done") actions += `<button class="btn btn-sm btn-green" onclick="setTaskStatus(${t.id},'done')">Done</button>`;
          actions += `<button class="btn btn-sm btn-red" onclick="deleteTask(${t.id})">Delete</button>`;
          return `<tr>
          <td>${esc(roomById(t.roomId)?.number ?? "deleted")}</td><td>${esc(t.type)}</td>
          <td>${t.status === "done" ? esc(staffById(t.staffId)?.name ?? "Unassigned") : `<select onchange="assignTask(${t.id}, this.value)">${opts}</select>`}</td>
          <td>${esc(t.notes)}</td><td>${t.created}</td>
          <td><span class="badge ${t.status}">${t.status}</span></td><td>${actions}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="7" class="empty">No housekeeping tasks.</td></tr>`;
}

$("hkForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const staffVal = $("hkStaff").value;
  db.housekeeping.push({
    id: db.nextTaskId++,
    roomId: Number($("hkRoom").value),
    type: $("hkType").value,
    staffId: staffVal ? Number(staffVal) : null,
    notes: $("hkNotes").value.trim(),
    created: todayStr(),
    status: "pending",
  });
  save();
  $("hkNotes").value = "";
  toast("Task added");
  renderAll();
});

function assignTask(id, staffId) {
  db.housekeeping.find((t) => t.id === id).staffId = staffId ? Number(staffId) : null;
  save();
  toast("Task reassigned");
}
function setTaskStatus(id, status) {
  const t = db.housekeeping.find((x) => x.id === id);
  t.status = status;
  if (status === "done") {
    const room = roomById(t.roomId);
    const stillOpen = db.housekeeping.some((x) => x.roomId === t.roomId && x.status !== "done");
    if (room && room.status === "cleaning" && !stillOpen) {
      room.status = "available";
      toast(`Room ${room.number} is ready`);
    }
  }
  save();
  renderAll();
}
function deleteTask(id) {
  db.housekeeping = db.housekeeping.filter((t) => t.id !== id);
  save();
  renderAll();
}

/* ---------- Staff ---------- */
fillSelect($("staffRole"), ROLES.map((r) => [r, r]));
fillSelect($("staffShift"), Object.entries(SHIFTS).map(([k, v]) => [k, `${k} (${v})`]));
fillSelect($("staffRoleFilter"), [["all", "All roles"], ...ROLES.map((r) => [r, r])]);
$("staffJoin").value = todayStr();

const monthAttendance = (staffId, month) => {
  const out = { present: 0, absent: 0, leave: 0 };
  Object.entries(db.attendance).forEach(([date, day]) => {
    if (date.startsWith(month) && day[staffId]) out[day[staffId]]++;
  });
  return out;
};

function renderStaff() {
  const q = $("staffSearch").value.toLowerCase();
  const role = $("staffRoleFilter").value;
  const today = todayStr();
  const att = db.attendance[today] || {};
  const list = db.staff.filter(
    (s) => (role === "all" || s.role === role) && (s.name.toLowerCase().includes(q) || s.phone.includes(q))
  );
  const btn = (s, status, label, cls) =>
    `<button class="btn btn-sm btn-outline ${att[s.id] === status ? cls : ""}" onclick="markAttendance(${s.id},'${status}')">${label}</button>`;

  $("staffTable").innerHTML = list.length
    ? list
        .map(
          (s) => `<tr>
        <td>${esc(s.name)}<small>Joined ${s.joined}</small></td>
        <td>${esc(s.role)}</td>
        <td>${s.shift}<small>${SHIFTS[s.shift] ?? ""}</small></td>
        <td>${esc(s.phone)}<small>${esc(s.email)}</small></td>
        <td>${money(s.salary)}</td>
        <td>${btn(s, "present", "P", "on-green")}${btn(s, "absent", "A", "on-red")}${btn(s, "leave", "L", "on-amber")}</td>
        <td>${monthAttendance(s.id, monthStr()).present} days</td>
        <td><button class="btn btn-sm" onclick="editStaff(${s.id})">Edit</button>
            <button class="btn btn-sm btn-red" onclick="deleteStaff(${s.id})">Delete</button></td></tr>`
        )
        .join("")
    : `<tr><td colspan="8" class="empty">No staff found.</td></tr>`;
}
$("staffSearch").addEventListener("input", renderStaff);
$("staffRoleFilter").addEventListener("change", renderStaff);

function resetStaffForm() {
  $("staffForm").reset();
  $("staffId").value = "";
  $("staffJoin").value = todayStr();
  $("staffSubmit").textContent = "Add Staff";
  $("staffCancel").hidden = true;
}
$("staffCancel").addEventListener("click", resetStaffForm);

$("staffForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    name: $("staffName").value.trim(),
    role: $("staffRole").value,
    shift: $("staffShift").value,
    phone: $("staffPhone").value.trim(),
    email: $("staffEmail").value.trim(),
    salary: Number($("staffSalary").value),
    joined: $("staffJoin").value,
  };
  const id = Number($("staffId").value);
  if (id) {
    Object.assign(staffById(id), data);
    toast("Staff updated");
  } else {
    db.staff.push({ id: db.nextStaffId++, ...data });
    toast("Staff added");
  }
  save();
  resetStaffForm();
  renderAll();
});

function editStaff(id) {
  const s = staffById(id);
  $("staffId").value = s.id;
  $("staffName").value = s.name;
  $("staffRole").value = s.role;
  $("staffShift").value = s.shift;
  $("staffPhone").value = s.phone;
  $("staffEmail").value = s.email;
  $("staffSalary").value = s.salary;
  $("staffJoin").value = s.joined;
  $("staffSubmit").textContent = "Save Changes";
  $("staffCancel").hidden = false;
  $("staffForm").scrollIntoView({ behavior: "smooth", block: "center" });
}
function deleteStaff(id) {
  if (!confirm("Remove this staff member? Their attendance history is kept in reports only for existing staff.")) return;
  db.staff = db.staff.filter((s) => s.id !== id);
  db.housekeeping.forEach((t) => {
    if (t.staffId === id) t.staffId = null;
  });
  save();
  renderAll();
}
function markAttendance(staffId, status) {
  const today = todayStr();
  db.attendance[today] ??= {};
  if (db.attendance[today][staffId] === status) delete db.attendance[today][staffId];
  else db.attendance[today][staffId] = status;
  save();
  renderAll();
}

/* ---------- Billing ---------- */
function renderBilling() {
  const done = db.bookings.filter((b) => b.status === "checked-out");
  const sel = $("billSelect");
  const prev = sel.value;
  sel.innerHTML = done.length
    ? `<option value="">-- choose --</option>` +
      done.map((b) => `<option value="${b.id}">#${b.id} – ${esc(b.guest)} (${b.checkIn})</option>`).join("")
    : `<option value="">No completed stays yet</option>`;
  if (prev) sel.value = prev;
  showInvoice(Number(sel.value));
}

function showInvoice(id) {
  const b = db.bookings.find((x) => x.id === id);
  const box = $("invoice");
  if (!b) {
    box.textContent = "Select a booking to generate an invoice.";
    return;
  }
  const room = roomById(b.roomId);
  const rate = b.total / b.nights;
  const subtotal = bookingSubtotal(b);
  const tax = Math.round(subtotal * GST_RATE);
  const items = (b.charges || [])
    .map(
      (c) => `<div class="line item"><span>${esc(c.category)} – ${esc(c.desc)} (${c.qty} × ${money(c.price)})</span><span>${money(
        c.qty * c.price
      )}</span></div>`
    )
    .join("");
  box.innerHTML = `
    <h3>🏨 Grand Stay Hotel</h3>
    <p class="sub">Invoice #${String(b.id).padStart(4, "0")} • ${todayStr()}</p>
    <div class="line"><span>Guest</span><span>${esc(b.guest)} (${esc(b.phone)})</span></div>
    <div class="line"><span>Room</span><span>${esc(room?.number ?? "-")} ${room ? "– " + room.type : ""}</span></div>
    <div class="line"><span>Stay</span><span>${b.checkIn} → ${b.checkOut} (${b.nights} nights)</span></div>
    <div class="line"><span>Room charges</span><span>${b.nights} × ${money(rate)} = ${money(b.total)}</span></div>
    ${items ? `<div class="line"><span>Services</span><span>${money(chargesTotal(b))}</span></div>${items}` : ""}
    <div class="line"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="line"><span>GST (${GST_RATE * 100}%)</span><span>${money(tax)}</span></div>
    <div class="line total"><span>Grand Total</span><span>${money(subtotal + tax)}</span></div>`;
}

function openInvoice(id) {
  goTo("billing");
  $("billSelect").value = id;
  showInvoice(id);
}

$("billSelect").addEventListener("change", () => showInvoice(Number($("billSelect").value)));
$("printBtn").addEventListener("click", () => window.print());

/* ---------- Reports & finance ---------- */
fillSelect($("expCategory"), EXPENSE_CATEGORIES.map((c) => [c, c]));
$("reportMonth").value = monthStr();
$("expDate").value = todayStr();
$("reportMonth").addEventListener("change", renderReports);

function payrollFor(month) {
  return db.staff.map((s) => {
    const a = monthAttendance(s.id, month);
    const deduction = Math.round((s.salary / 30) * a.absent);
    return { s, ...a, deduction, net: s.salary - deduction };
  });
}

function renderReports() {
  const month = $("reportMonth").value || monthStr();
  const stays = db.bookings.filter((b) => b.status === "checked-out" && (b.checkedOutOn || b.checkOut).startsWith(month));
  const roomRev = stays.reduce((s, b) => s + b.total, 0);
  const svcRev = stays.reduce((s, b) => s + chargesTotal(b), 0);
  const expenses = db.expenses.filter((e) => e.date.startsWith(month));
  const expTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const payroll = payrollFor(month);
  const payTotal = payroll.reduce((s, p) => s + p.net, 0);
  const profit = roomRev + svcRev - expTotal - payTotal;

  $("reportCards").innerHTML = [
    ["Room Revenue", money(roomRev), ""],
    ["Services Revenue", money(svcRev), ""],
    ["Expenses", money(expTotal), ""],
    ["Payroll", money(payTotal), ""],
    ["Net Profit", money(profit), profit >= 0 ? "good" : "bad"],
    ["Completed Stays", stays.length, ""],
  ]
    .map(([l, v, c]) => `<div class="stat ${c}"><span>${l}</span><strong>${v}</strong></div>`)
    .join("");

  $("payrollTable").innerHTML = payroll.length
    ? payroll
        .map(
          (p) => `<tr><td>${esc(p.s.name)}</td><td>${esc(p.s.role)}</td><td>${money(p.s.salary)}</td>
        <td>${p.present}</td><td>${p.absent}</td><td>${p.leave}</td><td>${money(p.deduction)}</td><td>${money(p.net)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="8" class="empty">No staff added.</td></tr>`;

  $("expenseTable").innerHTML = expenses.length
    ? [...expenses]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(
          (e) => `<tr><td>${e.date}</td><td>${esc(e.category)}</td><td>${esc(e.desc)}</td><td>${money(e.amount)}</td>
        <td><button class="btn btn-sm btn-red" onclick="deleteExpense(${e.id})">Delete</button></td></tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty">No expenses this month.</td></tr>`;
}

$("expenseForm").addEventListener("submit", (e) => {
  e.preventDefault();
  db.expenses.push({
    id: db.nextExpenseId++,
    date: $("expDate").value,
    category: $("expCategory").value,
    desc: $("expDesc").value.trim(),
    amount: Number($("expAmount").value),
  });
  save();
  $("expDesc").value = "";
  $("expAmount").value = "";
  toast("Expense added");
  renderAll();
});
function deleteExpense(id) {
  db.expenses = db.expenses.filter((e) => e.id !== id);
  save();
  renderAll();
}

$("exportBookings").addEventListener("click", () =>
  downloadCSV("bookings.csv", [
    ["ID", "Guest", "Phone", "Room", "Check-in", "Check-out", "Nights", "Room total", "Services", "Status"],
    ...db.bookings.map((b) => [b.id, b.guest, b.phone, roomById(b.roomId)?.number ?? "", b.checkIn, b.checkOut, b.nights, b.total, chargesTotal(b), b.status]),
  ])
);
$("exportStaff").addEventListener("click", () =>
  downloadCSV("staff.csv", [
    ["ID", "Name", "Role", "Shift", "Phone", "Email", "Salary", "Joined"],
    ...db.staff.map((s) => [s.id, s.name, s.role, s.shift, s.phone, s.email, s.salary, s.joined]),
  ])
);
$("exportExpenses").addEventListener("click", () =>
  downloadCSV("expenses.csv", [
    ["Date", "Category", "Description", "Amount"],
    ...db.expenses.map((e) => [e.date, e.category, e.desc, e.amount]),
  ])
);

/* ---------- Reset ---------- */
$("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset all data to demo defaults?")) return;
  db = seedData();
  save();
  resetStaffForm();
  renderAll();
  toast("Data reset");
});

/* ---------- Init ---------- */
function renderAll() {
  renderDashboard();
  renderRooms();
  renderBookings();
  renderGuests();
  renderServices();
  renderHousekeeping();
  renderStaff();
  renderBilling();
  renderReports();
}

setupDateInputs();
renderAll();
