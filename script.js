/* ===== Grand Stay – Hotel Management System ===== */

const STORE_KEY = "hotel_mgmt_v1";
const CURRENCY = "₹";

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
  nextRoomId: 7,
  nextBookingId: 1,
});

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : seedData();
  } catch {
    return seedData();
  }
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
}

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const money = (n) => `${CURRENCY}${Number(n).toLocaleString("en-IN")}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function nightsBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
const roomById = (id) => db.rooms.find((r) => r.id === id);

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

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const total = db.rooms.length;
  const occupied = db.rooms.filter((r) => r.status === "occupied").length;
  const maint = db.rooms.filter((r) => r.status === "maintenance").length;
  const available = total - occupied - maint;
  const revenue = db.bookings.filter((b) => b.status === "checked-out").reduce((s, b) => s + b.total, 0);
  const occRate = total ? Math.round((occupied / total) * 100) : 0;

  const cards = [
    ["Total Rooms", total],
    ["Available", available],
    ["Occupied", occupied],
    ["Occupancy", occRate + "%"],
    ["Revenue", money(revenue)],
    ["Active Bookings", db.bookings.filter((b) => b.status === "booked").length],
  ];
  $("statCards").innerHTML = cards.map(([l, v]) => `<div class="stat"><span>${l}</span><strong>${v}</strong></div>`).join("");

  const t = todayStr();
  const rows = db.bookings.filter(
    (b) => (b.checkIn === t || b.checkOut === t) && b.status !== "cancelled"
  );
  $("todayTable").innerHTML = rows.length
    ? rows
        .map(
          (b) => `<tr><td>${esc(b.guest)}</td><td>${esc(roomById(b.roomId)?.number ?? "-")}</td>
          <td>${b.checkIn}</td><td>${b.checkOut}</td><td><span class="badge ${b.status}">${b.status}</span></td></tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty">No check-ins or check-outs today.</td></tr>`;
}

/* ---------- Rooms ---------- */
function renderRooms() {
  const f = $("roomFilter").value;
  const list = db.rooms.filter((r) => f === "all" || r.status === f);
  $("roomGrid").innerHTML = list.length
    ? list
        .map(
          (r) => `
      <div class="room ${r.status}">
        <h4>Room ${esc(r.number)}</h4>
        <p>${r.type} • ${money(r.price)}/night</p>
        <span class="badge ${r.status}">${r.status}</span>
        <div class="actions">
          ${
            r.status !== "occupied"
              ? `<button class="btn btn-sm btn-amber" onclick="toggleMaintenance(${r.id})">${
                  r.status === "maintenance" ? "Mark Ready" : "Maintenance"
                }</button>`
              : ""
          }
          <button class="btn btn-sm btn-red" onclick="deleteRoom(${r.id})">Delete</button>
        </div>
      </div>`
        )
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
          return `<tr>
            <td>${b.id}</td><td>${esc(b.guest)}</td><td>${esc(roomById(b.roomId)?.number ?? "deleted")}</td>
            <td>${b.checkIn} → ${b.checkOut}</td><td>${money(b.total)}</td>
            <td><span class="badge ${b.status}">${b.status}</span></td><td>${actions}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="7" class="empty">No bookings yet.</td></tr>`;
}

function checkIn(id) {
  const b = db.bookings.find((x) => x.id === id);
  const room = roomById(b.roomId);
  if (room.status === "occupied") return toast("Room is currently occupied");
  b.status = "checked-in";
  room.status = "occupied";
  save();
  toast(`${b.guest} checked in`);
  renderAll();
}
function checkOut(id) {
  const b = db.bookings.find((x) => x.id === id);
  b.status = "checked-out";
  const room = roomById(b.roomId);
  if (room) room.status = "available";
  save();
  toast(`${b.guest} checked out`);
  renderAll();
  openInvoice(id);
}
function cancelBooking(id) {
  if (!confirm("Cancel this booking?")) return;
  db.bookings.find((x) => x.id === id).status = "cancelled";
  save();
  renderAll();
}

/* ---------- Guests ---------- */
function renderGuests() {
  const q = $("guestSearch").value.toLowerCase();
  const map = {};
  db.bookings
    .filter((b) => b.status !== "cancelled")
    .forEach((b) => {
      const key = b.phone;
      map[key] ??= { name: b.guest, phone: b.phone, stays: 0, spent: 0 };
      map[key].stays++;
      if (b.status === "checked-out") map[key].spent += b.total;
    });
  const guests = Object.values(map).filter(
    (g) => g.name.toLowerCase().includes(q) || g.phone.includes(q)
  );
  $("guestTable").innerHTML = guests.length
    ? guests
        .map((g) => `<tr><td>${esc(g.name)}</td><td>${esc(g.phone)}</td><td>${g.stays}</td><td>${money(g.spent)}</td></tr>`)
        .join("")
    : `<tr><td colspan="4" class="empty">No guests found.</td></tr>`;
}
$("guestSearch").addEventListener("input", renderGuests);

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
  const rate = room ? room.price : b.total / b.nights;
  const tax = Math.round(b.total * 0.12);
  box.innerHTML = `
    <h3>🏨 Grand Stay Hotel</h3>
    <p class="sub">Invoice #${String(b.id).padStart(4, "0")} • ${todayStr()}</p>
    <div class="line"><span>Guest</span><span>${esc(b.guest)} (${esc(b.phone)})</span></div>
    <div class="line"><span>Room</span><span>${esc(room?.number ?? "-")} ${room ? "– " + room.type : ""}</span></div>
    <div class="line"><span>Stay</span><span>${b.checkIn} → ${b.checkOut} (${b.nights} nights)</span></div>
    <div class="line"><span>Rate</span><span>${money(rate)} / night</span></div>
    <div class="line"><span>Subtotal</span><span>${money(b.total)}</span></div>
    <div class="line"><span>GST (12%)</span><span>${money(tax)}</span></div>
    <div class="line total"><span>Grand Total</span><span>${money(b.total + tax)}</span></div>`;
}

function openInvoice(id) {
  document.querySelector('[data-page="billing"]').click();
  $("billSelect").value = id;
  showInvoice(id);
}

$("billSelect").addEventListener("change", () => showInvoice(Number($("billSelect").value)));
$("printBtn").addEventListener("click", () => window.print());

/* ---------- Reset ---------- */
$("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset all data to demo defaults?")) return;
  db = seedData();
  save();
  renderAll();
  toast("Data reset");
});

/* ---------- Init ---------- */
function renderAll() {
  renderDashboard();
  renderRooms();
  renderBookings();
  renderGuests();
  renderBilling();
}

setupDateInputs();
renderAll();
